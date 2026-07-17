import type { ScenePreset, SceneState } from "@/core/scene/scene-registry";

export interface ScenePresetRepository {
  listPresets(): ScenePreset[];
  savePreset(name: string, state: SceneState): ScenePreset;
}
