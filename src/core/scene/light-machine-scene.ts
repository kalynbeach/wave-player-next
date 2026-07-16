import type { ScenePresetId } from "@/core/library/ids";

export const LIGHT_MACHINE_SCENE_ID = "light-machine";
export const LIGHT_MACHINE_SCENE_VERSION = 1;

export const LIGHT_MACHINE_PALETTES = [
  "electric",
  "ember",
  "ultraviolet",
] as const;
export const LIGHT_MACHINE_SYMMETRIES = [2, 4, 6, 8] as const;

export type LightMachinePalette = (typeof LIGHT_MACHINE_PALETTES)[number];
export type LightMachineSymmetry = (typeof LIGHT_MACHINE_SYMMETRIES)[number];

export type LightMachineSceneParameters = {
  feedback: number;
  symmetry: LightMachineSymmetry;
  rotation: number;
  zoom: number;
  palette: LightMachinePalette;
  colorCycle: number;
  audioModulation: number;
  intensity: number;
};

export type LightMachineSceneState = {
  sceneId: typeof LIGHT_MACHINE_SCENE_ID;
  sceneVersion: typeof LIGHT_MACHINE_SCENE_VERSION;
  parameters: LightMachineSceneParameters;
};

export type LightMachineScenePreset = {
  id: ScenePresetId;
  name: string;
  sceneId: typeof LIGHT_MACHINE_SCENE_ID;
  sceneVersion: typeof LIGHT_MACHINE_SCENE_VERSION;
  parameters: LightMachineSceneParameters;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS: LightMachineSceneParameters =
  {
    feedback: 0.88,
    symmetry: 4,
    rotation: 0,
    zoom: 1.04,
    palette: "electric",
    colorCycle: 0.18,
    audioModulation: 0.72,
    intensity: 1.1,
  };

const LIGHT_MACHINE_PARAMETER_KEYS = [
  "audioModulation",
  "colorCycle",
  "feedback",
  "intensity",
  "palette",
  "rotation",
  "symmetry",
  "zoom",
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

function isPalette(value: unknown): value is LightMachinePalette {
  return LIGHT_MACHINE_PALETTES.some((palette) => palette === value);
}

function isSymmetry(value: unknown): value is LightMachineSymmetry {
  return LIGHT_MACHINE_SYMMETRIES.some((symmetry) => symmetry === value);
}

export function parseLightMachineSceneParameters(
  value: unknown,
): LightMachineSceneParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Light-machine scene parameters must be an object.");
  }

  const parameters = value as Record<string, unknown>;
  const keys = Object.keys(parameters).sort();

  if (
    keys.length !== LIGHT_MACHINE_PARAMETER_KEYS.length ||
    keys.some((key, index) => key !== LIGHT_MACHINE_PARAMETER_KEYS[index])
  ) {
    throw new Error("Light-machine parameters contain unsupported fields.");
  }

  if (!isSymmetry(parameters.symmetry)) {
    throw new Error("Symmetry must be one of 2, 4, 6, or 8.");
  }

  if (!isPalette(parameters.palette)) {
    throw new Error("Light-machine palette is invalid.");
  }

  return {
    feedback: finiteNumber(parameters.feedback, "Feedback", 0.5, 0.97),
    symmetry: parameters.symmetry,
    rotation: finiteNumber(parameters.rotation, "Rotation", -180, 180),
    zoom: finiteNumber(parameters.zoom, "Zoom", 0.7, 1.6),
    palette: parameters.palette,
    colorCycle: finiteNumber(parameters.colorCycle, "Color cycle", -1, 1),
    audioModulation: finiteNumber(
      parameters.audioModulation,
      "Audio modulation",
      0,
      1,
    ),
    intensity: finiteNumber(parameters.intensity, "Intensity", 0.4, 2.4),
  };
}

export function createDefaultLightMachineSceneState(): LightMachineSceneState {
  return {
    sceneId: LIGHT_MACHINE_SCENE_ID,
    sceneVersion: LIGHT_MACHINE_SCENE_VERSION,
    parameters: { ...DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS },
  };
}

export function parseLightMachineSceneState(
  value: unknown,
): LightMachineSceneState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Light-machine scene state must be an object.");
  }

  const state = value as Record<string, unknown>;

  if (
    state.sceneId !== LIGHT_MACHINE_SCENE_ID ||
    state.sceneVersion !== LIGHT_MACHINE_SCENE_VERSION
  ) {
    throw new Error("The light-machine scene version is unsupported.");
  }

  return {
    sceneId: LIGHT_MACHINE_SCENE_ID,
    sceneVersion: LIGHT_MACHINE_SCENE_VERSION,
    parameters: parseLightMachineSceneParameters(state.parameters),
  };
}

function randomUnit(random: () => number): number {
  const value = random();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("The variation source must return values from 0 to 1.");
  }

  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function varyNumber(
  value: number,
  span: number,
  minimum: number,
  maximum: number,
  random: () => number,
): number {
  return clamp(value + (randomUnit(random) * 2 - 1) * span, minimum, maximum);
}

function chooseDifferent<Value>(
  values: readonly Value[],
  current: Value,
  random: () => number,
): Value {
  const alternatives = values.filter((value) => value !== current);
  const index = Math.floor(randomUnit(random) * alternatives.length);
  const selected = alternatives[index];

  if (selected === undefined) {
    throw new Error("A variation alternative could not be selected.");
  }

  return selected;
}

export function varyLightMachineSceneParameters(
  value: LightMachineSceneParameters,
  random: () => number = Math.random,
): LightMachineSceneParameters {
  const parameters = parseLightMachineSceneParameters(value);

  return parseLightMachineSceneParameters({
    feedback: varyNumber(parameters.feedback, 0.06, 0.5, 0.97, random),
    symmetry: chooseDifferent(
      LIGHT_MACHINE_SYMMETRIES,
      parameters.symmetry,
      random,
    ),
    rotation: varyNumber(parameters.rotation, 42, -180, 180, random),
    zoom: varyNumber(parameters.zoom, 0.22, 0.7, 1.6, random),
    palette: chooseDifferent(
      LIGHT_MACHINE_PALETTES,
      parameters.palette,
      random,
    ),
    colorCycle: varyNumber(parameters.colorCycle, 0.28, -1, 1, random),
    audioModulation: varyNumber(parameters.audioModulation, 0.22, 0, 1, random),
    intensity: varyNumber(parameters.intensity, 0.38, 0.4, 2.4, random),
  });
}
