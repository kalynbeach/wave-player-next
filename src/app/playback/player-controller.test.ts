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

function controllerFixture(selected: "alpha" | "beta" | null = null) {
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
    sourceUrl: (selectedTrack) => `/media/${selectedTrack.location.id}`,
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
