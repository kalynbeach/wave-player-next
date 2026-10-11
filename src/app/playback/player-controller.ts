import type {
  PlaybackRuntime,
  PlaybackSnapshot,
  PlayerSession,
  PlayerSessionStore,
} from "@/app/playback/playback-ports";
import type { TrackId } from "@/core/library/ids";
import type { LibraryTrack } from "@/core/library/library";

export type PlayerSnapshot = {
  tracks: readonly LibraryTrack[];
  selectedTrack: LibraryTrack | null;
  playback: PlaybackSnapshot;
};

type SourceUrl = (track: LibraryTrack) => string;

export class PlayerController {
  readonly #listeners = new Set<() => void>();
  readonly #runtime: PlaybackRuntime;
  readonly #sessionStore: PlayerSessionStore;
  readonly #sourceUrl: SourceUrl;
  #destroyed = false;
  #handlingEnded = false;
  #session: PlayerSession;
  #snapshot: PlayerSnapshot;
  #unsubscribeRuntime: () => void;

  constructor(options: {
    runtime: PlaybackRuntime;
    sessionStore: PlayerSessionStore;
    sourceUrl: SourceUrl;
  }) {
    this.#runtime = options.runtime;
    this.#sessionStore = options.sessionStore;
    this.#sourceUrl = options.sourceUrl;
    this.#session = options.sessionStore.load();
    this.#runtime.setVolume(this.#session.volume);
    this.#snapshot = {
      tracks: [],
      selectedTrack: null,
      playback: this.#runtime.getSnapshot(),
    };
    this.#unsubscribeRuntime = this.#runtime.subscribe(() => {
      const previousStatus = this.#snapshot.playback.status;
      this.#refreshSnapshot();

      if (
        previousStatus !== "ended" &&
        this.#snapshot.playback.status === "ended" &&
        !this.#handlingEnded
      ) {
        this.#handlingEnded = true;
        void this.next(true).finally(() => {
          this.#handlingEnded = false;
        });
      }
    });
  }

  getSnapshot(): PlayerSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setTracks(tracks: readonly LibraryTrack[]): void {
    this.#assertActive();
    const selectedTrack = this.#session.selectedTrackId
      ? (tracks.find((track) => track.id === this.#session.selectedTrackId) ??
        null)
      : null;
    const fallback = tracks.find((track) => track.location.available) ?? null;
    const nextTrack = selectedTrack ?? fallback;
    const currentTrack = this.#snapshot.selectedTrack;
    const sameSource =
      currentTrack?.location.available &&
      nextTrack?.location.available &&
      currentTrack.id === nextTrack.id &&
      currentTrack.location.id === nextTrack.location.id &&
      currentTrack.asset.id === nextTrack.asset.id &&
      currentTrack.asset.fileSizeBytes === nextTrack.asset.fileSizeBytes &&
      currentTrack.asset.modifiedAtMs === nextTrack.asset.modifiedAtMs &&
      this.#sourceUrl(currentTrack) === this.#sourceUrl(nextTrack);

    // An unchanged source keeps its transport state while metadata refreshes.
    if (!sameSource) this.#setSelection(nextTrack, false);
    this.#snapshot = {
      tracks: [...tracks],
      selectedTrack: nextTrack,
      playback: this.#runtime.getSnapshot(),
    };
    this.#emit();
  }

  async select(trackId: TrackId, autoplay = true): Promise<void> {
    this.#assertActive();
    const track =
      this.#snapshot.tracks.find((candidate) => candidate.id === trackId) ??
      null;

    if (!track) {
      throw new Error("The selected track is not in the current library.");
    }

    this.#setSelection(track, autoplay);

    if (autoplay && track.location.available) {
      await this.#runtime.play();
    }
  }

  async togglePlayback(): Promise<void> {
    this.#assertActive();
    const selected = this.#snapshot.selectedTrack;

    if (!selected?.location.available) {
      return;
    }

    if (this.#snapshot.playback.status === "playing") {
      this.#runtime.pause();
      return;
    }

    if (this.#snapshot.playback.status === "ended") {
      this.#runtime.seek(0);
    }

    await this.#runtime.play();
  }

  async next(autoplay = true): Promise<void> {
    await this.#move(1, autoplay);
  }

  async previous(): Promise<void> {
    if (this.#snapshot.playback.currentTime > 3) {
      this.#runtime.seek(0);
      return;
    }

    await this.#move(-1, true);
  }

  seek(timeSeconds: number): void {
    this.#assertActive();
    this.#runtime.seek(timeSeconds);
  }

  setVolume(volume: number): void {
    this.#assertActive();
    const boundedVolume = Math.min(Math.max(volume, 0), 1);
    this.#session = { ...this.#session, volume: boundedVolume };
    this.#runtime.setVolume(boundedVolume);
    this.#sessionStore.save(this.#session);
  }

  setActiveView(activeView: PlayerSession["activeView"]): void {
    this.#session = { ...this.#session, activeView };
    this.#sessionStore.save(this.#session);
  }

  getRestoredView(): PlayerSession["activeView"] {
    return this.#session.activeView;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#unsubscribeRuntime();
    this.#runtime.destroy();
    this.#listeners.clear();
  }

  async #move(direction: -1 | 1, autoplay: boolean): Promise<void> {
    this.#assertActive();
    const available = this.#snapshot.tracks.filter(
      (track) => track.location.available,
    );

    if (available.length === 0) {
      return;
    }

    const currentIndex = available.findIndex(
      (track) => track.id === this.#snapshot.selectedTrack?.id,
    );
    const baseIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex =
      (baseIndex + direction + available.length) % available.length;
    const nextTrack = available[nextIndex];

    if (nextTrack) {
      await this.select(nextTrack.id, autoplay);
    }
  }

  #setSelection(track: LibraryTrack | null, autoplay: boolean): void {
    this.#session = {
      ...this.#session,
      selectedTrackId: track?.id ?? null,
    };
    this.#sessionStore.save(this.#session);

    if (track?.location.available) {
      this.#runtime.load({
        locationId: track.location.id,
        url: this.#sourceUrl(track),
      });
    } else {
      this.#runtime.load(null);
    }

    this.#snapshot = {
      ...this.#snapshot,
      selectedTrack: track,
      playback: this.#runtime.getSnapshot(),
    };
    this.#emit();

    if (!autoplay) {
      return;
    }
  }

  #refreshSnapshot(): void {
    this.#snapshot = {
      ...this.#snapshot,
      playback: this.#runtime.getSnapshot(),
    };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #assertActive(): void {
    if (this.#destroyed) {
      throw new Error("The player controller has been destroyed.");
    }
  }
}
