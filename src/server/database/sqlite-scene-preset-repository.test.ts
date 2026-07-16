import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { createDefaultLightMachineSceneState } from "@/core/scene/light-machine-scene";
import {
  createDefaultSignalSceneState,
  DEFAULT_SIGNAL_SCENE_PARAMETERS,
} from "@/core/scene/signal-scene";
import { applyMigrations } from "@/server/database/migrations";
import { SqliteScenePresetRepository } from "@/server/database/sqlite-scene-preset-repository";

test("round-trips and updates a signal scene preset with stable identity", () => {
  using database = new Database(":memory:", { strict: true });
  applyMigrations(database);
  const repository = new SqliteScenePresetRepository(database);

  const saved = repository.savePreset(
    "Night trace",
    createDefaultSignalSceneState(),
  );
  const updated = repository.savePreset("Night trace", {
    ...createDefaultSignalSceneState(),
    parameters: {
      ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
      mode: "lissajous",
      persistence: 0.9,
    },
  });

  expect(updated.id).toBe(saved.id);
  expect(repository.listPresets()).toEqual([
    expect.objectContaining({
      id: saved.id,
      name: "Night trace",
      parameters: expect.objectContaining({
        mode: "lissajous",
        persistence: 0.9,
      }),
    }),
  ]);
});

test("round-trips both scene kinds without changing the Task 1 schema", () => {
  using database = new Database(":memory:", { strict: true });
  applyMigrations(database);
  const repository = new SqliteScenePresetRepository(database);
  const legacyTimestamp = "2026-07-15T00:00:00.000Z";

  database
    .query(`
      INSERT INTO scene_presets (
        id, scene_id, scene_version, name, parameters_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      "preset_00000000-0000-4000-8000-000000000001",
      "signal",
      1,
      "Signal legacy",
      JSON.stringify(DEFAULT_SIGNAL_SCENE_PARAMETERS),
      legacyTimestamp,
      legacyTimestamp,
    );
  repository.savePreset("Prism engine", {
    ...createDefaultLightMachineSceneState(),
    parameters: {
      ...createDefaultLightMachineSceneState().parameters,
      palette: "ultraviolet",
      symmetry: 8,
    },
  });

  expect(repository.listPresets()).toEqual([
    expect.objectContaining({
      name: "Prism engine",
      sceneId: "light-machine",
      parameters: expect.objectContaining({
        palette: "ultraviolet",
        symmetry: 8,
      }),
    }),
    expect.objectContaining({
      name: "Signal legacy",
      sceneId: "signal",
      sceneVersion: 1,
      parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
      createdAt: legacyTimestamp,
      updatedAt: legacyTimestamp,
    }),
  ]);
});
