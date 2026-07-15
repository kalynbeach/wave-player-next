import { expect, test } from "bun:test";

import { HtmlMediaPlaybackRuntime } from "@/client/playback/html-media-playback-runtime";
import { parseAssetLocationId } from "@/core/library/ids";

const LOCATION_ID = parseAssetLocationId(
  "location_018f1f2a-3b4c-7d5e-8f90-123456789abc",
);

function fixtureMedia(options: { blocked?: boolean } = {}) {
  const media = document.createElement("audio");
  let loadCount = 0;
  let pauseCount = 0;
  let playCount = 0;

  Object.defineProperties(media, {
    load: {
      configurable: true,
      value: () => {
        loadCount += 1;
      },
    },
    pause: {
      configurable: true,
      value: () => {
        pauseCount += 1;
      },
    },
    play: {
      configurable: true,
      value: async () => {
        playCount += 1;
        if (options.blocked) {
          throw new DOMException("Blocked", "NotAllowedError");
        }

        media.dispatchEvent(new Event("playing"));
      },
    },
  });

  return {
    media,
    loadCount: () => loadCount,
    pauseCount: () => pauseCount,
    playCount: () => playCount,
  };
}

test("maps media lifecycle events into stable playback snapshots", async () => {
  const fixture = fixtureMedia();
  const runtime = new HtmlMediaPlaybackRuntime(fixture.media);
  let notifications = 0;
  runtime.subscribe(() => {
    notifications += 1;
  });

  runtime.load({ locationId: LOCATION_ID, url: `/media/${LOCATION_ID}` });
  expect(runtime.getSnapshot()).toMatchObject({
    status: "loading",
    locationId: LOCATION_ID,
  });
  expect(fixture.loadCount()).toBe(1);

  Object.defineProperty(fixture.media, "duration", {
    configurable: true,
    value: 90,
  });
  fixture.media.currentTime = 12;
  fixture.media.dispatchEvent(new Event("loadedmetadata"));
  expect(runtime.getSnapshot()).toMatchObject({
    status: "ready",
    currentTime: 12,
    duration: 90,
  });

  await runtime.play();
  expect(runtime.getSnapshot().status).toBe("playing");
  runtime.seek(200);
  expect(runtime.getSnapshot().currentTime).toBe(90);
  runtime.setVolume(0.4);
  expect(runtime.getSnapshot().volume).toBe(0.4);

  fixture.media.dispatchEvent(new Event("ended"));
  expect(runtime.getSnapshot().status).toBe("ended");
  expect(notifications).toBeGreaterThan(4);

  runtime.destroy();
  runtime.destroy();
  expect(fixture.pauseCount()).toBeGreaterThan(1);
});

test("surfaces user-gesture playback rejection as a typed error", async () => {
  const fixture = fixtureMedia({ blocked: true });
  const runtime = new HtmlMediaPlaybackRuntime(fixture.media);
  runtime.load({ locationId: LOCATION_ID, url: `/media/${LOCATION_ID}` });

  await expect(runtime.play()).rejects.toThrow("Blocked");
  expect(runtime.getSnapshot()).toMatchObject({
    status: "error",
    error: {
      code: "autoplay_blocked",
      message: "Playback requires a user gesture.",
    },
  });
});

test("closes a provisional audio context when graph creation fails", async () => {
  const fixture = fixtureMedia();
  let closeCount = 0;
  const failedContext = {
    close: async () => {
      closeCount += 1;
    },
    createMediaElementSource: () => {
      throw new Error("Graph unavailable");
    },
  } as unknown as AudioContext;
  const runtime = new HtmlMediaPlaybackRuntime(fixture.media, {
    createAudioContext: () => failedContext,
  });
  runtime.load({ locationId: LOCATION_ID, url: `/media/${LOCATION_ID}` });

  await runtime.play();

  expect(closeCount).toBe(1);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "playing",
    analysisAvailable: false,
    error: null,
  });
});

test("retains an assigned graph and retries resume on the next gesture", async () => {
  const fixture = fixtureMedia();
  let contextCount = 0;
  let closeCount = 0;
  let resumeCount = 0;
  const createFailedResumeContext = () => {
    contextCount += 1;
    const node = {
      connect: () => node,
      disconnect: () => undefined,
    };
    const analyser = {
      ...node,
      fftSize: 2_048,
      frequencyBinCount: 1_024,
      smoothingTimeConstant: 0,
      getByteFrequencyData: () => undefined,
      getFloatTimeDomainData: () => undefined,
    };
    return {
      get state() {
        return resumeCount >= 2 ? "running" : "suspended";
      },
      sampleRate: 48_000,
      destination: node,
      createMediaElementSource: () => node,
      createChannelSplitter: () => node,
      createAnalyser: () => ({ ...analyser }),
      resume: async () => {
        resumeCount += 1;
        if (resumeCount === 1) {
          throw new Error("Resume failed");
        }
      },
      close: async () => {
        closeCount += 1;
      },
    } as unknown as AudioContext;
  };
  const runtime = new HtmlMediaPlaybackRuntime(fixture.media, {
    createAudioContext: createFailedResumeContext,
  });
  runtime.load({ locationId: LOCATION_ID, url: `/media/${LOCATION_ID}` });

  await expect(runtime.play()).rejects.toThrow("Resume failed");
  expect(fixture.playCount()).toBe(0);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "error",
    error: { code: "media_error" },
  });
  await runtime.play();

  expect(contextCount).toBe(1);
  expect(resumeCount).toBe(2);
  expect(closeCount).toBe(0);
  expect(fixture.playCount()).toBe(1);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "playing",
    analysisAvailable: true,
    error: null,
  });
});
