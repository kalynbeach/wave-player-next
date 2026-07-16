import type { SignalProvider } from "@/app/visualization/signal-provider";
import type {
  VisualizationRenderer,
  VisualizationRendererStatus,
} from "@/app/visualization/visualization-session";
import type { SceneDefinition, SceneState } from "@/core/scene/scene-registry";

export type VisualizationRendererCreateOptions = {
  canvas: HTMLCanvasElement;
  signalProvider: SignalProvider;
  state: SceneState;
  onStatus: (status: VisualizationRendererStatus) => void;
};

export type VisualizationSceneDefinition = {
  scene: SceneDefinition;
  createRenderer: (
    options: VisualizationRendererCreateOptions,
  ) => Promise<VisualizationRenderer | null>;
};

export class VisualizationSceneRegistry {
  readonly #definitions: readonly VisualizationSceneDefinition[];
  readonly #definitionsById: ReadonlyMap<string, VisualizationSceneDefinition>;

  constructor(definitions: readonly VisualizationSceneDefinition[]) {
    const definitionsById = new Map<string, VisualizationSceneDefinition>();

    for (const definition of definitions) {
      if (definitionsById.has(definition.scene.id)) {
        throw new Error(
          `Duplicate visualization scene ID: ${definition.scene.id}.`,
        );
      }
      definitionsById.set(definition.scene.id, definition);
    }

    this.#definitions = Object.freeze([...definitions]);
    this.#definitionsById = definitionsById;
  }

  list(): readonly VisualizationSceneDefinition[] {
    return this.#definitions;
  }

  get(id: string): VisualizationSceneDefinition {
    const definition = this.#definitionsById.get(id);

    if (!definition) {
      throw new Error(`Unknown visualization scene ID: ${id}.`);
    }

    return definition;
  }

  createRenderer(
    options: VisualizationRendererCreateOptions,
  ): Promise<VisualizationRenderer | null> {
    const definition = this.get(options.state.sceneId);
    const state = definition.scene.parseState(options.state);

    return definition.createRenderer({ ...options, state });
  }
}
