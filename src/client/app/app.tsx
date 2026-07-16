import { useEffect, useState, useSyncExternalStore } from "react";

import type { CardView } from "@/app/playback/playback-ports";
import { PlayerController } from "@/app/playback/player-controller";
import { WaveApiClient } from "@/client/api/wave-api-client";
import { PlayerCard } from "@/client/app/player-card";
import { BrowserPlayerSessionStore } from "@/client/playback/browser-player-session-store";
import { HtmlMediaPlaybackRuntime } from "@/client/playback/html-media-playback-runtime";
import { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import { BUILT_IN_VISUALIZATION_SCENE_REGISTRY } from "@/client/visualization/built-in-visualization-scenes";
import type { TrackId } from "@/core/library/ids";
import type { LibraryRoot } from "@/core/library/library";
import type { ScenePreset } from "@/core/scene/scene-registry";

type ApplicationRuntime = {
  api: WaveApiClient;
  controller: PlayerController;
  playback: HtmlMediaPlaybackRuntime;
  visualization: BrowserVisualizationSession;
};

export function createApplicationRuntime(): ApplicationRuntime {
  const playback = new HtmlMediaPlaybackRuntime(new Audio());
  const controller = new PlayerController({
    runtime: playback,
    sessionStore: new BrowserPlayerSessionStore(localStorage),
    sourceUrl: (track) => `/media/${encodeURIComponent(track.location.id)}`,
  });

  return {
    api: new WaveApiClient(),
    controller,
    playback,
    visualization: new BrowserVisualizationSession({
      registry: BUILT_IN_VISUALIZATION_SCENE_REGISTRY,
      signalProvider: playback.signalProvider,
    }),
  };
}

function ConnectedPlayer({ runtime }: { runtime: ApplicationRuntime }) {
  const player = useSyncExternalStore(
    (listener) => runtime.controller.subscribe(listener),
    () => runtime.controller.getSnapshot(),
  );
  const [activeView, setActiveView] = useState<CardView>(() =>
    runtime.controller.getRestoredView(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [presets, setPresets] = useState<readonly ScenePreset[]>([]);
  const [root, setRoot] = useState<LibraryRoot | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      runtime.api.getRoot(),
      runtime.api.getTracks(),
      runtime.api.getScenePresets(),
    ])
      .then(([rootResponse, tracksResponse, presetResponse]) => {
        if (cancelled) return;
        setRoot(rootResponse.root);
        setPresets(presetResponse.presets);
        runtime.controller.setTracks(tracksResponse.tracks);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The local library could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runtime]);

  const reportActionError = (cause: unknown, fallback: string): void => {
    setError(cause instanceof Error ? cause.message : fallback);
  };

  const reportPlaybackError = (fallback: string): void => {
    setError(runtime.playback.getSnapshot().error?.message ?? fallback);
  };

  const configureRoot = async (path: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await runtime.api.configureRoot(path);
      const result = await runtime.api.scan();
      setRoot(result.root);
      runtime.controller.setTracks(result.tracks);
    } catch (cause) {
      reportActionError(cause, "The library could not be configured.");
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const scan = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.api.scan();
      setRoot(result.root);
      runtime.controller.setTracks(result.tracks);
    } catch (cause) {
      reportActionError(cause, "The library scan failed.");
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const selectTrack = async (trackId: TrackId): Promise<void> => {
    setError(null);
    try {
      await runtime.controller.select(trackId);
    } catch (cause) {
      reportPlaybackError("The selected track could not be played.");
      throw cause;
    }
  };

  const runTransportAction = (action: () => Promise<void>): void => {
    setError(null);
    void action().catch(() => {
      reportPlaybackError("Playback could not continue.");
    });
  };

  const savePreset = async (name: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await runtime.api.saveScenePreset(
        name,
        runtime.visualization.getSnapshot().scene,
      );
      setPresets((current) =>
        [
          ...current.filter((preset) => preset.id !== response.preset.id),
          response.preset,
        ].sort((left, right) => left.name.localeCompare(right.name)),
      );
    } catch (cause) {
      reportActionError(cause, "The scene preset could not be saved.");
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  return (
    <PlayerCard
      activeView={activeView}
      busy={busy}
      error={error ?? player.playback.error?.message ?? null}
      initialLoading={initialLoading}
      player={player}
      presets={presets}
      root={root}
      visualizationSession={runtime.visualization}
      onActiveViewChange={(view) => {
        setActiveView(view);
        runtime.controller.setActiveView(view);
      }}
      onConfigureRoot={configureRoot}
      onNext={() => runTransportAction(() => runtime.controller.next())}
      onPrevious={() => runTransportAction(() => runtime.controller.previous())}
      onSavePreset={savePreset}
      onScan={scan}
      onSeek={(timeSeconds) => runtime.controller.seek(timeSeconds)}
      onSelectTrack={selectTrack}
      onTogglePlayback={() =>
        runTransportAction(() => runtime.controller.togglePlayback())
      }
      onVolumeChange={(volume) => runtime.controller.setVolume(volume)}
    />
  );
}

export function App() {
  const [runtime, setRuntime] = useState<ApplicationRuntime | null>(null);

  useEffect(() => {
    const nextRuntime = createApplicationRuntime();
    setRuntime(nextRuntime);

    return () => {
      nextRuntime.visualization.dispose();
      nextRuntime.controller.destroy();
    };
  }, []);

  return (
    <main className="app-shell" aria-label="Wave Player Next">
      {runtime ? (
        <ConnectedPlayer runtime={runtime} />
      ) : (
        <section
          className="player-card grid place-items-center bg-player-frame text-xs text-muted-foreground"
          aria-label="Wave Player Next"
        >
          Loading local player…
        </section>
      )}
    </main>
  );
}
