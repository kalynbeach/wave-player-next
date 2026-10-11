import type { Database } from "bun:sqlite";

import type {
  FileScanResult,
  LibraryRepository,
  ReconcileResult,
  ScannedAudioFile,
} from "@/app/library/library-ports";
import { deriveTrackTitle } from "@/core/library/audio-file";
import {
  type LibraryRootId,
  parseAssetId,
  parseAssetLocationId,
  parseLibraryRootId,
  parseTrackId,
} from "@/core/library/ids";
import type {
  LibraryRoot,
  LibraryScanStatus,
  LibraryTrack,
} from "@/core/library/library";
import { applyMigrations } from "@/server/database/migrations";

type RootRow = {
  id: string;
  canonical_path: string;
  display_name: string;
  enabled: number;
  scan_status: string;
  last_scan_started_at: string | null;
  last_scan_completed_at: string | null;
  last_scan_message: string | null;
  supported_file_count: number;
  ignored_file_count: number;
};

type ExistingLocationRow = {
  id: string;
  asset_id: string;
  track_id: string;
  file_size_bytes: number;
  modified_at_ms: number;
  available: number;
};

type AvailableLocationRow = {
  id: string;
  relative_path: string;
};

type TrackRow = {
  track_id: string;
  title: string;
  asset_id: string;
  format: string;
  mime_type: string;
  file_size_bytes: number;
  modified_at_ms: number;
  location_id: string;
  relative_path: string;
  available: number;
};

function now(): string {
  return new Date().toISOString();
}

function newRootId() {
  return parseLibraryRootId(`root_${Bun.randomUUIDv7()}`);
}

function newTrackId() {
  return parseTrackId(`track_${Bun.randomUUIDv7()}`);
}

function newAssetId() {
  return parseAssetId(`asset_${Bun.randomUUIDv7()}`);
}

function newLocationId() {
  return parseAssetLocationId(`location_${Bun.randomUUIDv7()}`);
}

function scanStatus(value: string): LibraryScanStatus {
  switch (value) {
    case "idle":
    case "scanning":
    case "ready":
    case "partial":
    case "error":
      return value;
    default:
      throw new Error(`Unknown library scan status: ${value}`);
  }
}

function rootFromRow(row: RootRow): LibraryRoot {
  return {
    id: parseLibraryRootId(row.id),
    canonicalPath: row.canonical_path,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    scanStatus: scanStatus(row.scan_status),
    lastScanStartedAt: row.last_scan_started_at,
    lastScanCompletedAt: row.last_scan_completed_at,
    lastScanMessage: row.last_scan_message,
    supportedFileCount: row.supported_file_count,
    ignoredFileCount: row.ignored_file_count,
  };
}

function issueMessage(result: FileScanResult): string | null {
  if (result.complete) {
    return null;
  }

  const firstIssue = result.issues[0];
  return firstIssue
    ? `${result.issues.length} path(s) could not be read. ${firstIssue.message}`
    : "The scan did not complete.";
}

