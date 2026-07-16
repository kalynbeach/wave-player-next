import { expect, test } from "bun:test";

import {
  DEFAULT_SIGNAL_SCENE_PARAMETERS,
  parseSignalSceneParameters,
} from "@/core/scene/signal-scene";

test("accepts bounded oscilloscope and Lissajous parameters", () => {
  expect(parseSignalSceneParameters(DEFAULT_SIGNAL_SCENE_PARAMETERS)).toEqual(
    DEFAULT_SIGNAL_SCENE_PARAMETERS,
  );
  expect(
    parseSignalSceneParameters({
      ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
      mode: "lissajous",
      xFrequency: 5,
    }),
  ).toMatchObject({ mode: "lissajous", xFrequency: 5 });
});

test("rejects invalid signal scene parameters", () => {
  expect(() =>
    parseSignalSceneParameters({
      ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
      persistence: 1,
    }),
  ).toThrow("Persistence must be between 0 and 0.98");
  expect(() => parseSignalSceneParameters(null)).toThrow("must be an object");
  expect(() =>
    parseSignalSceneParameters({
      ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
      unsupported: true,
    }),
  ).toThrow("unsupported fields");
});
