import type {
  PlaybackError,
  PlaybackRuntime,
  PlaybackSnapshot,
  PlaybackSource,
  PlaybackStatus,
} from "@/app/playback/playback-ports";
import { WebAudioSignalProvider } from "@/client/playback/web-audio-signal-provider";

type AudioGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  splitter: ChannelSplitterNode;
  left: AnalyserNode;
  right: AnalyserNode;
  analysisConnected: boolean;
  outputConnected: boolean;
};

function finiteDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export class HtmlMediaPlaybackRuntime implements PlaybackRuntime {
  readonly #createAudioContext: () => AudioContext;
  readonly #listeners = new Set<() => void>();
  readonly #media: HTMLAudioElement;
  readonly signalProvider = new WebAudioSignalProvider();
  #audioGraph: AudioGraph | null = null;
  #destroyed = false;
  #pendingPlay: symbol | null = null;
  #snapshot: PlaybackSnapshot;

  constructor(
    media: HTMLAudioElement,
    options: { createAudioContext?: () => AudioContext } = {},
  ) {
    this.#media = media;
    this.#createAudioContext =
      options.createAudioContext ?? (() => new AudioContext());
    this.#snapshot = {
      status: "idle",
      locationId: null,
      currentTime: 0,
      duration: 0,
      volume: media.volume,
      error: null,
      analysisAvailable: false,
    };

    for (const eventName of [
      "canplay",
      "durationchange",
      "ended",
      "error",
      "loadedmetadata",
      "loadstart",
      "pause",
      "play",
      "playing",
      "timeupdate",
      "volumechange",
      "waiting",
    ]) {
      media.addEventListener(eventName, this.#handleMediaEvent);
    }
  }

  getSnapshot(): PlaybackSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  load(source: PlaybackSource | null): void {
    this.#assertActive();
    this.#pendingPlay = null;
    this.#media.pause();

    if (!source) {
      this.#media.removeAttribute("src");
      this.#media.load();
      this.#update({
        status: "idle",
        locationId: null,
        currentTime: 0,
        duration: 0,
        error: null,
      });
      return;
    }

    this.#media.src = source.url;
    this.#media.load();
    this.#update({
      status: "loading",
      locationId: source.locationId,
      currentTime: 0,
      duration: 0,
      error: null,
    });
  }

  async play(): Promise<void> {
    this.#assertActive();
    const request = Symbol();
    this.#pendingPlay = request;

    try {
      const graphActivation = this.#ensureAudioGraph(request);
      const mediaPlayback = this.#media.play();
      await Promise.all([graphActivation, mediaPlayback]);
      if (this.#pendingPlay !== request) return;
      this.#pendingPlay = null;
      this.#syncTime("playing");
      this.#update({ error: null });
    } catch (error) {
      // A replaced or cancelled request no longer owns the shared media element.
      if (this.#pendingPlay !== request) return;
      this.#pendingPlay = null;
      this.#media.pause();
      const blocked =
        error instanceof DOMException && error.name === "NotAllowedError";
      const playbackError: PlaybackError = {
        code: blocked ? "autoplay_blocked" : "media_error",
        message: blocked
          ? "Playback requires a user gesture."
          : "The selected track could not be played.",
      };
      this.#update({ status: "error", error: playbackError });
      throw error;
    }
  }

  pause(): void {
    this.#assertActive();
    this.#pendingPlay = null;
    this.#media.pause();
  }

  seek(timeSeconds: number): void {
    this.#assertActive();
    const duration = finiteDuration(this.#media.duration);
    this.#media.currentTime = Math.min(Math.max(timeSeconds, 0), duration);
    this.#syncTime();
  }

  setVolume(volume: number): void {
    this.#assertActive();
    this.#media.volume = Math.min(Math.max(volume, 0), 1);
    this.#update({ volume: this.#media.volume });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#pendingPlay = null;
    for (const eventName of [
      "canplay",
      "durationchange",
      "ended",
      "error",
      "loadedmetadata",
      "loadstart",
      "pause",
      "play",
      "playing",
      "timeupdate",
      "volumechange",
      "waiting",
    ]) {
      this.#media.removeEventListener(eventName, this.#handleMediaEvent);
    }
    this.#media.pause();
    this.#media.removeAttribute("src");
    this.#media.load();
    this.#listeners.clear();
    this.signalProvider.detach();

    if (this.#audioGraph) {
      this.#audioGraph.source.disconnect();
      this.#audioGraph.splitter.disconnect();
      this.#audioGraph.left.disconnect();
      this.#audioGraph.right.disconnect();
      void this.#audioGraph.context.close();
      this.#audioGraph = null;
    }
  }

  readonly #handleMediaEvent = (event: Event): void => {
    switch (event.type) {
      case "loadstart":
      case "waiting":
        this.#update({ status: "loading" });
        break;
      case "loadedmetadata":
      case "canplay":
        this.#syncTime("ready");
        break;
      case "play":
      case "playing":
        this.#syncTime(this.#pendingPlay ? "loading" : "playing");
        break;
      case "pause":
        this.#syncTime(this.#media.ended ? "ended" : "paused");
        break;
      case "ended":
        this.#syncTime("ended");
        break;
      case "error":
        this.#update({
          status: "error",
          error: {
            code: "media_error",
            message: this.#media.error?.message || "The media element failed.",
          },
        });
        break;
      case "timeupdate":
      case "durationchange":
        this.#syncTime();
        break;
      case "volumechange":
        this.#update({ volume: this.#media.volume });
        break;
    }
  };

  async #ensureAudioGraph(request: symbol): Promise<void> {
    if (this.#audioGraph) {
      await this.#activateAudioGraph(this.#audioGraph, request);
      return;
    }

    let context: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let splitter: ChannelSplitterNode | null = null;
    let left: AnalyserNode | null = null;
    let right: AnalyserNode | null = null;

    try {
      context = this.#createAudioContext();
      splitter = context.createChannelSplitter(2);
      left = context.createAnalyser();
      right = context.createAnalyser();
      left.fftSize = 2_048;
      right.fftSize = 2_048;
      left.smoothingTimeConstant = 0.72;
      right.smoothingTimeConstant = 0.72;
      source = context.createMediaElementSource(this.#media);
      const graph: AudioGraph = {
        context,
        source,
        splitter,
        left,
        right,
        analysisConnected: false,
        outputConnected: false,
      };
      this.#audioGraph = graph;
      source.connect(context.destination);
      graph.outputConnected = true;
      source.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
      graph.analysisConnected = true;
    } catch {
      if (this.#audioGraph?.context === context) {
        this.signalProvider.detach();
        this.#update({ analysisAvailable: false });
        await this.#activateAudioGraph(this.#audioGraph, request);
        return;
      }

      source?.disconnect();
      splitter?.disconnect();
      left?.disconnect();
      right?.disconnect();
      if (context) await context.close().catch(() => undefined);
      if (this.#pendingPlay !== request) return;
      this.signalProvider.detach();
      this.#update({ analysisAvailable: false });
      return;
    }

    await this.#activateAudioGraph(this.#audioGraph, request);
  }

  async #activateAudioGraph(graph: AudioGraph, request: symbol): Promise<void> {
    if (!graph.outputConnected) {
      graph.source.connect(graph.context.destination);
      graph.outputConnected = true;
    }

    if (graph.context.state === "suspended") {
      try {
        await graph.context.resume();
      } catch (error) {
        if (this.#pendingPlay !== request) return;
        this.signalProvider.detach();
        this.#update({ analysisAvailable: false });
        throw error;
      }
    }

    if (this.#pendingPlay !== request) return;
    if (!graph.analysisConnected) {
      this.signalProvider.detach();
      this.#update({ analysisAvailable: false });
      return;
    }

    try {
      this.signalProvider.attach({
        left: graph.left,
        right: graph.right,
        sampleRate: graph.context.sampleRate,
      });
      this.#update({ analysisAvailable: true });
    } catch {
      this.signalProvider.detach();
      this.#update({ analysisAvailable: false });
    }
  }

  #syncTime(status?: PlaybackStatus): void {
    this.#update({
      ...(status ? { status } : {}),
      currentTime: finiteDuration(this.#media.currentTime),
      duration: finiteDuration(this.#media.duration),
    });
  }

  #update(update: Partial<PlaybackSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #assertActive(): void {
    if (this.#destroyed) {
      throw new Error("The playback runtime has been destroyed.");
    }
  }
}
