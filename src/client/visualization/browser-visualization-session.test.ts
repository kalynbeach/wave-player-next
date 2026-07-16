import { expect, test } from "bun:test";
import type {
  SignalFrame,
  SignalProvider,
} from "@/app/visualization/signal-provider";
import type { VisualizationRenderer } from "@/app/visualization/visualization-session";
import { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import {
  type VisualizationRendererCreateOptions,
  VisualizationSceneRegistry,
} from "@/client/visualization/visualization-scene-registry";
import { parseScenePresetId } from "@/core/library/ids";
import {
  LIGHT_MACHINE_SCENE_DEFINITION,
  SIGNAL_SCENE_DEFINITION,
} from "@/core/scene/scene-registry";

function createHarness() {
  const counts = {
    created: [] as string[],
    disposed: [] as string[],
    setActive: [] as string[],
    setState: [] as string[],
  };
  const empty = new Float32Array(2_048);
  const frame: SignalFrame = {
    timestampSeconds: 0,
    sampleRate: 48_000,
    left: empty,
    right: empty,
    mono: empty,
    frequencyBins: new Uint8Array(1_024),
    rms: 0,
    peak: 0,
  };
  const signalProvider: SignalProvider = {
    isAvailable: () => true,
    readFrame: () => frame,
  };
  const createRenderer = async (
    options: VisualizationRendererCreateOptions,
  ): Promise<VisualizationRenderer> => {
    const id = options.state.sceneId;
    counts.created.push(id);
    options.onStatus({ state: "ready" });
    let disposed = false;

    return {
      setActive: (active) => counts.setActive.push(`${id}:${active}`),
      setState: (state) => counts.setState.push(state.sceneId),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        counts.disposed.push(id);
      },
    };
  };
  const registry = new VisualizationSceneRegistry([
    { scene: SIGNAL_SCENE_DEFINITION, createRenderer },
    { scene: LIGHT_MACHINE_SCENE_DEFINITION, createRenderer },
  ]);

  return {
    canvas: {} as HTMLCanvasElement,
    counts,
    registry,
    signalProvider,
  };
}

test("switches renderer ownership while retaining per-scene state", async () => {
  const harness = createHarness();
  const session = new BrowserVisualizationSession(harness);
  session.attachSurface(harness.canvas);
  await Promise.resolve();

  session.dispatch({ type: "nudge", horizontal: 1, vertical: 0 });
  const signalState = session.getSnapshot().scene;
  const signalGain =
    signalState.sceneId === "signal" ? signalState.parameters.gain : 0;
  session.selectScene("light-machine");
  await Promise.resolve();
  session.dispatch({ type: "nudge", horizontal: 1, vertical: 1 });
  const lightState = session.getSnapshot().scene;
  session.selectScene("signal");
  await Promise.resolve();

  expect(harness.counts.created).toEqual(["signal", "light-machine", "signal"]);
  expect(harness.counts.disposed).toEqual(["signal", "light-machine"]);
  expect(session.getSnapshot()).toMatchObject({
    scene: { sceneId: "signal", parameters: { gain: signalGain } },
    status: { state: "ready" },
  });
  expect(lightState).toMatchObject({
    sceneId: "light-machine",
    parameters: { rotation: 4, zoom: 1.07 },
  });

  session.dispose();
  session.dispose();
  expect(harness.counts.disposed).toEqual([
    "signal",
    "light-machine",
    "signal",
  ]);
});

