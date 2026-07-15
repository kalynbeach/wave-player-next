import { expect, test } from "bun:test";

import type { SignalFrame } from "@/app/visualization/signal-provider";
import { SignalGeometry } from "@/client/visualization/signal-geometry";
import {
  DEFAULT_SIGNAL_SCENE_PARAMETERS,
  type SignalSceneParameters,
} from "@/core/scene/signal-scene";

function signalFrame(): SignalFrame {
  const left = new Float32Array(2_048);
  const right = new Float32Array(2_048);

  for (let index = 0; index < left.length; index += 1) {
    left[index] = Math.sin(index / 20);
    right[index] = Math.cos(index / 23);
  }

  return {
    timestampSeconds: 1,
    sampleRate: 48_000,
    left,
    right,
    mono: left,
    frequencyBins: new Uint8Array(1_024),
    rms: 0.5,
    peak: 1,
  };
}

test("reuses a bounded vertex buffer for oscilloscope trails", () => {
  const geometry = new SignalGeometry();
  const vertices = geometry.vertices;
  const frame = signalFrame();

  geometry.update(frame, DEFAULT_SIGNAL_SCENE_PARAMETERS, 1.5);
  const firstVertexCount = geometry.vertexCount;

  for (let update = 1; update < 120; update += 1) {
    geometry.update(frame, DEFAULT_SIGNAL_SCENE_PARAMETERS, 1.5);
  }

  expect(geometry.vertices).toBe(vertices);
  expect(firstVertexCount).toBeGreaterThan(0);
  expect(geometry.vertexCount).toBeGreaterThan(firstVertexCount);
  expect(
    geometry.vertices
      .subarray(0, geometry.vertexCount * 3)
      .every(Number.isFinite),
  ).toBe(true);
});

test("builds different bounded geometry for Lissajous mode and line width", () => {
  const geometry = new SignalGeometry();
  const parameters: SignalSceneParameters = {
    ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
    mode: "lissajous",
    gain: 3,
    lineWidth: 5,
    xFrequency: 5,
    yFrequency: 4,
  };

  geometry.update(signalFrame(), parameters, 0.7);

  expect(geometry.vertexCount).toBeGreaterThan(0);
  expect(
    geometry.vertices
      .subarray(0, geometry.vertexCount * 3)
      .every((value) => value >= -1.1 && value <= 1.1),
  ).toBe(true);
});
