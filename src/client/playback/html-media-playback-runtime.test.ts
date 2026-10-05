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

function pendingRequest(
  requests: PromiseWithResolvers<void>[],
  index: number,
): PromiseWithResolvers<void> {
  const request = requests[index];
  if (!request) throw new Error(`Expected pending request ${index}.`);
  return request;
}

function pendingMedia() {
  const media = document.createElement("audio");
  const requests: PromiseWithResolvers<void>[] = [];
  let paused = true;

  Object.defineProperties(media, {
    paused: { get: () => paused },
    load: { value: () => undefined },
    pause: {
      value: () => {
        paused = true;
        media.dispatchEvent(new Event("pause"));
      },
    },
    play: {
      value: () => {
        const request = Promise.withResolvers<void>();
        requests.push(request);
        paused = false;
        media.dispatchEvent(new Event("play"));
        return request.promise;
      },
    },
  });

  return { media, requests };
}

function pendingAudioContext() {
  const resumes: PromiseWithResolvers<void>[] = [];
  let closeCount = 0;
  const node = { connect: () => node, disconnect: () => undefined };
  const analyser = {
    ...node,
    fftSize: 2_048,
    frequencyBinCount: 1_024,
    smoothingTimeConstant: 0,
    getByteFrequencyData: () => undefined,
    getFloatTimeDomainData: () => undefined,
  };
  const context = {
    state: "suspended",
    sampleRate: 48_000,
    destination: node,
    createMediaElementSource: () => node,
    createChannelSplitter: () => node,
    createAnalyser: () => ({ ...analyser }),
    resume: () => {
      const request = Promise.withResolvers<void>();
      resumes.push(request);
      return request.promise;
    },
    close: async () => {
      closeCount += 1;
    },
  } as unknown as AudioContext;

  return { context, resumes, closeCount: () => closeCount };
}

test("an aborted previous source does not pause the newly selected source", async () => {
  const { media, requests } = pendingMedia();
  const runtime = new HtmlMediaPlaybackRuntime(media);
  const nextLocation = parseAssetLocationId(
    "location_018f1f2a-3b4c-7d5e-8f90-123456789abd",
  );
  runtime.load({ locationId: LOCATION_ID, url: "/a.wav" });
  const first = runtime.play();
  runtime.load({ locationId: nextLocation, url: "/b.wav" });
  const second = runtime.play();

  pendingRequest(requests, 0).reject(
    new DOMException("Source changed", "AbortError"),
  );
  await expect(first).resolves.toBeUndefined();
  expect(media.paused).toBe(false);
  expect(runtime.getSnapshot()).toMatchObject({
    locationId: nextLocation,
    status: "loading",
    error: null,
  });

  pendingRequest(requests, 1).resolve();
  await second;
  expect(runtime.getSnapshot().status).toBe("playing");
  runtime.destroy();
});

test("a stale successful play does not clear the current source failure", async () => {
  const { media, requests } = pendingMedia();
  const runtime = new HtmlMediaPlaybackRuntime(media);
  runtime.load({ locationId: LOCATION_ID, url: "/a.wav" });
  const first = runtime.play();
  runtime.load({ locationId: LOCATION_ID, url: "/replacement.wav" });
  const second = runtime.play();
  pendingRequest(requests, 1).reject(new Error("Unreadable replacement"));
  await expect(second).rejects.toThrow("Unreadable replacement");
  const failed = runtime.getSnapshot();
  expect(failed).toMatchObject({
    status: "error",
    error: { code: "media_error" },
  });

  pendingRequest(requests, 0).resolve();
  await first;
  expect(runtime.getSnapshot()).toEqual(failed);
  expect(media.paused).toBe(true);
  runtime.destroy();
});

