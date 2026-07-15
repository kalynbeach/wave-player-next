import type { AssetLocationId, TrackId } from "@/core/library/ids";

export type PlaybackStatus =
  | "ended"
  | "error"
  | "idle"
  | "loading"
  | "paused"
  | "playing"
  | "ready";

export type PlaybackError = {
  code: "autoplay_blocked" | "media_error";
  message: string;
};

export type PlaybackSource = {
  locationId: AssetLocationId;
  url: string;
};

export type PlaybackSnapshot = {
  status: PlaybackStatus;
  locationId: AssetLocationId | null;
  currentTime: number;
  duration: number;
  volume: number;
  error: PlaybackError | null;
  analysisAvailable: boolean;
};

export interface PlaybackRuntime {
  destroy(): void;
  getSnapshot(): PlaybackSnapshot;
  load(source: PlaybackSource | null): void;
  pause(): void;
  play(): Promise<void>;
  seek(timeSeconds: number): void;
  setVolume(volume: number): void;
  subscribe(listener: () => void): () => void;
}

export type CardView = "library" | "scene" | "visual";

export type PlayerSession = {
  selectedTrackId: TrackId | null;
  volume: number;
  activeView: CardView;
};

export interface PlayerSessionStore {
  load(): PlayerSession;
  save(session: PlayerSession): void;
}
