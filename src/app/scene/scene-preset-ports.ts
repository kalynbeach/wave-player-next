import type {
  SignalSceneParameters,
  SignalScenePreset,
} from "@/core/scene/signal-scene";

export interface ScenePresetRepository {
  listSignalPresets(): SignalScenePreset[];
  saveSignalPreset(
    name: string,
    parameters: SignalSceneParameters,
  ): SignalScenePreset;
}
