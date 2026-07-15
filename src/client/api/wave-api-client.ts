import type { SignalSceneParameters } from "@/core/scene/signal-scene";
import type {
  ApiErrorResponse,
  LibraryRootResponse,
  LibraryScanResponse,
  LibraryTracksResponse,
  SaveScenePresetResponse,
  ScenePresetsResponse,
} from "@/shared/api";

async function apiRequest<ResponseBody>(
  path: string,
  init?: RequestInit,
): Promise<ResponseBody> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data: unknown = await response.json();

  if (!response.ok) {
    const error = data as Partial<ApiErrorResponse>;
    throw new Error(error.error?.message ?? "The Wave Player request failed.");
  }

  return data as ResponseBody;
}

export class WaveApiClient {
  getRoot(): Promise<LibraryRootResponse> {
    return apiRequest("/api/library/root");
  }

  getTracks(): Promise<LibraryTracksResponse> {
    return apiRequest("/api/library/tracks");
  }

  configureRoot(path: string): Promise<LibraryRootResponse> {
    return apiRequest("/api/library/root", {
      method: "PUT",
      body: JSON.stringify({ path }),
    });
  }

  scan(): Promise<LibraryScanResponse> {
    return apiRequest("/api/library/scan", { method: "POST" });
  }

  getScenePresets(): Promise<ScenePresetsResponse> {
    return apiRequest("/api/scene-presets");
  }

  saveScenePreset(
    name: string,
    parameters: SignalSceneParameters,
  ): Promise<SaveScenePresetResponse> {
    return apiRequest("/api/scene-presets", {
      method: "PUT",
      body: JSON.stringify({ name, parameters }),
    });
  }
}
