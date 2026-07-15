import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "wave-player-scanner-"));
  temporaryDirectories.push(path);
  return path;
}

test("canonicalizes an accessible absolute directory", async () => {
  const root = await temporaryDirectory();
  const gateway = new NodeDirectoryGateway();

  expect(await gateway.canonicalizeDirectory(root)).toBe(await realpath(root));
  await expect(gateway.canonicalizeDirectory("relative/music")).rejects.toThrow(
    "absolute directory paths",
  );

  const filePath = join(root, "not-a-directory");
  await writeFile(filePath, "fixture");
  await expect(gateway.canonicalizeDirectory(filePath)).rejects.toThrow(
    "must be a directory",
  );
});

test("discovers nested WAV and MP3 files while ignoring other inputs", async () => {
  const root = await temporaryDirectory();
  const nested = join(root, "Sessions", "Night Drive");
  await mkdir(nested, { recursive: true });
  await Promise.all([
    writeFile(join(root, "reference.MP3"), "mp3"),
    writeFile(join(nested, "mix 08.WAV"), "wave"),
    writeFile(join(nested, "Night Drive.als"), "ableton"),
    writeFile(join(root, "notes.txt"), "notes"),
  ]);
  await symlink(nested, join(root, "linked-session"));

  const result = await new NodeLibraryFileScanner().scan(root);

  expect(result.complete).toBe(true);
  expect(result.issues).toEqual([]);
  expect(result.ignoredFileCount).toBe(3);
  expect(
    result.files.map((file) => ({
      relativePath: file.relativePath,
      format: file.audio.format,
      mimeType: file.audio.mimeType,
      fileSizeBytes: file.fileSizeBytes,
    })),
  ).toEqual([
    {
      relativePath: "reference.MP3",
      format: "mp3",
      mimeType: "audio/mpeg",
      fileSizeBytes: 3,
    },
    {
      relativePath: "Sessions/Night Drive/mix 08.WAV",
      format: "wav",
      mimeType: "audio/wav",
      fileSizeBytes: 4,
    },
  ]);
});