test("loads a preset into its owning scene and resets or varies safely", async () => {
  const harness = createHarness();
  const session = new BrowserVisualizationSession({
    ...harness,
    random: () => 0.25,
  });
  session.attachSurface(harness.canvas);
  await Promise.resolve();

  session.loadPreset({
    id: parseScenePresetId("preset_00000000-0000-4000-8000-000000000001"),
    name: "Eightfold ember",
    sceneId: "light-machine",
    sceneVersion: 1,
    parameters: {
      feedback: 0.9,
      symmetry: 8,
      rotation: 20,
      zoom: 1.2,
      palette: "ember",
      colorCycle: 0.2,
      audioModulation: 0.8,
      intensity: 1.4,
    },
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  });
  await Promise.resolve();

  expect(session.getSnapshot().scene).toMatchObject({
    sceneId: "light-machine",
    parameters: { symmetry: 8, palette: "ember" },
  });
  session.vary();
  expect(session.getSnapshot().scene).toMatchObject({
    sceneId: "light-machine",
    parameters: { symmetry: 2, palette: "electric" },
  });
  session.reset();
  expect(session.getSnapshot().scene).toMatchObject({
    sceneId: "light-machine",
    parameters: { feedback: 0.88, symmetry: 4, palette: "electric" },
  });

  session.selectScene("signal");
  expect(() => session.vary()).toThrow("only for the light machine");
  session.dispose();
});

test("disposes stale async renderers and forwards hidden-view activation", async () => {
  const harness = createHarness();
  const pending: Array<{
    options: VisualizationRendererCreateOptions;
    resolve: (renderer: VisualizationRenderer) => void;
  }> = [];
  const created: string[] = [];
  const disposed: string[] = [];
  const active: string[] = [];
  const registry = new VisualizationSceneRegistry(
    [SIGNAL_SCENE_DEFINITION, LIGHT_MACHINE_SCENE_DEFINITION].map((scene) => ({
      scene,
      createRenderer: (options: VisualizationRendererCreateOptions) =>
        new Promise<VisualizationRenderer>((resolve) => {
          pending.push({ options, resolve });
        }),
    })),
  );
  const session = new BrowserVisualizationSession({
    registry,
    signalProvider: harness.signalProvider,
  });
  session.attachSurface(harness.canvas);
  session.selectScene("light-machine");
  expect(pending).toHaveLength(2);

  const renderer = (id: string): VisualizationRenderer => ({
    setActive: (value) => active.push(`${id}:${value}`),
    setState: () => created.push(id),
    dispose: () => disposed.push(id),
  });
  pending[0]?.options.onStatus({ state: "ready" });
  pending[0]?.resolve(renderer("signal"));
  await Promise.resolve();
  pending[1]?.options.onStatus({ state: "ready" });
  pending[1]?.resolve(renderer("light-machine"));
  await Promise.resolve();
  session.setActive(false);

  expect(disposed).toEqual(["signal"]);
  expect(created).toEqual(["light-machine"]);
  expect(active).toEqual(["light-machine:true", "light-machine:false"]);
  expect(session.getSnapshot().status).toEqual({ state: "ready" });
  session.dispose();
  expect(disposed).toEqual(["signal", "light-machine"]);
});

test("reports current factory rejection and ignores stale or disposed failures", async () => {
  const harness = createHarness();
  const rejections: Array<(cause: Error) => void> = [];
  const registry = new VisualizationSceneRegistry(
    [SIGNAL_SCENE_DEFINITION, LIGHT_MACHINE_SCENE_DEFINITION].map((scene) => ({
      scene,
      createRenderer: () =>
        new Promise<VisualizationRenderer>((_resolve, reject) => {
          rejections.push(reject);
        }),
    })),
  );
  const session = new BrowserVisualizationSession({
    registry,
    signalProvider: harness.signalProvider,
  });
  session.attachSurface(harness.canvas);
  rejections[0]?.(new Error("Signal adapter failed."));
  await Promise.resolve();
  expect(session.getSnapshot().status).toEqual({
    state: "error",
    message: "Signal adapter failed.",
  });

  session.selectScene("light-machine");
  session.selectScene("signal");
  rejections[1]?.(new Error("Stale light renderer failed."));
  await Promise.resolve();
  expect(session.getSnapshot().status).toEqual({ state: "initializing" });

  session.dispose();
  rejections[2]?.(new Error("Disposed signal renderer failed."));
  await Promise.resolve();
  expect(session.getSnapshot().status).toEqual({ state: "initializing" });
});
