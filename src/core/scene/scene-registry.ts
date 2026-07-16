import { parseScenePresetId } from "@/core/library/ids";
import {
  createDefaultLightMachineSceneState,
  LIGHT_MACHINE_SCENE_ID,
  LIGHT_MACHINE_SCENE_VERSION,
  type LightMachineScenePreset,
  parseLightMachineSceneParameters,
  parseLightMachineSceneState,
} from "@/core/scene/light-machine-scene";
import {
  createDefaultSignalSceneState,
  parseSignalSceneParameters,
  parseSignalSceneState,
  SIGNAL_SCENE_ID,
  SIGNAL_SCENE_VERSION,
  type SignalScenePreset,
} from "@/core/scene/signal-scene";

export type SceneId = typeof LIGHT_MACHINE_SCENE_ID | typeof SIGNAL_SCENE_ID;
export type SceneState =
  | ReturnType<typeof createDefaultLightMachineSceneState>
  | ReturnType<typeof createDefaultSignalSceneState>;
export type ScenePreset = LightMachineScenePreset | SignalScenePreset;

export type SceneDefinition = {
  id: SceneId;
  version: number;
  name: string;
  description: string;
  createDefaultState: () => SceneState;
  parseParameters: (value: unknown) => SceneState["parameters"];
  parseState: (value: unknown) => SceneState;
};

export const SIGNAL_SCENE_DEFINITION: SceneDefinition = {
  id: SIGNAL_SCENE_ID,
  version: SIGNAL_SCENE_VERSION,
  name: "Signal",
  description: "Oscilloscope and stereo Lissajous instrument.",
  createDefaultState: createDefaultSignalSceneState,
  parseParameters: parseSignalSceneParameters,
  parseState: parseSignalSceneState,
};

export const LIGHT_MACHINE_SCENE_DEFINITION: SceneDefinition = {
  id: LIGHT_MACHINE_SCENE_ID,
  version: LIGHT_MACHINE_SCENE_VERSION,
  name: "Light machine",
  description: "Feedback light synthesizer with audio-reactive symmetry.",
  createDefaultState: createDefaultLightMachineSceneState,
  parseParameters: parseLightMachineSceneParameters,
  parseState: parseLightMachineSceneState,
};

export class SceneRegistry {
  readonly #definitions: readonly SceneDefinition[];
  readonly #definitionsById: ReadonlyMap<string, SceneDefinition>;

  constructor(definitions: readonly SceneDefinition[]) {
    const definitionsById = new Map<string, SceneDefinition>();

    for (const definition of definitions) {
      if (definitionsById.has(definition.id)) {
        throw new Error(`Duplicate scene ID: ${definition.id}.`);
      }
      definitionsById.set(definition.id, definition);
    }

    this.#definitions = Object.freeze([...definitions]);
    this.#definitionsById = definitionsById;
  }

  list(): readonly SceneDefinition[] {
    return this.#definitions;
  }

  get(id: string): SceneDefinition {
    const definition = this.#definitionsById.get(id);

    if (!definition) {
      throw new Error(`Unknown scene ID: ${id}.`);
    }

    return definition;
  }

  createDefaultState(id: string): SceneState {
    return this.get(id).createDefaultState();
  }

  parseState(value: unknown): SceneState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Scene state must be an object.");
    }

    const state = value as Record<string, unknown>;

    if (typeof state.sceneId !== "string") {
      throw new Error("Scene state must include a scene ID.");
    }

    return this.get(state.sceneId).parseState(value);
  }
}

export const BUILT_IN_SCENE_REGISTRY = new SceneRegistry([
  SIGNAL_SCENE_DEFINITION,
  LIGHT_MACHINE_SCENE_DEFINITION,
]);

export function parseScenePreset(value: unknown): ScenePreset {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Scene preset must be an object.");
  }

  const preset = value as Record<string, unknown>;
  const state = BUILT_IN_SCENE_REGISTRY.parseState({
    sceneId: preset.sceneId,
    sceneVersion: preset.sceneVersion,
    parameters: preset.parameters,
  });

  if (typeof preset.name !== "string" || preset.name.trim().length === 0) {
    throw new Error("Scene preset name is required.");
  }
  if (typeof preset.createdAt !== "string" || preset.createdAt.length === 0) {
    throw new Error("Scene preset creation time is required.");
  }
  if (typeof preset.updatedAt !== "string" || preset.updatedAt.length === 0) {
    throw new Error("Scene preset update time is required.");
  }
  if (typeof preset.id !== "string") {
    throw new Error("Scene preset ID is required.");
  }

  const common = {
    id: parseScenePresetId(preset.id),
    name: preset.name,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };

  if (state.sceneId === SIGNAL_SCENE_ID) {
    return { ...common, ...state };
  }

  return { ...common, ...state };
}
