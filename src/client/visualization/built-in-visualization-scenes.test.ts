import { expect, test } from "bun:test";

import { BUILT_IN_VISUALIZATION_SCENE_REGISTRY } from "@/client/visualization/built-in-visualization-scenes";
import { VisualizationSceneRegistry } from "@/client/visualization/visualization-scene-registry";
import { SIGNAL_SCENE_DEFINITION } from "@/core/scene/scene-registry";

test("registers exactly the two built-in renderer factories", () => {
  expect(
    BUILT_IN_VISUALIZATION_SCENE_REGISTRY.list().map(
      (definition) => definition.scene.id,
    ),
  ).toEqual(["signal", "light-machine"]);
  expect(() => BUILT_IN_VISUALIZATION_SCENE_REGISTRY.get("unknown")).toThrow(
    "Unknown visualization scene ID",
  );
  expect(
    () =>
      new VisualizationSceneRegistry([
        { scene: SIGNAL_SCENE_DEFINITION, createRenderer: async () => null },
        { scene: SIGNAL_SCENE_DEFINITION, createRenderer: async () => null },
      ]),
  ).toThrow("Duplicate visualization scene ID");
});
