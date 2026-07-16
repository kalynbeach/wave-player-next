import { CursorClick, PulseIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Badge } from "@/client/components/ui/badge";
import type { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";

function sceneLabel(
  scene: ReturnType<BrowserVisualizationSession["getSnapshot"]>["scene"],
): string {
  if (scene.sceneId === "signal") {
    return scene.parameters.mode;
  }

  return `${scene.parameters.symmetry}-fold ${scene.parameters.palette}`;
}

function canvasLabel(
  scene: ReturnType<BrowserVisualizationSession["getSnapshot"]>["scene"],
): string {
  if (scene.sceneId === "signal") {
    return `${scene.parameters.mode} WebGPU scene. Drag to change gain and persistence. Use arrow keys to change gain and line width.`;
  }

  return "Light machine WebGPU scene. Drag to rotate and zoom. Use arrow keys to rotate and zoom. Press P to cycle the palette.";
}

export function SceneVisualizer(props: {
  active: boolean;
  analysisAvailable: boolean;
  session: BrowserVisualizationSession;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );
  const snapshot = useSyncExternalStore(
    (listener) => props.session.subscribe(listener),
    () => props.session.getSnapshot(),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return props.session.attachSurface(canvas);
  }, [props.session]);

  useEffect(() => {
    props.session.setActive(props.active);
  }, [props.active, props.session]);

  const scene = snapshot.scene;
  const isSignal = scene.sceneId === "signal";

  return (
    <section
      className="relative h-full overflow-hidden bg-visualizer-background"
      aria-label="Scene visualizer"
      data-analysis-state={props.analysisAvailable ? "live" : "idle"}
      data-renderer-state={snapshot.status.state}
      data-scene-id={scene.sceneId}
      data-scene-version={scene.sceneVersion}
    >
      <canvas
        ref={canvasRef}
        className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal-primary"
        tabIndex={0}
        aria-label={canvasLabel(scene)}
        onPointerDown={(event) => {
          if (dragRef.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          props.session.dispatch({
            type: "shape",
            horizontal: event.clientX - drag.x,
            vertical: event.clientY - drag.y,
          });
          drag.x = event.clientX;
          drag.y = event.clientY;
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          const horizontal =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          const vertical =
            event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;

          if (horizontal !== 0 || vertical !== 0) {
            event.preventDefault();
            props.session.dispatch({ type: "nudge", horizontal, vertical });
          } else if (
            scene.sceneId === "light-machine" &&
            event.key.toLowerCase() === "p"
          ) {
            event.preventDefault();
            props.session.dispatch({ type: "cycle-palette" });
          }
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/55 to-transparent p-4">
        <div>
          <p className="text-[0.5625rem] uppercase tracking-[0.2em] text-white/55">
            WebGPU · {isSignal ? "live signal" : "feedback synth"}
          </p>
          <p className="mt-1 text-xs font-medium capitalize text-white/90">
            {sceneLabel(scene)}
          </p>
        </div>
        <Badge
          className="border-white/15 bg-black/20 text-white/75"
          variant="outline"
        >
          {props.analysisAvailable ? "analyser live" : "press play"}
        </Badge>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-4 text-white/65">
        <span className="flex items-center gap-1.5 text-[0.5625rem] uppercase tracking-[0.16em]">
          <PulseIcon aria-hidden />
          {isSignal
            ? `${scene.parameters.gain.toFixed(2)}× gain`
            : `${Math.round(scene.parameters.feedback * 100)}% feedback`}
        </span>
        <span className="flex items-center gap-1.5 text-[0.5625rem] uppercase tracking-[0.16em]">
          <CursorClick aria-hidden />
          drag to shape
        </span>
      </div>

      {snapshot.status.state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-visualizer-background/92 px-8 text-center">
          <div className="max-w-sm">
            <p className="text-xs font-medium">
              {snapshot.status.state === "initializing"
                ? `Initializing ${isSignal ? "signal" : "light-machine"} surface`
                : "Scene surface unavailable"}
            </p>
            {"message" in snapshot.status && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {snapshot.status.message}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
