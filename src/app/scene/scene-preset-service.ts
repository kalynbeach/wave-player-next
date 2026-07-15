import type { ScenePresetRepository } from "@/app/scene/scene-preset-ports";
import type {
  SignalSceneParameters,
  SignalScenePreset,
} from "@/core/scene/signal-scene";

export class ScenePresetService {
  readonly #repository: ScenePresetRepository;

  constructor(repository: ScenePresetRepository) {
    this.#repository = repository;
  }

  list(): SignalScenePreset[] {
    return this.#repository.listSignalPresets();
  }

  save(name: string, parameters: SignalSceneParameters): SignalScenePreset {
    return this.#repository.saveSignalPreset(name.trim(), parameters);
  }
}
