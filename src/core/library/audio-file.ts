export type AudioFormat = "mp3" | "wav";

export type SupportedAudioFile = {
  extension: ".mp3" | ".wav";
  format: AudioFormat;
  mimeType: "audio/mpeg" | "audio/wav";
};

const SUPPORTED_AUDIO_FILES: Record<string, SupportedAudioFile> = {
  ".mp3": {
    extension: ".mp3",
    format: "mp3",
    mimeType: "audio/mpeg",
  },
  ".wav": {
    extension: ".wav",
    format: "wav",
    mimeType: "audio/wav",
  },
};

export function classifyAudioPath(path: string): SupportedAudioFile | null {
  const filename = path.split(/[\\/]/).at(-1) ?? "";
  const extensionIndex = filename.lastIndexOf(".");
  const extension =
    extensionIndex >= 0 ? filename.slice(extensionIndex).toLowerCase() : "";

  return SUPPORTED_AUDIO_FILES[extension] ?? null;
}

export function deriveTrackTitle(path: string): string {
  const filename = path.split(/[\\/]/).at(-1)?.trim() ?? "";
  const extensionIndex = filename.lastIndexOf(".");
  const title = (
    extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename
  ).trim();

  return title || "Untitled track";
}
