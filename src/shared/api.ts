import { z } from "zod";

import type { LibraryRoot, LibraryTrack } from "@/core/library/library";
import type { ScenePreset } from "@/core/scene/scene-registry";

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

export const lightMachineSceneParametersSchema = z.strictObject({
  feedback: z.number().min(0.5).max(0.97),
  symmetry: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8)]),
  rotation: z.number().min(-180).max(180),
  zoom: z.number().min(0.7).max(1.6),
  palette: z.enum(["electric", "ember", "ultraviolet"]),
  colorCycle: z.number().min(-1).max(1),
  audioModulation: z.number().min(0).max(1),
  intensity: z.number().min(0.4).max(2.4),
});

export const sceneStateSchema = z.discriminatedUnion("sceneId", [
  z.strictObject({
    sceneId: z.literal("signal"),
    sceneVersion: z.literal(1),
    parameters: signalSceneParametersSchema,
  }),
  z.strictObject({
    sceneId: z.literal("light-machine"),
    sceneVersion: z.literal(1),
    parameters: lightMachineSceneParametersSchema,
  }),
]);

export const saveScenePresetSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  state: sceneStateSchema,
});

export type ScenePresetsResponse = {
  presets: ScenePreset[];
};

export type SaveScenePresetResponse = {
  preset: ScenePreset;
};
