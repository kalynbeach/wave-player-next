import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LibraryService } from "@/app/library/library-service";
import { SqliteLibraryRepository } from "@/server/database/sqlite-library-repository";
import { NodeDirectoryGateway } from "@/server/filesystem/directory-gateway";
import { NodeLibraryFileScanner } from "@/server/filesystem/library-file-scanner";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

test("configures and scans a real folder into SQLite without mutating audio", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "wave-player-library-"));
  temporaryDirectories.push(rootPath);
  const audioPath = join(rootPath, "Original.wav");
  await writeFile(audioPath, "fixture audio bytes");
  const before = await stat(audioPath);

  using database = new Database(":memory:", { strict: true });
  const service = new LibraryService({
    directories: new NodeDirectoryGateway(),
    repository: new SqliteLibraryRepository(database),
    scanner: new NodeLibraryFileScanner(),
  });

  const root = await service.configureRoot(rootPath);
  expect(await service.scan()).toEqual({
    importedFileCount: 1,
    updatedFileCount: 0,
    unavailableFileCount: 0,
  });
  const after = await stat(audioPath);

  expect(service.getRoot()).toMatchObject({
    id: root.id,
    scanStatus: "ready",
    supportedFileCount: 1,
  });
  expect(service.listTracks()).toEqual([
    expect.objectContaining({
      title: "Original",
      location: expect.objectContaining({ available: true }),
    }),
  ]);
  expect({ size: after.size, modifiedAtMs: after.mtimeMs }).toEqual({
    size: before.size,
    modifiedAtMs: before.mtimeMs,
  });
});
