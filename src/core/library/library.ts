import type { AudioFormat } from "@/core/library/audio-file";
import type {
  AssetId,
  AssetLocationId,
  LibraryRootId,
  TrackId,
} from "@/core/library/ids";

export type LibraryScanStatus =
  | "idle"
  | "scanning"
  | "ready"
  | "partial"
  | "error";

export type LibraryRoot = {
  id: LibraryRootId;
  canonicalPath: string;
  displayName: string;
  enabled: boolean;
  scanStatus: LibraryScanStatus;
  lastScanStartedAt: string | null;
  lastScanCompletedAt: string | null;
  lastScanMessage: string | null;
  supportedFileCount: number;
  ignoredFileCount: number;
};

export type LibraryTrack = {
  id: TrackId;
  title: string;
  asset: {
    id: AssetId;
    format: AudioFormat;
    mimeType: "audio/mpeg" | "audio/wav";
    fileSizeBytes: number;
  };
  location: {
    id: AssetLocationId;
    relativePath: string;
    available: boolean;
  };
};
