import { VisualizationSceneRegistry } from "@/client/visualization/visualization-scene-registry";
import { WebGpuLightMachineRenderer } from "@/client/visualization/webgpu-light-machine-renderer";
import { WebGpuSignalRenderer } from "@/client/visualization/webgpu-signal-renderer";
import {
  LIGHT_MACHINE_SCENE_DEFINITION,
  SIGNAL_SCENE_DEFINITION,
} from "@/core/scene/scene-registry";

export const BUILT_IN_VISUALIZATION_SCENE_REGISTRY =
  new VisualizationSceneRegistry([
    {
      scene: SIGNAL_SCENE_DEFINITION,
      createRenderer: async (options) => {
        if (options.state.sceneId !== "signal") {
          throw new Error("The signal scene factory received another scene.");
        }

        return WebGpuSignalRenderer.create({
          canvas: options.canvas,
          signalProvider: options.signalProvider,
          parameters: options.state.parameters,
          onStatus: options.onStatus,
        });
      },
    },
    {
      scene: LIGHT_MACHINE_SCENE_DEFINITION,
      createRenderer: async (options) => {
        if (options.state.sceneId !== "light-machine") {
          throw new Error(
            "The light-machine scene factory received another scene.",
          );
        }

        return WebGpuLightMachineRenderer.create({
          canvas: options.canvas,
          signalProvider: options.signalProvider,
          parameters: options.state.parameters,
          onStatus: options.onStatus,
        });
      },
    },
  ]);