test("a newer play owns the same source while an earlier activation fails", async () => {
  const { media, requests } = pendingMedia();
  const { context, resumes } = pendingAudioContext();
  const runtime = new HtmlMediaPlaybackRuntime(media, {
    createAudioContext: () => context,
  });
  runtime.load({ locationId: LOCATION_ID, url: "/a.wav" });
  const first = runtime.play();
  const second = runtime.play();
  pendingRequest(requests, 1).resolve();
  pendingRequest(resumes, 1).resolve();
  await second;
  expect(runtime.signalProvider.isAvailable()).toBe(true);

  pendingRequest(resumes, 0).reject(new Error("Earlier activation failed"));
  pendingRequest(requests, 0).resolve();
  await expect(first).resolves.toBeUndefined();
  expect(media.paused).toBe(false);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "playing",
    error: null,
    analysisAvailable: true,
  });
  expect(runtime.signalProvider.isAvailable()).toBe(true);
  runtime.destroy();
});

test.each(["resolve", "reject"] as const)(
  "pause cancels a pending play before it can %s",
  async (settlement) => {
    const { media, requests } = pendingMedia();
    const runtime = new HtmlMediaPlaybackRuntime(media);
    runtime.load({ locationId: LOCATION_ID, url: "/a.wav" });
    const playback = runtime.play();
    runtime.pause();
    const paused = runtime.getSnapshot();

    if (settlement === "resolve") pendingRequest(requests, 0).resolve();
    else
      pendingRequest(requests, 0).reject(
        new DOMException("Paused", "AbortError"),
      );
    await expect(playback).resolves.toBeUndefined();
    expect(runtime.getSnapshot()).toEqual(paused);
    expect(media.paused).toBe(true);
    runtime.destroy();
  },
);

test("clearing the source cancels its pending play", async () => {
  const { media, requests } = pendingMedia();
  const runtime = new HtmlMediaPlaybackRuntime(media);
  runtime.load({ locationId: LOCATION_ID, url: "/a.wav" });
  const playback = runtime.play();
  runtime.load(null);
  pendingRequest(requests, 0).resolve();
  await playback;

  expect(runtime.getSnapshot()).toMatchObject({
    status: "idle",
    locationId: null,
    error: null,
  });
  expect(media.paused).toBe(true);
  runtime.destroy();
});

test("destroy during activation cannot reattach analysis or publish playback", async () => {
  const { media, requests } = pendingMedia();
  const { context, resumes, closeCount } = pendingAudioContext();
  const runtime = new HtmlMediaPlaybackRuntime(media, {
    createAudioContext: () => context,
  });
  runtime.load({ locationId: LOCATION_ID, url: "/a.wav" });
  const playback = runtime.play();
  runtime.destroy();
  const disposed = runtime.getSnapshot();
  pendingRequest(resumes, 0).resolve();
  pendingRequest(requests, 0).resolve();
  await playback;

  expect(closeCount()).toBe(1);
  expect(runtime.signalProvider.isAvailable()).toBe(false);
  expect(runtime.getSnapshot()).toEqual(disposed);
  expect(media.paused).toBe(true);
});

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
  expect(fixture.playCount()).toBe(1);
  expect(fixture.pauseCount()).toBe(2);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "error",
    error: { code: "media_error" },
  });
  await runtime.play();

  expect(contextCount).toBe(1);
  expect(resumeCount).toBe(2);
  expect(closeCount).toBe(0);
  expect(fixture.playCount()).toBe(2);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "playing",
    analysisAvailable: true,
    error: null,
  });
});

test("invokes media play before a pending audio-context resume settles", async () => {
  const fixture = fixtureMedia();
  let resolveResume: () => void = () => undefined;
  const resume = new Promise<void>((resolve) => {
    resolveResume = resolve;
  });
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
  const context = {
    state: "suspended",
    sampleRate: 48_000,
    destination: node,
    createMediaElementSource: () => node,
    createChannelSplitter: () => node,
    createAnalyser: () => ({ ...analyser }),
    resume: () => resume,
  } as unknown as AudioContext;
  const runtime = new HtmlMediaPlaybackRuntime(fixture.media, {
    createAudioContext: () => context,
  });
  runtime.load({ locationId: LOCATION_ID, url: `/media/${LOCATION_ID}` });

  const playback = runtime.play();

  expect(fixture.playCount()).toBe(1);
  expect(runtime.getSnapshot().status).toBe("loading");
  resolveResume();
  await playback;
  expect(runtime.getSnapshot()).toMatchObject({
    status: "playing",
    analysisAvailable: true,
    error: null,
  });
});
