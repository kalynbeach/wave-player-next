import type { ScenePresetRepository } from "@/app/scene/scene-preset-ports";
import type { ScenePreset, SceneState } from "@/core/scene/scene-registry";

export class ScenePresetService {
  readonly #repository: ScenePresetRepository;

  constructor(repository: ScenePresetRepository) {
    this.#repository = repository;
  }

  list(): ScenePreset[] {
    return this.#repository.listPresets();
  }

  save(name: string, state: SceneState): ScenePreset {
    return this.#repository.savePreset(name.trim(), state);
  }
}
