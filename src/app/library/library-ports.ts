import type { SupportedAudioFile } from "@/core/library/audio-file";
import type { LibraryRootId } from "@/core/library/ids";
import type { LibraryRoot, LibraryTrack } from "@/core/library/library";

export type ScannedAudioFile = {
  absolutePath: string;
  relativePath: string;
  fileSizeBytes: number;
  modifiedAtMs: number;
  audio: SupportedAudioFile;
};

export type ScanIssue = {
  path: string;
  message: string;
};

export type FileScanResult = {
  files: ScannedAudioFile[];
  ignoredFileCount: number;
  issues: ScanIssue[];
  complete: boolean;
};

export type ReconcileResult = {
  importedFileCount: number;
  updatedFileCount: number;
  unavailableFileCount: number;
};

export interface DirectoryGateway {
  canonicalizeDirectory(path: string): Promise<string>;
}

export interface LibraryFileScanner {
  scan(canonicalRootPath: string): Promise<FileScanResult>;
}

export interface LibraryRepository {
  getActiveRoot(): LibraryRoot | null;
  replaceActiveRoot(canonicalPath: string, displayName: string): LibraryRoot;
  beginScan(rootId: LibraryRootId): void;
  reconcileScan(rootId: LibraryRootId, result: FileScanResult): ReconcileResult;
  failScan(rootId: LibraryRootId, message: string): void;
  listTracks(): LibraryTrack[];
}
