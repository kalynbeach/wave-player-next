import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SpeakerHigh,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { PlayerSnapshot } from "@/app/playback/player-controller";
import { Button } from "@/client/components/ui/button";
import { Slider } from "@/client/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";

function timeLabel(timeSeconds: number): string {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return "0:00";
  const minutes = Math.floor(timeSeconds / 60);
  const seconds = Math.floor(timeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function IconButton(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  prominent?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={props.prominent ? "default" : "ghost"}
            size="icon-lg"
            className={props.prominent ? "size-10" : "size-9"}
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

export function Transport(props: {
  snapshot: PlayerSnapshot;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (timeSeconds: number) => void;
  onTogglePlayback: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  const { playback, selectedTrack } = props.snapshot;
  const canPlay = Boolean(selectedTrack?.location.available);
  const isPlaying = playback.status === "playing";
  const duration = Math.max(playback.duration, 0);

  return (
    <footer className="border-t border-border/80 bg-player-section px-4 py-3 text-player-section-foreground sm:px-5">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Playback controls</legend>
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 text-[0.6875rem] tabular-nums text-muted-foreground">
          <span>{timeLabel(playback.currentTime)}</span>
          <Slider
            aria-label="Seek position"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(playback.currentTime, duration || 1)}
            disabled={!canPlay || duration <= 0}
            onValueChange={(value) =>
              props.onSeek(typeof value === "number" ? value : (value[0] ?? 0))
            }
          />
          <span className="text-right">{timeLabel(duration)}</span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-start">
            <SpeakerHigh
              className="mr-2 size-4 text-muted-foreground"
              aria-hidden
            />
            <Slider
              aria-label="Playback volume"
              className="max-w-24"
              min={0}
              max={1}
              step={0.01}
              value={playback.volume}
              onValueChange={(value) =>
                props.onVolumeChange(
                  typeof value === "number" ? value : (value[0] ?? 0),
                )
              }
            />
          </div>

          <div className="flex items-center justify-center gap-1">
            <IconButton
              label="Previous track"
              disabled={!canPlay}
              onClick={props.onPrevious}
            >
              <SkipBack weight="fill" aria-hidden />
            </IconButton>
            <IconButton
              label={isPlaying ? "Pause" : "Play"}
              disabled={!canPlay}
              onClick={props.onTogglePlayback}
              prominent
            >
              {isPlaying ? (
                <Pause weight="fill" aria-hidden />
              ) : (
                <Play weight="fill" aria-hidden />
              )}
            </IconButton>
            <IconButton
              label="Next track"
              disabled={!canPlay}
              onClick={props.onNext}
            >
              <SkipForward weight="fill" aria-hidden />
            </IconButton>
          </div>

          <p
            className="min-w-0 truncate text-right text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground"
            aria-live="polite"
          >
            {playback.status}
          </p>
        </div>
      </fieldset>
    </footer>
  );
}
