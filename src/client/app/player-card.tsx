import { WarningCircle } from "@phosphor-icons/react";

import type { CardView } from "@/app/playback/playback-ports";
import type { PlayerSnapshot } from "@/app/playback/player-controller";
import { LibraryView, RootSetup } from "@/client/app/library-view";
import { SceneControls } from "@/client/app/scene-controls";
import { SceneVisualizer } from "@/client/app/scene-visualizer";
import { Transport } from "@/client/app/transport";
import { Badge } from "@/client/components/ui/badge";
import { Card } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import type { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import type { TrackId } from "@/core/library/ids";
import type { LibraryRoot } from "@/core/library/library";
import type { ScenePreset } from "@/core/scene/scene-registry";

function isCardView(value: string | number): value is CardView {
  return value === "visual" || value === "library" || value === "scene";
}

export function PlayerCard(props: {
  activeView: CardView;
  busy: boolean;
  error: string | null;
  initialLoading: boolean;
  player: PlayerSnapshot;
  presets: readonly ScenePreset[];
  root: LibraryRoot | null;
  visualizationSession: BrowserVisualizationSession;
  onActiveViewChange: (view: CardView) => void;
  onConfigureRoot: (path: string) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
  onSavePreset: (name: string) => Promise<void>;
  onScan: () => Promise<void>;
  onSeek: (timeSeconds: number) => void;
  onSelectTrack: (trackId: TrackId) => Promise<void>;
  onTogglePlayback: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  const selectedTrack = props.player.selectedTrack;
  const playback = props.player.playback;

  return (
    <Card
      className="player-card gap-0 overflow-hidden bg-player-frame py-0 text-player-frame-foreground shadow-[0_14px_32px_-20px_oklch(0_0_0/0.92)] ring-1 ring-white/12"
      role="region"
      aria-labelledby="wave-player-track-title"
      data-card-view={props.activeView}
      data-playback-status={playback.status}
    >
      <Tabs
        className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-0"
        value={props.activeView}
        onValueChange={(value) => {
          if (isCardView(value)) props.onActiveViewChange(value);
        }}
      >
        <header className="border-b border-border/80 bg-player-frame px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <div className="flex min-h-14 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.5625rem] uppercase tracking-[0.22em] text-muted-foreground">
                Wave Player · local visual instrument
              </p>
              {props.initialLoading ? (
                <>
                  <h1 id="wave-player-track-title" className="sr-only">
                    Wave Player Next
                  </h1>
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </>
              ) : (
                <>
                  <h1
                    id="wave-player-track-title"
                    className="mt-2 max-w-[25rem] truncate text-base font-medium tracking-tight sm:text-lg"
                  >
                    {selectedTrack?.title ?? "No track selected"}
                  </h1>
                  <p className="mt-1 truncate text-[0.625rem] text-muted-foreground">
                    {selectedTrack?.location.relativePath ??
                      (props.root
                        ? `${props.root.supportedFileCount} indexed tracks`
                        : "Configure a library to begin")}
                  </p>
                </>
              )}
            </div>
            <Badge
              variant="outline"
              className="shrink-0 uppercase tracking-[0.12em]"
            >
              {selectedTrack?.asset.format ?? "local"}
            </Badge>
          </div>

          {props.error && (
            <p
              className="mt-2 flex items-center gap-1.5 text-[0.625rem] text-destructive"
              role="alert"
            >
              <WarningCircle className="size-3.5" aria-hidden />
              {props.error}
            </p>
          )}

          {!props.initialLoading && props.root && (
            <TabsList
              variant="line"
              className="mt-3 grid h-9 w-full grid-cols-3 gap-2"
              aria-label="Player view"
            >
              <TabsTrigger value="visual">Visual</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="scene">Scene</TabsTrigger>
            </TabsList>
          )}
        </header>

        <div className="relative min-h-0 overflow-hidden bg-background">
          {props.initialLoading ? (
            <div className="grid h-full place-items-center p-6">
              <Skeleton className="size-full max-h-[26rem]" />
            </div>
          ) : !props.root ? (
            <RootSetup busy={props.busy} onConfigure={props.onConfigureRoot} />
          ) : (
            <>
              <TabsContent
                value="visual"
                keepMounted
                className="absolute inset-0 data-[hidden]:hidden"
              >
                <SceneVisualizer
                  active={props.activeView === "visual"}
                  analysisAvailable={playback.analysisAvailable}
                  session={props.visualizationSession}
                />
              </TabsContent>
              <TabsContent
                value="library"
                keepMounted
                className="absolute inset-0 data-[hidden]:hidden"
              >
                <LibraryView
                  root={props.root}
                  tracks={props.player.tracks}
                  selectedTrackId={selectedTrack?.id ?? null}
                  playing={playback.status === "playing"}
                  busy={props.busy}
                  onScan={props.onScan}
                  onSelect={props.onSelectTrack}
                />
              </TabsContent>
              <TabsContent
                value="scene"
                keepMounted
                className="absolute inset-0 data-[hidden]:hidden"
              >
                <SceneControls
                  session={props.visualizationSession}
                  presets={props.presets}
                  busy={props.busy}
                  onSavePreset={props.onSavePreset}
                />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      <Transport
        snapshot={props.player}
        onNext={props.onNext}
        onPrevious={props.onPrevious}
        onSeek={props.onSeek}
        onTogglePlayback={props.onTogglePlayback}
        onVolumeChange={props.onVolumeChange}
      />
    </Card>
  );
}
