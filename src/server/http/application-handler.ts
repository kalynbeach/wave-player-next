import { LibraryRequestError } from "@/app/library/library-errors";
import type { LibraryService } from "@/app/library/library-service";
import type { ScenePresetService } from "@/app/scene/scene-preset-service";
import type { ApiErrorResponse } from "@/shared/api";
import {
  configureLibraryRootSchema,
  saveScenePresetSchema,
} from "@/shared/api";

type MediaHandler = (
  request: Request,
  encodedLocationId: string,
) => Promise<Response>;

class HttpBadRequestError extends Error {}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorResponse(
  code: ApiErrorResponse["error"]["code"],
  message: string,
  status: number,
): Response {
  return json({ error: { code, message } } satisfies ApiErrorResponse, status);
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpBadRequestError("Request body must be valid JSON.");
  }
}

export function createApplicationHandler(options: {
  library: LibraryService;
  media: MediaHandler;
  presets: ScenePresetService;
}) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/library/root") {
        if (request.method === "GET") {
          return json({ root: options.library.getRoot() });
        }

        if (request.method === "PUT") {
          const parsed = configureLibraryRootSchema.safeParse(
            await requestJson(request),
          );

          if (!parsed.success) {
            return errorResponse(
              "bad_request",
              parsed.error.issues[0]?.message ?? "Invalid library root.",
              400,
            );
          }

          return json({
            root: await options.library.configureRoot(parsed.data.path),
          });
        }
      }

      if (url.pathname === "/api/library/tracks" && request.method === "GET") {
        return json({ tracks: options.library.listTracks() });
      }

      if (url.pathname === "/api/library/scan" && request.method === "POST") {
        const summary = await options.library.scan();
        const root = options.library.getRoot();

        if (!root) {
          throw new Error("The scanned library root could not be loaded.");
        }

        return json({ root, summary, tracks: options.library.listTracks() });
      }

      if (url.pathname === "/api/scene-presets") {
        if (request.method === "GET") {
          return json({ presets: options.presets.list() });
        }

        if (request.method === "PUT") {
          const parsed = saveScenePresetSchema.safeParse(
            await requestJson(request),
          );

          if (!parsed.success) {
            return errorResponse(
              "bad_request",
              parsed.error.issues[0]?.message ?? "Invalid scene preset.",
              400,
            );
          }

          return json({
            preset: options.presets.save(parsed.data.name, parsed.data.state),
          });
        }
      }

      const mediaMatch = /^\/media\/([^/]+)$/.exec(url.pathname);

      if (mediaMatch?.[1]) {
        return options.media(request, mediaMatch[1]);
      }

      return errorResponse("not_found", "Route not found.", 404);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      const status =
        error instanceof LibraryRequestError ||
        error instanceof HttpBadRequestError
          ? 400
          : 500;

      return errorResponse(
        status === 400 ? "bad_request" : "internal_error",
        status === 400 ? message : "The request could not be completed.",
        status,
      );
    }
  };
}
