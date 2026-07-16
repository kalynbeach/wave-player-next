import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SignalProvider } from "@/app/visualization/signal-provider";
import { SceneVisualizer } from "@/client/app/scene-visualizer";
import { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import { VisualizationSceneRegistry } from "@/client/visualization/visualization-scene-registry";
import { parseLightMachineSceneParameters } from "@/core/scene/light-machine-scene";
import {
  LIGHT_MACHINE_SCENE_DEFINITION,
  SIGNAL_SCENE_DEFINITION,
} from "@/core/scene/scene-registry";

const signalProvider: SignalProvider = {
  isAvailable: () => false,
  readFrame: () => {
    const samples = new Float32Array(2_048);
    return {
      timestampSeconds: 0,
      sampleRate: 0,
      left: samples,
      right: samples,
      mono: samples,
      frequencyBins: new Uint8Array(1_024),
      rms: 0,
      peak: 0,
    };
  },
};

function createSession() {
  return new BrowserVisualizationSession({
    initialSceneId: "light-machine",
    signalProvider,
    registry: new VisualizationSceneRegistry(
      [SIGNAL_SCENE_DEFINITION, LIGHT_MACHINE_SCENE_DEFINITION].map(
        (scene) => ({
          scene,
          createRenderer: async (options) => {
            options.onStatus({ state: "ready" });
            return {
              setActive: () => undefined,
              setState: () => undefined,
              dispose: () => undefined,
            };
          },
        }),
      ),
    ),
  });
}

test("forwards keyboard and pointer shaping into validated scene state", () => {
  const session = createSession();
  render(
    <SceneVisualizer active analysisAvailable={false} session={session} />,
  );
  const canvas = screen.getByLabelText(/Light machine WebGPU scene/);
  Object.assign(canvas, {
    setPointerCapture: () => undefined,
    hasPointerCapture: () => true,
    releasePointerCapture: () => undefined,
  });

  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  fireEvent.keyDown(canvas, { key: "ArrowUp" });
  fireEvent.keyDown(canvas, { key: "p" });
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(canvas, {
    pointerId: 1,
    clientX: 120,
    clientY: 136,
  });
  fireEvent.pointerUp(canvas, {
    pointerId: 1,
    clientX: 120,
    clientY: 136,
  });

  const state = session.getSnapshot().scene;
  expect(state).toMatchObject({
    sceneId: "light-machine",
    parameters: {
      rotation: 11,
      palette: "ember",
    },
  });
  if (state.sceneId === "light-machine") {
    expect(state.parameters.zoom).toBeCloseTo(0.97);
    expect(parseLightMachineSceneParameters(state.parameters)).toEqual(
      state.parameters,
    );
  }
  expect(canvas.getAttribute("aria-label")).toContain("Press P");
  session.dispose();
});
