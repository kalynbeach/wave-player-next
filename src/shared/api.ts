import { z } from "zod";

import type { LibraryRoot, LibraryTrack } from "@/core/library/library";
import type { SignalScenePreset } from "@/core/scene/signal-scene";

export const configureLibraryRootSchema = z.strictObject({
  path: z.string().trim().min(1).max(4_096),
});

export type ConfigureLibraryRootRequest = z.infer<
  typeof configureLibraryRootSchema
>;

export type LibraryRootResponse = {
  root: LibraryRoot | null;
};

export type LibraryTracksResponse = {
  tracks: LibraryTrack[];
};

export type LibraryScanResponse = {
  root: LibraryRoot;
  summary: {
    importedFileCount: number;
    updatedFileCount: number;
    unavailableFileCount: number;
  };
  tracks: LibraryTrack[];
};

export type ApiErrorResponse = {
  error: {
    code: "bad_request" | "internal_error" | "not_found";
    message: string;
  };
};

export const signalSceneParametersSchema = z.strictObject({
  mode: z.enum(["oscilloscope", "lissajous"]),
  gain: z.number().min(0.25).max(4),
  lineWidth: z.number().min(0.5).max(6),
  persistence: z.number().min(0).max(0.98),
  xFrequency: z.number().min(1).max(8),
  yFrequency: z.number().min(1).max(8),
});

export const saveSignalScenePresetSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  parameters: signalSceneParametersSchema,
});

export type ScenePresetsResponse = {
  presets: SignalScenePreset[];
};

export type SaveScenePresetResponse = {
  preset: SignalScenePreset;
};
