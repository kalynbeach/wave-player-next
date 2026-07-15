import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { DEFAULT_SIGNAL_SCENE_PARAMETERS } from "@/core/scene/signal-scene";
import { applyMigrations } from "@/server/database/migrations";
import { SqliteScenePresetRepository } from "@/server/database/sqlite-scene-preset-repository";

test("round-trips and updates a signal scene preset with stable identity", () => {
  using database = new Database(":memory:", { strict: true });
  applyMigrations(database);
  const repository = new SqliteScenePresetRepository(database);

  const saved = repository.saveSignalPreset(
    "Night trace",
    DEFAULT_SIGNAL_SCENE_PARAMETERS,
  );
  const updated = repository.saveSignalPreset("Night trace", {
    ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
    mode: "lissajous",
    persistence: 0.9,
  });

  expect(updated.id).toBe(saved.id);
  expect(repository.listSignalPresets()).toEqual([
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
