import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LibraryService } from "@/app/library/library-service";
import { ScenePresetService } from "@/app/scene/scene-preset-service";
import { DEFAULT_SIGNAL_SCENE_PARAMETERS } from "@/core/scene/signal-scene";
import { SqliteLibraryRepository } from "@/server/database/sqlite-library-repository";
import { SqliteMediaLocationRepository } from "@/server/database/sqlite-media-location-repository";
import { SqliteScenePresetRepository } from "@/server/database/sqlite-scene-preset-repository";
import { NodeDirectoryGateway } from "@/server/filesystem/directory-gateway";
import { NodeLibraryFileScanner } from "@/server/filesystem/library-file-scanner";
import { createApplicationHandler } from "@/server/http/application-handler";
import { createMediaHandler } from "@/server/media/media-handler";
import type { LibraryTracksResponse } from "@/shared/api";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function testApplication() {
  const rootPath = await mkdtemp(join(tmpdir(), "wave-player-http-"));
  temporaryDirectories.push(rootPath);
  await writeFile(join(rootPath, "Signal.wav"), "0123456789");
  const database = new Database(":memory:", { strict: true });
  const repository = new SqliteLibraryRepository(database);
  const library = new LibraryService({
    directories: new NodeDirectoryGateway(),
    repository,
    scanner: new NodeLibraryFileScanner(),
  });
  const handler = createApplicationHandler({
    library,
    media: createMediaHandler(new SqliteMediaLocationRepository(database)),
    presets: new ScenePresetService(new SqliteScenePresetRepository(database)),
  });
  const port = await availablePort();
  const server = Bun.serve({ hostname: "localhost", port, fetch: handler });

  return {
    database,
    rootPath,
    server,
    url: server.url,
  };
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("An ephemeral test port could not be allocated."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function closeApplication(
  application: Awaited<ReturnType<typeof testApplication>>,
) {
  await application.server.stop();
  application.database.close();
}

test("configures, scans, and reads the library through real HTTP", async () => {
  const application = await testApplication();

  try {
    const missingRootResponse = await fetch(
      new URL("/api/library/root", application.url),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: join(application.rootPath, "missing") }),
      },
    );
    expect(missingRootResponse.status).toBe(400);
    expect(await missingRootResponse.json()).toEqual({
      error: {
        code: "bad_request",
        message: "The library root could not be accessed.",
      },
    });

    const configureResponse = await fetch(
      new URL("/api/library/root", application.url),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: application.rootPath }),
      },
    );
    expect(configureResponse.status).toBe(200);

    const scanResponse = await fetch(
      new URL("/api/library/scan", application.url),
      { method: "POST" },
    );
    expect(scanResponse.status).toBe(200);
    expect(await scanResponse.json()).toMatchObject({
      root: { scanStatus: "ready", supportedFileCount: 1 },
      summary: { importedFileCount: 1 },
      tracks: [{ title: "Signal" }],
    });

    const tracksResponse = await fetch(
      new URL("/api/library/tracks", application.url),
    );
    const tracks = (await tracksResponse.json()) as LibraryTracksResponse;
    expect(tracksResponse.status).toBe(200);
    expect(tracks.tracks[0]?.location.relativePath).toBe("Signal.wav");
  } finally {
    await closeApplication(application);
  }
});

test("serves known media with complete and partial byte responses", async () => {
  const application = await testApplication();

  try {
    await fetch(new URL("/api/library/root", application.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: application.rootPath }),
    });
    await fetch(new URL("/api/library/scan", application.url), {
      method: "POST",
    });
    const tracksResponse = await fetch(
      new URL("/api/library/tracks", application.url),
    );
    const { tracks } = (await tracksResponse.json()) as LibraryTracksResponse;
    const locationId = tracks[0]?.location.id;

    if (!locationId) {
      throw new Error("The media fixture was not indexed.");
    }

    const mediaUrl = new URL(`/media/${locationId}`, application.url);
    const complete = await fetch(mediaUrl);
    expect(complete.status).toBe(200);
    expect(complete.headers.get("Accept-Ranges")).toBe("bytes");
    expect(complete.headers.get("Content-Type")).toStartWith("audio/wav");
    expect(complete.headers.get("Content-Length")).toBe("10");
    expect(await complete.text()).toBe("0123456789");

    const partial = await fetch(mediaUrl, {
      headers: { Range: "bytes=2-5" },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(partial.headers.get("Content-Length")).toBe("4");
    expect(await partial.text()).toBe("2345");

    const suffix = await fetch(mediaUrl, {
      headers: { Range: "bytes=-3" },
    });
    expect(suffix.status).toBe(206);
    expect(await suffix.text()).toBe("789");

    const invalid = await fetch(mediaUrl, {
      headers: { Range: "bytes=99-100" },
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("Content-Range")).toBe("bytes */10");
  } finally {
    await closeApplication(application);
  }
});

test("rejects malformed requests, unknown IDs, disabled roots, and escaped files", async () => {
  const application = await testApplication();

  try {
    const invalidJson = await fetch(
      new URL("/api/library/root", application.url),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      },
    );
    expect(invalidJson.status).toBe(400);

    const unknown = await fetch(
      new URL(
        "/media/location_018f1f2a-3b4c-7d5e-8f90-123456789abc",
        application.url,
      ),
    );
    expect(unknown.status).toBe(404);

    await fetch(new URL("/api/library/root", application.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: application.rootPath }),
    });
    await fetch(new URL("/api/library/scan", application.url), {
      method: "POST",
    });
    const tracksResponse = await fetch(
      new URL("/api/library/tracks", application.url),
    );
    const { tracks } = (await tracksResponse.json()) as LibraryTracksResponse;
    const locationId = tracks[0]?.location.id;

    if (!locationId) {
      throw new Error("The security fixture was not indexed.");
    }

    application.database.query("UPDATE library_roots SET enabled = 0").run();
    expect(
      (await fetch(new URL(`/media/${locationId}`, application.url))).status,
    ).toBe(404);

    application.database.query("UPDATE library_roots SET enabled = 1").run();
    const outsidePath = join(application.rootPath, "..", "outside.wav");
    await writeFile(outsidePath, "outside");
    application.database
      .query("UPDATE asset_locations SET canonical_path = ? WHERE id = ?")
      .run(outsidePath, locationId);
    expect(
      (await fetch(new URL(`/media/${locationId}`, application.url))).status,
    ).toBe(404);
    await rm(outsidePath, { force: true });
  } finally {
    await closeApplication(application);
  }
});

test("saves and restores a signal scene preset through real HTTP", async () => {
  const application = await testApplication();

  try {
    const saveResponse = await fetch(
      new URL("/api/scene-presets", application.url),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Night trace",
          parameters: {
            ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
            mode: "lissajous",
            persistence: 0.9,
          },
        }),
      },
    );
    expect(saveResponse.status).toBe(200);
    const saved = await saveResponse.json();
    expect(saved).toMatchObject({
      preset: {
        name: "Night trace",
        parameters: { mode: "lissajous", persistence: 0.9 },
      },
    });

    const listResponse = await fetch(
      new URL("/api/scene-presets", application.url),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ presets: [saved.preset] });
  } finally {
    await closeApplication(application);
  }
});
