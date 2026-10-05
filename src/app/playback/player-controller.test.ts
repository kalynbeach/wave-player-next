import { expect, test } from "bun:test";

import type {
  PlaybackRuntime,
  PlaybackSnapshot,
  PlaybackSource,
  PlayerSession,
  PlayerSessionStore,
} from "@/app/playback/playback-ports";
import { PlayerController } from "@/app/playback/player-controller";
import {
  parseAssetId,
  parseAssetLocationId,
  parseTrackId,
} from "@/core/library/ids";
import type { LibraryTrack } from "@/core/library/library";

const UUIDS = {
  alpha: "018f1f2a-3b4c-7d5e-8f90-123456789abc",
  beta: "018f1f2a-3b4c-7d5e-8f90-123456789abd",
};

function track(name: "alpha" | "beta", available = true): LibraryTrack {
  const uuid = UUIDS[name];
  return {
    id: parseTrackId(`track_${uuid}`),
    title: name === "alpha" ? "Alpha" : "Beta",
    asset: {
      id: parseAssetId(`asset_${uuid}`),
      format: "wav",
      mimeType: "audio/wav",
      fileSizeBytes: 100,
    },
    location: {
      id: parseAssetLocationId(`location_${uuid}`),
      relativePath: `${name}.wav`,
      available,
    },
  };
}

class MemorySessionStore implements PlayerSessionStore {
  session: PlayerSession;

  constructor(session: PlayerSession) {
    this.session = session;
  }

  load(): PlayerSession {
    return this.session;
  }

  save(session: PlayerSession): void {
    this.session = session;
  }
}

class FakePlaybackRuntime implements PlaybackRuntime {
  readonly listeners = new Set<() => void>();
  destroyed = false;
  loaded: PlaybackSource | null = null;
  playCount = 0;
  snapshot: PlaybackSnapshot = {
    status: "idle",
    locationId: null,
    currentTime: 0,
    duration: 120,
    volume: 1,
    error: null,
    analysisAvailable: false,
  };

  destroy(): void {
    this.destroyed = true;
  }

  getSnapshot(): PlaybackSnapshot {
    return this.snapshot;
  }

  load(source: PlaybackSource | null): void {
    this.loaded = source;
    this.snapshot = {
      ...this.snapshot,
      locationId: source?.locationId ?? null,
      status: source ? "ready" : "idle",
      currentTime: 0,
    };
    this.emit();
  }

  pause(): void {
    this.snapshot = { ...this.snapshot, status: "paused" };
    this.emit();
  }

  async play(): Promise<void> {
    this.playCount += 1;
    this.snapshot = { ...this.snapshot, status: "playing" };
    this.emit();
  }

  seek(timeSeconds: number): void {
    this.snapshot = { ...this.snapshot, currentTime: timeSeconds };
    this.emit();
  }

