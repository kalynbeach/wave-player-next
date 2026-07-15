import { expect, test } from "bun:test";

import { classifyAudioPath, deriveTrackTitle } from "@/core/library/audio-file";

test("classifies WAV and MP3 paths without accepting other files", () => {
  expect(classifyAudioPath("Mixes/Night Drive.WAV")).toEqual({
    extension: ".wav",
    format: "wav",
    mimeType: "audio/wav",
  });
  expect(classifyAudioPath("Masters/Night Drive.mp3")?.mimeType).toBe(
    "audio/mpeg",
  );
  expect(classifyAudioPath("Project/Night Drive.als")).toBeNull();
  expect(classifyAudioPath("Project/README")).toBeNull();
});

test("derives a stable display title from the source filename", () => {
  expect(deriveTrackTitle("Exports/Night Drive - mix 08.wav")).toBe(
    "Night Drive - mix 08",
  );
  expect(deriveTrackTitle(".wav")).toBe("Untitled track");
});
