import { CursorClick, PulseIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { SignalProvider } from "@/app/visualization/signal-provider";
import { Badge } from "@/client/components/ui/badge";
import {
  type SignalRendererStatus,
  WebGpuSignalRenderer,
} from "@/client/visualization/webgpu-signal-renderer";
import type { SignalSceneParameters } from "@/core/scene/signal-scene";

type VisualizerStatus = SignalRendererStatus | { state: "initializing" };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function SignalVisualizer(props: {
  active: boolean;
  analysisAvailable: boolean;
  parameters: SignalSceneParameters;
  signalProvider: SignalProvider;
  onParametersChange: (parameters: SignalSceneParameters) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGpuSignalRenderer | null>(null);
  const activeRef = useRef(props.active);
  const parametersRef = useRef(props.parameters);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    gain: number;
    persistence: number;
  } | null>(null);
  const [status, setStatus] = useState<VisualizerStatus>({
    state: "initializing",
  });
  activeRef.current = props.active;
  parametersRef.current = props.parameters;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    void WebGpuSignalRenderer.create({
      canvas,
      signalProvider: props.signalProvider,
      parameters: parametersRef.current,
      onStatus: (nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      },
    })
      .then((renderer) => {
        if (cancelled) {
          renderer?.dispose();
          return;
        }
        rendererRef.current = renderer;
        renderer?.setActive(activeRef.current);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            state: "error",
            message: "The WebGPU scene could not be created.",
          });
        }
      });

    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [props.signalProvider]);

  useEffect(() => {
    rendererRef.current?.setParameters(props.parameters);
  }, [props.parameters]);

  useEffect(() => {
    rendererRef.current?.setActive(props.active);
  }, [props.active]);

  return (
    <section
      className="relative h-full overflow-hidden bg-visualizer-background"
      aria-label="Signal visualizer"
      data-renderer-state={status.state}
    >
      <canvas
        ref={canvasRef}
        className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal-primary"
        tabIndex={0}
        aria-label={`${props.parameters.mode} WebGPU scene. Drag to change gain and persistence. Use arrow keys to change gain and line width.`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            gain: props.parameters.gain,
            persistence: props.parameters.persistence,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          props.onParametersChange({
            ...props.parameters,
            gain: clamp(drag.gain + (event.clientX - drag.x) / 120, 0.25, 4),
            persistence: clamp(
              drag.persistence - (event.clientY - drag.y) / 320,
              0,
              0.98,
            ),
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          const gainDelta = event.key === "ArrowRight" ? 0.1 : -0.1;
          const widthDelta = event.key === "ArrowUp" ? 0.1 : -0.1;

          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            props.onParametersChange({
              ...props.parameters,
              gain: clamp(props.parameters.gain + gainDelta, 0.25, 4),
            });
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            props.onParametersChange({
              ...props.parameters,
              lineWidth: clamp(props.parameters.lineWidth + widthDelta, 0.5, 6),
            });
          }
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/55 to-transparent p-4">
        <div>
          <p className="text-[0.5625rem] uppercase tracking-[0.2em] text-white/55">
            WebGPU · live signal
          </p>
          <p className="mt-1 text-xs font-medium capitalize text-white/90">
            {props.parameters.mode}
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
          <PulseIcon className="size-3" aria-hidden />
          {props.parameters.gain.toFixed(2)}× gain
        </span>
        <span className="flex items-center gap-1.5 text-[0.5625rem] uppercase tracking-[0.16em]">
          <CursorClick className="size-3" aria-hidden />
          drag to shape
        </span>
      </div>

      {status.state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-visualizer-background/92 px-8 text-center">
          <div className="max-w-sm">
            <p className="text-xs font-medium">
              {status.state === "initializing"
                ? "Initializing WebGPU signal surface"
                : "Signal surface unavailable"}
            </p>
            {"message" in status && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {status.message}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
