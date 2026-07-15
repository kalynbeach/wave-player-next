import type { ScenePresetId } from "@/core/library/ids";

export const SIGNAL_SCENE_ID = "signal";
export const SIGNAL_SCENE_VERSION = 1;

export type SignalSceneMode = "lissajous" | "oscilloscope";

export type SignalSceneParameters = {
  mode: SignalSceneMode;
  gain: number;
  lineWidth: number;
  persistence: number;
  xFrequency: number;
  yFrequency: number;
};

export type SignalScenePreset = {
  id: ScenePresetId;
  name: string;
  sceneId: typeof SIGNAL_SCENE_ID;
  sceneVersion: typeof SIGNAL_SCENE_VERSION;
  parameters: SignalSceneParameters;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SIGNAL_SCENE_PARAMETERS: SignalSceneParameters = {
  mode: "oscilloscope",
  gain: 1.15,
  lineWidth: 1.8,
  persistence: 0.82,
  xFrequency: 3,
  yFrequency: 2,
};

function finiteNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }

  return value;
}

export function parseSignalSceneParameters(
  value: unknown,
): SignalSceneParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Signal scene parameters must be an object.");
  }

  const parameters = value as Record<string, unknown>;
  const mode = parameters.mode;

  if (mode !== "oscilloscope" && mode !== "lissajous") {
    throw new Error("Signal scene mode is invalid.");
  }

  return {
    mode,
    gain: finiteNumber(parameters.gain, "Gain", 0.25, 4),
    lineWidth: finiteNumber(parameters.lineWidth, "Line width", 0.5, 6),
    persistence: finiteNumber(parameters.persistence, "Persistence", 0, 0.98),
    xFrequency: finiteNumber(parameters.xFrequency, "X frequency", 1, 8),
    yFrequency: finiteNumber(parameters.yFrequency, "Y frequency", 1, 8),
  };
}
