import type {
  CardView,
  PlayerSession,
  PlayerSessionStore,
} from "@/app/playback/playback-ports";
import { parseTrackId, type TrackId } from "@/core/library/ids";

const DEFAULT_SESSION: PlayerSession = {
  selectedTrackId: null,
  volume: 0.8,
  activeView: "visual",
};

function cardView(value: unknown): CardView {
  return value === "library" || value === "scene" || value === "visual"
    ? value
    : "visual";
}

function trackId(value: unknown): TrackId | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return parseTrackId(value);
  } catch {
    return null;
  }
}

export class BrowserPlayerSessionStore implements PlayerSessionStore {
  readonly #key: string;
  readonly #storage: Storage;

  constructor(storage: Storage, key = "wave-player/session/v1") {
    this.#storage = storage;
    this.#key = key;
  }

  load(): PlayerSession {
    const serialized = this.#storage.getItem(this.#key);

    if (!serialized) {
      return DEFAULT_SESSION;
    }

    try {
      const value: unknown = JSON.parse(serialized);

      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return DEFAULT_SESSION;
      }

      const session = value as Record<string, unknown>;
      const volume =
        typeof session.volume === "number" && Number.isFinite(session.volume)
          ? Math.min(Math.max(session.volume, 0), 1)
          : DEFAULT_SESSION.volume;

      return {
        selectedTrackId: trackId(session.selectedTrackId),
        volume,
        activeView: cardView(session.activeView),
      };
    } catch {
      return DEFAULT_SESSION;
    }
  }

  save(session: PlayerSession): void {
    this.#storage.setItem(this.#key, JSON.stringify(session));
  }
}
