import { expect, test } from "bun:test";

import { parseScenePresetId } from "@/core/library/ids";
import {
  BUILT_IN_SCENE_REGISTRY,
  parseScenePreset,
  SceneRegistry,
  SIGNAL_SCENE_DEFINITION,
} from "@/core/scene/scene-registry";
import { DEFAULT_SIGNAL_SCENE_PARAMETERS } from "@/core/scene/signal-scene";

test("exposes exactly the two built-in scenes and rejects invalid IDs", () => {
  expect(
    BUILT_IN_SCENE_REGISTRY.list().map((definition) => definition.id),
  ).toEqual(["signal", "light-machine"]);
  expect(() => BUILT_IN_SCENE_REGISTRY.get("unknown")).toThrow(
    "Unknown scene ID",
  );
  expect(
    () => new SceneRegistry([SIGNAL_SCENE_DEFINITION, SIGNAL_SCENE_DEFINITION]),
  ).toThrow("Duplicate scene ID");
});

test("strictly validates scene versions and preserves signal presets", () => {
  expect(() =>
    BUILT_IN_SCENE_REGISTRY.parseState({
      sceneId: "signal",
      sceneVersion: 2,
      parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    }),
  ).toThrow("signal scene version is unsupported");
  expect(() =>
    BUILT_IN_SCENE_REGISTRY.parseState({
      sceneId: "light-machine",
      sceneVersion: 2,
      parameters: {},
    }),
  ).toThrow("light-machine scene version is unsupported");

  const preset = {
    id: parseScenePresetId("preset_00000000-0000-4000-8000-000000000001"),
    name: "Night trace",
    sceneId: "signal",
    sceneVersion: 1,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  } as const;

  expect(parseScenePreset(preset)).toEqual(preset);
});
