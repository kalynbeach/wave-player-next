import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import type {
  FileScanResult,
  ScannedAudioFile,
} from "@/app/library/library-ports";
import { classifyAudioPath } from "@/core/library/audio-file";
import { SqliteLibraryRepository } from "@/server/database/sqlite-library-repository";

function scannedFile(
  relativePath: string,
  options: { fileSizeBytes?: number; modifiedAtMs?: number } = {},
): ScannedAudioFile {
  const audio = classifyAudioPath(relativePath);

  if (!audio) {
    throw new Error("The repository fixture must use supported audio.");
  }

  return {
    absolutePath: `/music/${relativePath}`,
    relativePath,
    fileSizeBytes: options.fileSizeBytes ?? 100,
    modifiedAtMs: options.modifiedAtMs ?? 1_000,
    audio,
  };
}

function scanResult(
  files: ScannedAudioFile[],
  options: Partial<Omit<FileScanResult, "files">> = {},
): FileScanResult {
  return {
    files,
    ignoredFileCount: options.ignoredFileCount ?? 0,
    issues: options.issues ?? [],
    complete: options.complete ?? true,
  };
}

test("persists one active root and reuses its stable identity", () => {
  using database = new Database(":memory:", { strict: true });
  const repository = new SqliteLibraryRepository(database);

  const first = repository.replaceActiveRoot("/music", "Music");
  const repeated = repository.replaceActiveRoot("/music", "Renamed music");
  const replacement = repository.replaceActiveRoot("/other", "Other");

  expect(repeated.id).toBe(first.id);
  expect(repeated.displayName).toBe("Renamed music");
  expect(replacement.id).not.toBe(first.id);
  expect(repository.getActiveRoot()?.canonicalPath).toBe("/other");
  expect(
    database
      .query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM library_roots WHERE enabled = 1",
      )
      .get()?.count,
  ).toBe(1);
});

test("reconciles scans idempotently and preserves stable track identity", () => {
  using database = new Database(":memory:", { strict: true });
  const repository = new SqliteLibraryRepository(database);
  const root = repository.replaceActiveRoot("/music", "Music");
  const files = [scannedFile("Alpha.wav"), scannedFile("sets/Beta.mp3")];

  repository.beginScan(root.id);
  expect(repository.reconcileScan(root.id, scanResult(files))).toEqual({
    importedFileCount: 2,
    updatedFileCount: 0,
    unavailableFileCount: 0,
  });
  const initialTracks = repository.listTracks();

  repository.beginScan(root.id);
  expect(repository.reconcileScan(root.id, scanResult(files))).toEqual({
    importedFileCount: 0,
    updatedFileCount: 0,
    unavailableFileCount: 0,
  });
  const rescannedTracks = repository.listTracks();

  expect(rescannedTracks.map((track) => track.id)).toEqual(
    initialTracks.map((track) => track.id),
  );
  expect(rescannedTracks.map((track) => track.asset.id)).toEqual(
    initialTracks.map((track) => track.asset.id),
  );
  expect(repository.getActiveRoot()).toMatchObject({
    scanStatus: "ready",
    supportedFileCount: 2,
  });
});

test("updates changed fingerprints and marks missing locations unavailable", () => {
  using database = new Database(":memory:", { strict: true });
  const repository = new SqliteLibraryRepository(database);
  const root = repository.replaceActiveRoot("/music", "Music");
  const alpha = scannedFile("Alpha.wav");
  const beta = scannedFile("Beta.mp3");
  repository.beginScan(root.id);
  repository.reconcileScan(root.id, scanResult([alpha, beta]));

  repository.beginScan(root.id);
  expect(
    repository.reconcileScan(
      root.id,
      scanResult([
        scannedFile("Alpha.wav", {
          fileSizeBytes: 120,
          modifiedAtMs: 2_000,
        }),
      ]),
    ),
  ).toEqual({
    importedFileCount: 0,
    updatedFileCount: 1,
    unavailableFileCount: 1,
  });

  expect(repository.listTracks()).toEqual([
    expect.objectContaining({
      title: "Alpha",
      asset: expect.objectContaining({ fileSizeBytes: 120 }),
      location: expect.objectContaining({ available: true }),
    }),
    expect.objectContaining({
      title: "Beta",
      location: expect.objectContaining({ available: false }),
    }),
  ]);
});

test("a partial scan does not make unseen prior locations unavailable", () => {
  using database = new Database(":memory:", { strict: true });
  const repository = new SqliteLibraryRepository(database);
  const root = repository.replaceActiveRoot("/music", "Music");
  const files = [scannedFile("Alpha.wav"), scannedFile("Beta.mp3")];
  repository.beginScan(root.id);
  repository.reconcileScan(root.id, scanResult(files));

  repository.beginScan(root.id);
  repository.reconcileScan(
    root.id,
    scanResult([files[0] as ScannedAudioFile], {
      complete: false,
      issues: [{ path: "/music/archive", message: "Permission denied" }],
    }),
  );

  expect(
    repository.listTracks().every((track) => track.location.available),
  ).toBe(true);
  expect(repository.getActiveRoot()).toMatchObject({
    scanStatus: "partial",
    supportedFileCount: 2,
    lastScanMessage: expect.stringContaining("Permission denied"),
  });
});