export class SqliteLibraryRepository implements LibraryRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
    applyMigrations(database);
  }

  getActiveRoot(): LibraryRoot | null {
    const row = this.#database
      .query<RootRow, []>(`
        SELECT id, canonical_path, display_name, enabled, scan_status,
          last_scan_started_at, last_scan_completed_at, last_scan_message,
          supported_file_count, ignored_file_count
        FROM library_roots
        WHERE enabled = 1
      `)
      .get();

    return row ? rootFromRow(row) : null;
  }

  replaceActiveRoot(canonicalPath: string, displayName: string): LibraryRoot {
    const transaction = this.#database.transaction(() => {
      const timestamp = now();
      const existing = this.#database
        .query<{ id: string }, [string]>(
          "SELECT id FROM library_roots WHERE canonical_path = ?",
        )
        .get(canonicalPath);
      const rootId = existing ? parseLibraryRootId(existing.id) : newRootId();

      this.#database
        .query<unknown, [string, string]>(`
          UPDATE library_roots
          SET enabled = 0, updated_at = ?
          WHERE enabled = 1 AND id != ?
        `)
        .run(timestamp, rootId);

      if (existing) {
        this.#database
          .query<unknown, [string, string, string, string]>(`
            UPDATE library_roots
            SET display_name = ?, enabled = 1, updated_at = ?
            WHERE id = ? AND canonical_path = ?
          `)
          .run(displayName, timestamp, rootId, canonicalPath);
      } else {
        this.#database
          .query<unknown, [string, string, string, string, string]>(`
            INSERT INTO library_roots (
              id, canonical_path, display_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .run(rootId, canonicalPath, displayName, timestamp, timestamp);
      }

      const root = this.getActiveRoot();

      if (!root) {
        throw new Error("The configured library root could not be loaded.");
      }

      return root;
    });

    return transaction.immediate();
  }

  beginScan(rootId: LibraryRootId): void {
    const result = this.#database
      .query<unknown, [string, string, string]>(`
        UPDATE library_roots
        SET scan_status = 'scanning', last_scan_started_at = ?,
          last_scan_message = NULL, updated_at = ?
        WHERE id = ? AND enabled = 1
      `)
      .run(now(), now(), rootId);

    if (result.changes !== 1) {
      throw new Error("The active library root is unavailable.");
    }
  }

  reconcileScan(
    rootId: LibraryRootId,
    result: FileScanResult,
  ): ReconcileResult {
    const transaction = this.#database.transaction(() => {
      const summary: ReconcileResult = {
        importedFileCount: 0,
        updatedFileCount: 0,
        unavailableFileCount: 0,
      };
      const scannedPaths = new Set<string>();

      for (const file of result.files) {
        scannedPaths.add(file.relativePath);
        const existing = this.#findLocation(rootId, file.relativePath);

        if (existing) {
          if (
            existing.file_size_bytes !== file.fileSizeBytes ||
            existing.modified_at_ms !== file.modifiedAtMs ||
            existing.available !== 1
          ) {
            this.#updateLocation(existing, file);
            summary.updatedFileCount += 1;
          }
        } else {
          this.#insertFile(rootId, file);
          summary.importedFileCount += 1;
        }
      }

      if (result.complete) {
        const availableLocations = this.#database
          .query<AvailableLocationRow, [string]>(`
            SELECT id, relative_path
            FROM asset_locations
            WHERE root_id = ? AND available = 1
          `)
          .all(rootId);

        for (const location of availableLocations) {
          if (!scannedPaths.has(location.relative_path)) {
            this.#database
              .query<unknown, [string, string, string]>(`
                UPDATE asset_locations
                SET available = 0, last_verified_at = ?, updated_at = ?
                WHERE id = ?
              `)
              .run(now(), now(), location.id);
            summary.unavailableFileCount += 1;
          }
        }
      }

      const availableCount = this.#database
        .query<{ count: number }, [string]>(`
          SELECT COUNT(*) AS count
          FROM asset_locations
          WHERE root_id = ? AND available = 1
        `)
        .get(rootId)?.count;

      this.#database
        .query<
          unknown,
          [string, string, string | null, number, number, string, string]
        >(`
          UPDATE library_roots
          SET scan_status = ?, last_scan_completed_at = ?,
            last_scan_message = ?, supported_file_count = ?,
            ignored_file_count = ?, updated_at = ?
          WHERE id = ? AND enabled = 1
        `)
        .run(
          result.complete ? "ready" : "partial",
          now(),
          issueMessage(result),
          availableCount ?? 0,
          result.ignoredFileCount,
          now(),
          rootId,
        );

      return summary;
    });

    return transaction.immediate();
  }

  failScan(rootId: LibraryRootId, message: string): void {
    this.#database
      .query<unknown, [string, string, string, string]>(`
        UPDATE library_roots
        SET scan_status = 'error', last_scan_completed_at = ?,
          last_scan_message = ?, updated_at = ?
        WHERE id = ? AND enabled = 1
      `)
      .run(now(), message, now(), rootId);
  }

  listTracks(): LibraryTrack[] {
    return this.#database
      .query<TrackRow, []>(`
        SELECT tracks.id AS track_id, tracks.title,
          assets.id AS asset_id, assets.format, assets.mime_type,
          assets.file_size_bytes, assets.modified_at_ms,
          asset_locations.id AS location_id,
          asset_locations.relative_path, asset_locations.available
        FROM asset_locations
        JOIN library_roots ON library_roots.id = asset_locations.root_id
        JOIN assets ON assets.id = asset_locations.asset_id
        JOIN tracks ON tracks.id = assets.track_id
        WHERE library_roots.enabled = 1
        ORDER BY tracks.title COLLATE NOCASE, asset_locations.relative_path
      `)
      .all()
      .map((row) => {
        if (row.format !== "wav" && row.format !== "mp3") {
          throw new Error(`Unknown audio format: ${row.format}`);
        }
        if (row.mime_type !== "audio/wav" && row.mime_type !== "audio/mpeg") {
          throw new Error(`Unknown audio MIME type: ${row.mime_type}`);
        }

        return {
          id: parseTrackId(row.track_id),
          title: row.title,
          asset: {
            id: parseAssetId(row.asset_id),
            format: row.format,
            mimeType: row.mime_type,
            fileSizeBytes: row.file_size_bytes,
            modifiedAtMs: row.modified_at_ms,
          },
          location: {
            id: parseAssetLocationId(row.location_id),
            relativePath: row.relative_path,
            available: row.available === 1,
          },
        };
      });
  }

  #findLocation(
    rootId: LibraryRootId,
    relativePath: string,
  ): ExistingLocationRow | null {
    return this.#database
      .query<ExistingLocationRow, [string, string]>(`
        SELECT asset_locations.id, asset_locations.asset_id,
          assets.track_id, assets.file_size_bytes, assets.modified_at_ms,
          asset_locations.available
        FROM asset_locations
        JOIN assets ON assets.id = asset_locations.asset_id
        WHERE asset_locations.root_id = ?
          AND asset_locations.relative_path = ?
      `)
      .get(rootId, relativePath);
  }

  #updateLocation(existing: ExistingLocationRow, file: ScannedAudioFile): void {
    const timestamp = now();
    this.#database
      .query<unknown, [number, number, string, string]>(`
        UPDATE assets
        SET file_size_bytes = ?, modified_at_ms = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(file.fileSizeBytes, file.modifiedAtMs, timestamp, existing.asset_id);
    this.#database
      .query<unknown, [string, string, string, string]>(`
        UPDATE asset_locations
        SET canonical_path = ?, available = 1,
          last_verified_at = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(file.absolutePath, timestamp, timestamp, existing.id);
  }

  #insertFile(rootId: LibraryRootId, file: ScannedAudioFile): void {
    const timestamp = now();
    const trackId = newTrackId();
    const assetId = newAssetId();
    const locationId = newLocationId();

    this.#database
      .query<unknown, [string, string, string, string]>(`
        INSERT INTO tracks (id, title, imported_at, updated_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(trackId, deriveTrackTitle(file.relativePath), timestamp, timestamp);
    this.#database
      .query<
        unknown,
        [string, string, string, string, number, number, string, string]
      >(`
        INSERT INTO assets (
          id, track_id, format, mime_type, file_size_bytes, modified_at_ms,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        assetId,
        trackId,
        file.audio.format,
        file.audio.mimeType,
        file.fileSizeBytes,
        file.modifiedAtMs,
        timestamp,
        timestamp,
      );
    this.#database
      .query<
        unknown,
        [string, string, string, string, string, number, string, string, string]
      >(`
        INSERT INTO asset_locations (
          id, asset_id, root_id, relative_path, canonical_path, available,
          last_verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        locationId,
        assetId,
        rootId,
        file.relativePath,
        file.absolutePath,
        1,
        timestamp,
        timestamp,
        timestamp,
      );
  }
}
