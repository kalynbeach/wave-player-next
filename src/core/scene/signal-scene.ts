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

export type SignalSceneState = {
  sceneId: typeof SIGNAL_SCENE_ID;
  sceneVersion: typeof SIGNAL_SCENE_VERSION;
  parameters: SignalSceneParameters;
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

const SIGNAL_PARAMETER_KEYS = [
  "gain",
  "lineWidth",
  "mode",
  "persistence",
  "xFrequency",
  "yFrequency",
] as const;

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
  const keys = Object.keys(parameters).sort();

  if (
    keys.length !== SIGNAL_PARAMETER_KEYS.length ||
    keys.some((key, index) => key !== SIGNAL_PARAMETER_KEYS[index])
  ) {
    throw new Error("Signal scene parameters contain unsupported fields.");
  }
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

export function createDefaultSignalSceneState(): SignalSceneState {
  return {
    sceneId: SIGNAL_SCENE_ID,
    sceneVersion: SIGNAL_SCENE_VERSION,
    parameters: { ...DEFAULT_SIGNAL_SCENE_PARAMETERS },
  };
}

export function parseSignalSceneState(value: unknown): SignalSceneState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Signal scene state must be an object.");
  }

  const state = value as Record<string, unknown>;

  if (
    state.sceneId !== SIGNAL_SCENE_ID ||
    state.sceneVersion !== SIGNAL_SCENE_VERSION
  ) {
    throw new Error("The signal scene version is unsupported.");
  }

  return {
    sceneId: SIGNAL_SCENE_ID,
    sceneVersion: SIGNAL_SCENE_VERSION,
    parameters: parseSignalSceneParameters(state.parameters),
  };
}
