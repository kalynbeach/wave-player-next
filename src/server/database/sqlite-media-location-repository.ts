import type { Database } from "bun:sqlite";

import type {
  ApprovedMediaLocation,
  MediaLocationRepository,
} from "@/app/media/media-ports";
import { type AssetLocationId, parseAssetLocationId } from "@/core/library/ids";

type MediaLocationRow = {
  id: string;
  canonical_root_path: string;
  canonical_path: string;
  available: number;
  root_enabled: number;
  mime_type: string;
};

export class SqliteMediaLocationRepository implements MediaLocationRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  findLocation(id: AssetLocationId): ApprovedMediaLocation | null {
    const row = this.#database
      .query<MediaLocationRow, [string]>(`
        SELECT asset_locations.id,
          library_roots.canonical_path AS canonical_root_path,
          asset_locations.canonical_path,
          asset_locations.available,
          library_roots.enabled AS root_enabled,
          assets.mime_type
        FROM asset_locations
        JOIN library_roots ON library_roots.id = asset_locations.root_id
        JOIN assets ON assets.id = asset_locations.asset_id
        WHERE asset_locations.id = ?
      `)
      .get(id);

    if (!row) {
      return null;
    }

    if (row.mime_type !== "audio/wav" && row.mime_type !== "audio/mpeg") {
      throw new Error(`Unknown audio MIME type: ${row.mime_type}`);
    }

    return {
      id: parseAssetLocationId(row.id),
      canonicalRootPath: row.canonical_root_path,
      canonicalPath: row.canonical_path,
      available: row.available === 1,
      rootEnabled: row.root_enabled === 1,
      mimeType: row.mime_type,
    };
  }
}
