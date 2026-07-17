import type { ScenePreset, SceneState } from "@/core/scene/scene-registry";

export type VisualizationRendererStatus =
  | { state: "ready" }
  | { state: "unsupported"; message: string }
  | { state: "error"; message: string };

export type VisualizationSessionStatus =
  | { state: "initializing" }
  | VisualizationRendererStatus;

export type VisualizationSessionSnapshot = {
  scene: SceneState;
  status: VisualizationSessionStatus;
};

export type VisualizationPerformanceAction =
  | { type: "shape"; horizontal: number; vertical: number }
  | { type: "nudge"; horizontal: -1 | 0 | 1; vertical: -1 | 0 | 1 }
  | { type: "cycle-palette" };

export interface VisualizationRenderer {
  setActive(active: boolean): void;
  setState(state: SceneState): void;
  dispose(): void;
}

export interface VisualizationSession {
  getSnapshot(): VisualizationSessionSnapshot;
  subscribe(listener: () => void): () => void;
  selectScene(sceneId: string): void;
  setState(state: SceneState): void;
  loadPreset(preset: ScenePreset): void;
  reset(): void;
  vary(): void;
  dispatch(action: VisualizationPerformanceAction): void;
  setActive(active: boolean): void;
  dispose(): void;
}
