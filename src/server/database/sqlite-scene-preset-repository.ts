import type { Database } from "bun:sqlite";

import type { ScenePresetRepository } from "@/app/scene/scene-preset-ports";
import { parseScenePresetId } from "@/core/library/ids";
import {
  parseSignalSceneParameters,
  SIGNAL_SCENE_ID,
  SIGNAL_SCENE_VERSION,
  type SignalSceneParameters,
  type SignalScenePreset,
} from "@/core/scene/signal-scene";

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

function presetFromRow(row: PresetRow): SignalScenePreset {
  if (
    row.scene_id !== SIGNAL_SCENE_ID ||
    row.scene_version !== SIGNAL_SCENE_VERSION
  ) {
    throw new Error("The stored signal preset version is unsupported.");
  }

  return {
    id: parseScenePresetId(row.id),
    name: row.name,
    sceneId: SIGNAL_SCENE_ID,
    sceneVersion: SIGNAL_SCENE_VERSION,
    parameters: parseSignalSceneParameters(JSON.parse(row.parameters_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteScenePresetRepository implements ScenePresetRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  listSignalPresets(): SignalScenePreset[] {
    return this.#database
      .query<PresetRow, [string]>(`
        SELECT id, name, scene_id, scene_version, parameters_json,
          created_at, updated_at
        FROM scene_presets
        WHERE scene_id = ?
        ORDER BY name COLLATE NOCASE
      `)
      .all(SIGNAL_SCENE_ID)
      .map(presetFromRow);
  }

  saveSignalPreset(
    name: string,
    parameters: SignalSceneParameters,
  ): SignalScenePreset {
    const existing = this.#database
      .query<{ id: string }, [string, string]>(`
        SELECT id
        FROM scene_presets
        WHERE scene_id = ? AND name = ?
      `)
      .get(SIGNAL_SCENE_ID, name);
    const timestamp = new Date().toISOString();
    const id = existing ? parseScenePresetId(existing.id) : newPresetId();
    const parametersJson = JSON.stringify(parameters);

    if (existing) {
      this.#database
        .query<unknown, [number, string, string, string, string]>(`
          UPDATE scene_presets
          SET scene_version = ?, parameters_json = ?, palette_json = NULL,
            updated_at = ?
          WHERE id = ? AND scene_id = ?
        `)
        .run(
          SIGNAL_SCENE_VERSION,
          parametersJson,
          timestamp,
          id,
          SIGNAL_SCENE_ID,
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
          SIGNAL_SCENE_ID,
          SIGNAL_SCENE_VERSION,
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
      throw new Error("The signal scene preset could not be loaded.");
    }

    return presetFromRow(saved);
  }
}
