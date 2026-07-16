import type { Database } from "bun:sqlite";

import type { ScenePresetRepository } from "@/app/scene/scene-preset-ports";
import { parseScenePresetId } from "@/core/library/ids";
import {
  BUILT_IN_SCENE_REGISTRY,
  parseScenePreset,
  type ScenePreset,
  type SceneState,
} from "@/core/scene/scene-registry";

type PresetRow = {
  id: string;
  name: string;
  scene_id: string;
  scene_version: number;
  parameters_json: string;
  created_at: string;
  updated_at: string;
};

function newPresetId() {
  return parseScenePresetId(`preset_${Bun.randomUUIDv7()}`);
}

function presetFromRow(row: PresetRow): ScenePreset {
  return parseScenePreset({
    id: row.id,
    name: row.name,
    sceneId: row.scene_id,
    sceneVersion: row.scene_version,
    parameters: JSON.parse(row.parameters_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SqliteScenePresetRepository implements ScenePresetRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  listPresets(): ScenePreset[] {
    return this.#database
      .query<PresetRow, []>(`
        SELECT id, name, scene_id, scene_version, parameters_json,
          created_at, updated_at
        FROM scene_presets
        ORDER BY scene_id, name COLLATE NOCASE
      `)
      .all()
      .map(presetFromRow);
  }

  savePreset(name: string, state: SceneState): ScenePreset {
    const validatedState = BUILT_IN_SCENE_REGISTRY.parseState(state);
    const existing = this.#database
      .query<{ id: string }, [string, string]>(`
        SELECT id
        FROM scene_presets
        WHERE scene_id = ? AND name = ?
      `)
      .get(validatedState.sceneId, name);
    const timestamp = new Date().toISOString();
    const id = existing ? parseScenePresetId(existing.id) : newPresetId();
    const parametersJson = JSON.stringify(validatedState.parameters);

    if (existing) {
      this.#database
        .query<unknown, [number, string, string, string, string]>(`
          UPDATE scene_presets
          SET scene_version = ?, parameters_json = ?, palette_json = NULL,
            updated_at = ?
          WHERE id = ? AND scene_id = ?
        `)
        .run(
          validatedState.sceneVersion,
          parametersJson,
          timestamp,
          id,
          validatedState.sceneId,
        );
    } else {
      this.#database
        .query<
          unknown,
          [string, string, number, string, string, string, string]
        >(`
          INSERT INTO scene_presets (
            id, scene_id, scene_version, name, parameters_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          validatedState.sceneId,
          validatedState.sceneVersion,
          name,
          parametersJson,
          timestamp,
          timestamp,
        );
    }

    const saved = this.#database
      .query<PresetRow, [string]>(`
        SELECT id, name, scene_id, scene_version, parameters_json,
          created_at, updated_at
        FROM scene_presets
        WHERE id = ?
      `)
      .get(id);

    if (!saved) {
      throw new Error("The scene preset could not be loaded.");
    }

    return presetFromRow(saved);
  }
}
