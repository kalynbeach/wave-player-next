import { expect, test } from "bun:test";

import {
  createDefaultLightMachineSceneState,
  DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
  parseLightMachineSceneParameters,
  varyLightMachineSceneParameters,
} from "@/core/scene/light-machine-scene";

test("validates bounded light-machine parameters and strict versions", () => {
  expect(
    parseLightMachineSceneParameters(DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS),
  ).toEqual(DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS);
  expect(() =>
    parseLightMachineSceneParameters({
      ...DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
      feedback: 1,
    }),
  ).toThrow("Feedback must be between 0.5 and 0.97");
  expect(() =>
    parseLightMachineSceneParameters({
      ...DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
      palette: "unknown",
    }),
  ).toThrow("palette is invalid");
});

test("creates deterministic defaults and bounded variation", () => {
  expect(createDefaultLightMachineSceneState()).toEqual({
    sceneId: "light-machine",
    sceneVersion: 1,
    parameters: DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
  });

  const values = [0.9, 0.2, 0.75, 0.1, 0.6, 0.8, 0.35, 0.95];
  let index = 0;
  const varied = varyLightMachineSceneParameters(
    DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
    () => values[index++] ?? 0,
  );

  expect(varied).toMatchObject({
    symmetry: 2,
    palette: "ultraviolet",
  });
  expect(varied.feedback).toBeCloseTo(0.928);
  expect(varied.rotation).toBeCloseTo(21);
  expect(varied.zoom).toBeCloseTo(0.864);
  expect(varied.colorCycle).toBeCloseTo(0.348);
  expect(varied.audioModulation).toBeCloseTo(0.654);
  expect(varied.intensity).toBeCloseTo(1.1 + (0.95 * 2 - 1) * 0.38);
  expect(parseLightMachineSceneParameters(varied)).toEqual(varied);
  expect(DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS).toEqual(
    createDefaultLightMachineSceneState().parameters,
  );
});