  setVolume(volume: number): void {
    this.snapshot = { ...this.snapshot, volume };
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  end(): void {
    this.snapshot = { ...this.snapshot, status: "ended" };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function controllerFixture(
  selected: "alpha" | "beta" | null = null,
  sourceUrl = (selectedTrack: LibraryTrack) =>
    `/media/${selectedTrack.location.id}`,
) {
  const runtime = new FakePlaybackRuntime();
  const tracks = [track("alpha"), track("beta")];
  const sessionStore = new MemorySessionStore({
    selectedTrackId:
      selected === null ? null : parseTrackId(`track_${UUIDS[selected]}`),
    volume: 0.65,
    activeView: "scene",
  });
  const controller = new PlayerController({
    runtime,
    sessionStore,
    sourceUrl,
  });

  return { controller, runtime, sessionStore, tracks };
}

test("restores selection and volume without autoplay", () => {
  const { controller, runtime, tracks } = controllerFixture("beta");

  controller.setTracks(tracks);

  expect(controller.getSnapshot().selectedTrack?.title).toBe("Beta");
  expect(runtime.loaded?.url).toEndWith(tracks[1]?.location.id ?? "missing");
  expect(runtime.snapshot.volume).toBe(0.65);
  expect(runtime.playCount).toBe(0);
  expect(controller.getRestoredView()).toBe("scene");
});

test("selects, plays, seeks, and moves through available tracks", async () => {
  const { controller, runtime, tracks } = controllerFixture();
  controller.setTracks(tracks);

  await controller.select(
    tracks[0]?.id ?? parseTrackId(`track_${UUIDS.alpha}`),
  );
  expect(runtime.playCount).toBe(1);
  await controller.next();
  expect(controller.getSnapshot().selectedTrack?.title).toBe("Beta");

  runtime.seek(12);
  await controller.previous();
  expect(runtime.snapshot.currentTime).toBe(0);
  expect(controller.getSnapshot().selectedTrack?.title).toBe("Beta");

  await controller.previous();
  expect(controller.getSnapshot().selectedTrack?.title).toBe("Alpha");
});

test("advances to the next available track when playback ends", async () => {
  const { controller, runtime, tracks } = controllerFixture("alpha");
  controller.setTracks(tracks);
  runtime.end();
  await Promise.resolve();

  expect(controller.getSnapshot().selectedTrack?.title).toBe("Beta");
  expect(runtime.snapshot.status).toBe("playing");
});

test("persists volume and card view and disposes idempotently", () => {
  const { controller, runtime, sessionStore } = controllerFixture();

  controller.setVolume(2);
  controller.setActiveView("library");
  controller.destroy();
  controller.destroy();

  expect(sessionStore.session).toMatchObject({
    volume: 1,
    activeView: "library",
  });
  expect(runtime.destroyed).toBe(true);
  expect(runtime.listeners.size).toBe(0);
});

test("keeps an unavailable restored track selected without loading it", () => {
  const { controller, runtime } = controllerFixture("beta");
  controller.setTracks([track("alpha"), track("beta", false)]);

  expect(controller.getSnapshot().selectedTrack?.title).toBe("Beta");
  expect(runtime.loaded).toBeNull();
});

test.each(["playing", "paused"] as const)(
  "refreshes the catalog without interrupting %s playback of an unchanged source",
  async (status) => {
    const { controller, runtime, tracks } = controllerFixture("alpha");
    controller.setTracks(tracks);
    await controller.togglePlayback();
    controller.seek(42);
    if (status === "paused") await controller.togglePlayback();
    const playbackBeforeRefresh = runtime.getSnapshot();
    const renamed = { ...track("alpha"), title: "Updated title" };

    controller.setTracks([track("beta"), renamed]);

    expect(controller.getSnapshot().selectedTrack).toBe(renamed);
    expect(controller.getSnapshot().tracks.map((item) => item.title)).toEqual([
      "Beta",
      "Updated title",
    ]);
    expect(controller.getSnapshot().playback).toEqual(playbackBeforeRefresh);
    expect(runtime.playCount).toBe(1);
  },
);

test("clears playback when a rescan marks the selected source unavailable", async () => {
  const { controller, runtime, tracks } = controllerFixture("alpha");
  controller.setTracks(tracks);
  await controller.togglePlayback();
  controller.seek(42);

  controller.setTracks([track("alpha", false), track("beta")]);

  expect(controller.getSnapshot().selectedTrack?.id).toBe(track("alpha").id);
  expect(runtime.loaded).toBeNull();
  expect(runtime.getSnapshot()).toMatchObject({
    status: "idle",
    currentTime: 0,
  });

  controller.setTracks(tracks);
  expect(runtime.loaded?.locationId).toBe(track("alpha").location.id);
  expect(runtime.getSnapshot().status).toBe("ready");
  expect(runtime.playCount).toBe(1);
});

test("loads a replacement location for the selected track without autoplay", async () => {
  const { controller, runtime, tracks } = controllerFixture("alpha");
  controller.setTracks(tracks);
  await controller.togglePlayback();
  controller.seek(42);
  const replacement = { ...track("alpha"), location: track("beta").location };

  controller.setTracks([replacement]);

  expect(controller.getSnapshot().selectedTrack).toBe(replacement);
  expect(runtime.loaded?.locationId).toBe(replacement.location.id);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "ready",
    currentTime: 0,
  });
  expect(runtime.playCount).toBe(1);
});

test("reloads when a catalog update resolves the same location to a different URL", async () => {
  const { controller, runtime, tracks } = controllerFixture(
    "alpha",
    (selectedTrack) => `/media/${selectedTrack.location.relativePath}`,
  );
  controller.setTracks(tracks);
  await controller.togglePlayback();
  controller.seek(42);
  const relocated = track("alpha");
  relocated.location.relativePath = "renamed.wav";

  controller.setTracks([relocated]);

  expect(runtime.loaded?.url).toBe("/media/renamed.wav");
  expect(runtime.getSnapshot()).toMatchObject({
    status: "ready",
    currentTime: 0,
  });
});

test("falls back without autoplay when the selected track leaves the catalog", async () => {
  const { controller, runtime, sessionStore, tracks } =
    controllerFixture("alpha");
  controller.setTracks(tracks);
  await controller.togglePlayback();
  controller.seek(42);

  controller.setTracks([track("beta")]);

  expect(controller.getSnapshot().selectedTrack?.id).toBe(track("beta").id);
  expect(sessionStore.session.selectedTrackId).toBe(track("beta").id);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "ready",
    currentTime: 0,
  });
  expect(runtime.playCount).toBe(1);

  controller.setTracks([]);
  expect(controller.getSnapshot().selectedTrack).toBeNull();
  expect(runtime.loaded).toBeNull();
});

test("explicitly selecting the current track still restarts playback", async () => {
  const { controller, runtime, tracks } = controllerFixture("alpha");
  controller.setTracks(tracks);
  await controller.togglePlayback();
  controller.seek(42);

  await controller.select(track("alpha").id);

  expect(runtime.getSnapshot()).toMatchObject({
    status: "playing",
    currentTime: 0,
  });
  expect(runtime.playCount).toBe(2);
});
