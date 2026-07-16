import type { SignalProvider } from "@/app/visualization/signal-provider";
import type {
  VisualizationPerformanceAction,
  VisualizationRenderer,
  VisualizationRendererStatus,
  VisualizationSession,
  VisualizationSessionSnapshot,
} from "@/app/visualization/visualization-session";
import type { VisualizationSceneRegistry } from "@/client/visualization/visualization-scene-registry";
import {
  LIGHT_MACHINE_PALETTES,
  LIGHT_MACHINE_SCENE_ID,
  parseLightMachineSceneParameters,
  varyLightMachineSceneParameters,
} from "@/core/scene/light-machine-scene";
import {
  parseScenePreset,
  type SceneId,
  type ScenePreset,
  type SceneState,
} from "@/core/scene/scene-registry";
import {
  parseSignalSceneParameters,
  SIGNAL_SCENE_ID,
} from "@/core/scene/signal-scene";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function wrapRotation(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

export class BrowserVisualizationSession implements VisualizationSession {
  readonly #listeners = new Set<() => void>();
  readonly #random: () => number;
  readonly #registry: VisualizationSceneRegistry;
  readonly #signalProvider: SignalProvider;
  readonly #states = new Map<SceneId, SceneState>();
  #active = true;
  #canvas: HTMLCanvasElement | null = null;
  #disposed = false;
  #renderer: VisualizationRenderer | null = null;
  #rendererGeneration = 0;
  #rendererWork: Promise<void> = Promise.resolve();
  #snapshot: VisualizationSessionSnapshot;

  constructor(options: {
    registry: VisualizationSceneRegistry;
    signalProvider: SignalProvider;
    initialSceneId?: SceneId;
    random?: () => number;
  }) {
    this.#registry = options.registry;
    this.#signalProvider = options.signalProvider;
    this.#random = options.random ?? Math.random;

    for (const definition of this.#registry.list()) {
      this.#states.set(
        definition.scene.id,
        definition.scene.createDefaultState(),
      );
    }

    const initialSceneId = options.initialSceneId ?? SIGNAL_SCENE_ID;
    const initialScene = this.#stateFor(initialSceneId);
    this.#snapshot = {
      scene: initialScene,
      status: { state: "initializing" },
    };
  }

  getSnapshot(): VisualizationSessionSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  attachSurface(canvas: HTMLCanvasElement): () => void {
    this.#assertActive();

    if (this.#canvas === canvas) {
      return () => undefined;
    }

    this.#detachSurface();
    this.#canvas = canvas;
    void this.#replaceRenderer();

    return () => {
      if (this.#canvas === canvas) {
        this.#detachSurface();
      }
    };
  }

  selectScene(sceneId: string): void {
    this.#assertActive();
    const scene = this.#stateFor(sceneId);

    if (scene.sceneId === this.#snapshot.scene.sceneId) {
      return;
    }

    this.#snapshot = { scene, status: { state: "initializing" } };
    this.#emit();
    void this.#replaceRenderer();
  }

  setState(state: SceneState): void {
    this.#assertActive();
    const definition = this.#registry.get(state.sceneId);
    const validatedState = definition.scene.parseState(state);
    this.#states.set(validatedState.sceneId, validatedState);

    if (validatedState.sceneId !== this.#snapshot.scene.sceneId) {
      return;
    }

    this.#snapshot = { ...this.#snapshot, scene: validatedState };
    this.#renderer?.setState(validatedState);
    this.#emit();
  }

  loadPreset(preset: ScenePreset): void {
    this.#assertActive();
    const validatedPreset = parseScenePreset(preset);
    const state = this.#registry
      .get(validatedPreset.sceneId)
      .scene.parseState(validatedPreset);
    this.#states.set(state.sceneId, state);

    if (state.sceneId !== this.#snapshot.scene.sceneId) {
      this.#snapshot = { scene: state, status: { state: "initializing" } };
      this.#emit();
      void this.#replaceRenderer();
      return;
    }

    this.setState(state);
  }

  reset(): void {
    this.setState(
      this.#registry
        .get(this.#snapshot.scene.sceneId)
        .scene.createDefaultState(),
    );
  }

  vary(): void {
    this.#assertActive();

    if (this.#snapshot.scene.sceneId !== LIGHT_MACHINE_SCENE_ID) {
      throw new Error("Variation is available only for the light machine.");
    }

    this.setState({
      ...this.#snapshot.scene,
      parameters: varyLightMachineSceneParameters(
        this.#snapshot.scene.parameters,
        this.#random,
      ),
    });
  }

  dispatch(action: VisualizationPerformanceAction): void {
    this.#assertActive();
    const scene = this.#snapshot.scene;

    if (scene.sceneId === SIGNAL_SCENE_ID) {
      const horizontal =
        action.type === "shape"
          ? action.horizontal / 120
          : action.type === "nudge"
            ? action.horizontal * 0.1
            : 0;
      const vertical =
        action.type === "shape"
          ? -action.vertical / 320
          : action.type === "nudge"
            ? action.vertical * 0.1
            : 0;

      if (action.type !== "cycle-palette") {
        this.setState({
          ...scene,
          parameters: parseSignalSceneParameters({
            ...scene.parameters,
            gain: clamp(scene.parameters.gain + horizontal, 0.25, 4),
            persistence:
              action.type === "shape"
                ? clamp(scene.parameters.persistence + vertical, 0, 0.98)
                : scene.parameters.persistence,
            lineWidth:
              action.type === "nudge"
                ? clamp(scene.parameters.lineWidth + vertical, 0.5, 6)
                : scene.parameters.lineWidth,
          }),
        });
      }
      return;
    }

    if (action.type === "cycle-palette") {
      const paletteIndex = LIGHT_MACHINE_PALETTES.indexOf(
        scene.parameters.palette,
      );
      const palette =
        LIGHT_MACHINE_PALETTES[
          (paletteIndex + 1) % LIGHT_MACHINE_PALETTES.length
        ] ?? LIGHT_MACHINE_PALETTES[0];
      this.setState({
        ...scene,
        parameters: { ...scene.parameters, palette },
      });
      return;
    }

    const horizontal =
      action.type === "shape"
        ? action.horizontal * 0.35
        : action.horizontal * 4;
    const vertical =
      action.type === "shape" ? -action.vertical / 360 : action.vertical * 0.03;
    this.setState({
      ...scene,
      parameters: parseLightMachineSceneParameters({
        ...scene.parameters,
        rotation: wrapRotation(scene.parameters.rotation + horizontal),
        zoom: clamp(scene.parameters.zoom + vertical, 0.7, 1.6),
      }),
    });
  }

  setActive(active: boolean): void {
    this.#assertActive();
    this.#active = active;
    this.#renderer?.setActive(active);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#rendererGeneration += 1;
    this.#renderer?.dispose();
    this.#renderer = null;
    this.#canvas = null;
    this.#listeners.clear();
  }

  #stateFor(sceneId: string): SceneState {
    const definition = this.#registry.get(sceneId);
    const state = this.#states.get(definition.scene.id);

    if (!state) {
      throw new Error(`Scene state is unavailable: ${sceneId}.`);
    }

    return state;
  }

  #detachSurface(): void {
    this.#rendererGeneration += 1;
    this.#renderer?.dispose();
    this.#renderer = null;
    this.#canvas = null;
  }

  #replaceRenderer(): void {
    const canvas = this.#canvas;
    if (!canvas || this.#disposed) return;

    const generation = ++this.#rendererGeneration;
    this.#renderer?.dispose();
    this.#renderer = null;
    this.#setStatus({ state: "initializing" });
    this.#rendererWork = this.#rendererWork
      .catch(() => undefined)
      .then(() => this.#createRenderer({ canvas, generation }))
      .catch((cause) => {
        if (
          generation === this.#rendererGeneration &&
          !this.#disposed &&
          this.#canvas === canvas
        ) {
          try {
            this.#setStatus({
              state: "error",
              message:
                cause instanceof Error && cause.message
                  ? cause.message
                  : "The visualization renderer could not be activated.",
            });
          } catch {
            // Keep renderer work recoverable even if a subscriber throws.
          }
        }
      });
  }

  async #createRenderer(options: {
    canvas: HTMLCanvasElement;
    generation: number;
  }): Promise<void> {
    const { canvas, generation } = options;

    if (
      generation !== this.#rendererGeneration ||
      this.#disposed ||
      this.#canvas !== canvas
    ) {
      return;
    }

    let renderer: VisualizationRenderer | null;

    try {
      renderer = await this.#registry.createRenderer({
        canvas,
        signalProvider: this.#signalProvider,
        state: this.#snapshot.scene,
        onStatus: (status) => {
          if (generation === this.#rendererGeneration && !this.#disposed) {
            this.#setStatus(status);
          }
        },
      });
    } catch (cause) {
      if (
        generation === this.#rendererGeneration &&
        !this.#disposed &&
        this.#canvas === canvas
      ) {
        this.#setStatus({
          state: "error",
          message:
            cause instanceof Error && cause.message
              ? cause.message
              : "The visualization renderer could not be created.",
        });
      }
      return;
    }

    if (
      generation !== this.#rendererGeneration ||
      this.#disposed ||
      this.#canvas !== canvas
    ) {
      try {
        renderer?.dispose();
      } catch {
        // A stale renderer cannot be allowed to poison current ownership.
      }
      return;
    }

    try {
      renderer?.setState(this.#snapshot.scene);
      renderer?.setActive(this.#active);
    } catch (cause) {
      try {
        renderer?.dispose();
      } catch {
        // Preserve the activation error as the actionable failure.
      }
      this.#setStatus({
        state: "error",
        message:
          cause instanceof Error && cause.message
            ? cause.message
            : "The visualization renderer could not be activated.",
      });
      return;
    }

    this.#renderer = renderer;
  }

  #setStatus(
    status: VisualizationRendererStatus | { state: "initializing" },
  ): void {
    if (this.#snapshot.status.state === status.state) {
      if (
        !("message" in status) ||
        ("message" in this.#snapshot.status &&
          this.#snapshot.status.message === status.message)
      ) {
        return;
      }
    }

    this.#snapshot = { ...this.#snapshot, status };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("The visualization session has been disposed.");
    }
  }
}
