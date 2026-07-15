import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

import type { MediaLocationRepository } from "@/app/media/media-ports";
import { parseAssetLocationId } from "@/core/library/ids";
import { parseByteRange } from "@/server/media/byte-range";

function isContainedBy(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function unavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: "not_found",
        message: "The media location is unavailable.",
      },
    },
    { status: 404 },
  );
}

function rangeNotSatisfiable(fileSizeBytes: number): Response {
  return new Response(null, {
    status: 416,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${fileSizeBytes}`,
    },
  });
}

export function createMediaHandler(repository: MediaLocationRepository) {
  return async (
    request: Request,
    encodedLocationId: string,
  ): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    let locationId: ReturnType<typeof parseAssetLocationId>;

    try {
      locationId = parseAssetLocationId(decodeURIComponent(encodedLocationId));
    } catch {
      return unavailableResponse();
    }

    const location = repository.findLocation(locationId);

    if (!location?.available || !location.rootEnabled) {
      return unavailableResponse();
    }

    let canonicalRootPath: string;
    let canonicalMediaPath: string;
    let metadata: Awaited<ReturnType<typeof stat>>;

    try {
      [canonicalRootPath, canonicalMediaPath] = await Promise.all([
        realpath(location.canonicalRootPath),
        realpath(location.canonicalPath),
      ]);
      metadata = await stat(canonicalMediaPath);
    } catch {
      return unavailableResponse();
    }

    if (
      !metadata.isFile() ||
      !isContainedBy(canonicalRootPath, canonicalMediaPath)
    ) {
      return unavailableResponse();
    }

    const file = Bun.file(canonicalMediaPath, { type: location.mimeType });
    const commonHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Type": location.mimeType,
    };
    const rangeHeader = request.headers.get("Range");

    if (!rangeHeader) {
      return new Response(request.method === "HEAD" ? null : file, {
        status: 200,
        headers: {
          ...commonHeaders,
          "Content-Length": String(metadata.size),
        },
      });
    }

    const range = parseByteRange(rangeHeader, metadata.size);

    if (!range) {
      return rangeNotSatisfiable(metadata.size);
    }

    const contentLength = range.end - range.start + 1;
    return new Response(
      request.method === "HEAD" ? null : file.slice(range.start, range.end + 1),
      {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Length": String(contentLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${metadata.size}`,
        },
      },
    );
  };
}
