import { opendir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type {
  FileScanResult,
  LibraryFileScanner,
  ScanIssue,
  ScannedAudioFile,
} from "@/app/library/library-ports";
import { classifyAudioPath } from "@/core/library/audio-file";

function portableRelativePath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(sep).join("/");
}

function scanIssue(path: string, error: unknown): ScanIssue {
  return {
    path,
    message:
      error instanceof Error ? error.message : "The path could not be read.",
  };
}

export class NodeLibraryFileScanner implements LibraryFileScanner {
  async scan(canonicalRootPath: string): Promise<FileScanResult> {
    const files: ScannedAudioFile[] = [];
    const issues: ScanIssue[] = [];
    let ignoredFileCount = 0;

    const visitDirectory = async (directoryPath: string): Promise<void> => {
      let directory: Awaited<ReturnType<typeof opendir>>;

      try {
        directory = await opendir(directoryPath);
      } catch (error) {
        issues.push(scanIssue(directoryPath, error));
        return;
      }

      try {
        for await (const entry of directory) {
          const absolutePath = join(directoryPath, entry.name);

          if (entry.isSymbolicLink()) {
            ignoredFileCount += 1;
            continue;
          }

          if (entry.isDirectory()) {
            await visitDirectory(absolutePath);
            continue;
          }

          if (!entry.isFile()) {
            ignoredFileCount += 1;
            continue;
          }

          const audio = classifyAudioPath(entry.name);

          if (!audio) {
            ignoredFileCount += 1;
            continue;
          }

          try {
            const metadata = await stat(absolutePath);
            files.push({
              absolutePath,
              relativePath: portableRelativePath(
                canonicalRootPath,
                absolutePath,
              ),
              fileSizeBytes: metadata.size,
              modifiedAtMs: metadata.mtimeMs,
              audio,
            });
          } catch (error) {
            issues.push(scanIssue(absolutePath, error));
          }
        }
      } catch (error) {
        issues.push(scanIssue(directoryPath, error));
      }
    };

    await visitDirectory(canonicalRootPath);
    files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );

    return {
      files,
      ignoredFileCount,
      issues,
      complete: issues.length === 0,
    };
  }
}
