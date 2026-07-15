import { expect, test } from "bun:test";

import { resolveRuntimeConfig } from "@/server/runtime-config";

test("resolves an isolated runtime database and CLI library override", () => {
  expect(
    resolveRuntimeConfig(["--library-root", "/music"], {
      PORT: "3210",
      WAVE_PLAYER_DATA_DIR: "/tmp/wave-player-test",
    }),
  ).toEqual({
    port: 3210,
    databasePath: "/tmp/wave-player-test/wave-player.sqlite",
    libraryRootOverride: "/music",
  });
});

test("supports inline and environment library overrides", () => {
  expect(
    resolveRuntimeConfig(["--library-root=/cli"], {
      WAVE_PLAYER_DATA_DIR: "/tmp/wave-player-test",
      WAVE_PLAYER_LIBRARY_ROOT: "/environment",
    }).libraryRootOverride,
  ).toBe("/cli");
  expect(
    resolveRuntimeConfig([], {
      WAVE_PLAYER_DATA_DIR: "/tmp/wave-player-test",
      WAVE_PLAYER_LIBRARY_ROOT: "/environment",
    }).libraryRootOverride,
  ).toBe("/environment");
});

test("rejects invalid ports", () => {
  expect(() =>
    resolveRuntimeConfig([], {
      PORT: "70000",
      WAVE_PLAYER_DATA_DIR: "/tmp/wave-player-test",
    }),
  ).toThrow("PORT must be an integer");
});
