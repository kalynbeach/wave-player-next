import { ArrowClockwise, FolderOpen, MusicNote } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ScrollArea } from "@/client/components/ui/scroll-area";
import { cn } from "@/client/lib/utils";
import type { TrackId } from "@/core/library/ids";
import type { LibraryRoot, LibraryTrack } from "@/core/library/library";

export function RootSetup(props: {
  busy: boolean;
  onConfigure: (path: string) => Promise<void>;
}) {
  const [path, setPath] = useState("");

  return (
    <section className="flex h-full flex-col justify-center px-6 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-md">
        <FolderOpen className="mb-5 size-7 text-signal-primary" aria-hidden />
        <p className="text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
          First signal
        </p>
        <h2 className="mt-2 text-xl font-medium tracking-tight">
          Connect your local library
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Choose one absolute folder containing WAV or MP3 files. Wave Player
          indexes them in place and never copies, renames, or modifies your
          audio.
        </p>

        <form
          className="mt-7 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onConfigure(path).catch(() => undefined);
          }}
        >
          <Label htmlFor="library-root-path">Library folder</Label>
          <Input
            id="library-root-path"
            value={path}
            placeholder="/Users/you/Music/Exports"
            autoComplete="off"
            spellCheck={false}
            disabled={props.busy}
            onChange={(event) => setPath(event.target.value)}
          />
          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            disabled={props.busy || path.trim().length === 0}
          >
            {props.busy ? "Indexing library…" : "Configure and scan"}
          </Button>
        </form>
      </div>
    </section>
  );
}

export function LibraryView(props: {
  root: LibraryRoot;
  tracks: readonly LibraryTrack[];
  selectedTrackId: TrackId | null;
  playing: boolean;
  busy: boolean;
  onScan: () => Promise<void>;
  onSelect: (trackId: TrackId) => Promise<void>;
}) {
  return (
    <section
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr]"
      aria-label="Library"
    >
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium">
              {props.root.displayName}
            </p>
            <Badge variant="outline" className="shrink-0 uppercase">
              {props.root.scanStatus}
            </Badge>
          </div>
          <p className="mt-1 truncate text-[0.625rem] text-muted-foreground">
            {props.root.canonicalPath}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.busy}
          onClick={() => void props.onScan().catch(() => undefined)}
        >
          <ArrowClockwise
            data-icon="inline-start"
            className={props.busy ? "animate-spin" : undefined}
            aria-hidden
          />
          {props.busy ? "Scanning" : "Rescan"}
        </Button>
      </header>

      {props.tracks.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <MusicNote className="size-7 text-muted-foreground" aria-hidden />
          <h3 className="mt-4 text-sm font-medium">
            No playable exports found
          </h3>
          <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
            This root has no WAV or MP3 files yet. Other files, including
            Ableton Live Sets, are safely ignored.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 min-w-0">
          <div className="p-2 sm:p-3">
            {props.tracks.map((track, index) => {
              const selected = track.id === props.selectedTrackId;
              const status = !track.location.available
                ? "Unavailable"
                : selected && props.playing
                  ? "Playing"
                  : selected
                    ? "Selected"
                    : track.asset.format.toUpperCase();

              return (
                <button
                  key={track.id}
                  type="button"
                  className={cn(
                    "group flex min-h-12 w-full items-center gap-3 border-b border-border/50 px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected && "bg-muted/70",
                    !track.location.available && "opacity-55",
                  )}
                  aria-current={selected ? "true" : undefined}
                  disabled={!track.location.available}
                  onClick={() =>
                    void props.onSelect(track.id).catch(() => undefined)
                  }
                >
                  <span className="w-6 shrink-0 text-right text-[0.625rem] tabular-nums text-muted-foreground">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {track.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.625rem] text-muted-foreground">
                      {track.location.relativePath}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.5625rem] uppercase tracking-[0.13em] text-muted-foreground">
                    {status}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}
