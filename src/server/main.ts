import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { LibraryService } from "@/app/library/library-service";
import { ScenePresetService } from "@/app/scene/scene-preset-service";
import { SqliteLibraryRepository } from "@/server/database/sqlite-library-repository";
import { SqliteMediaLocationRepository } from "@/server/database/sqlite-media-location-repository";
import { SqliteScenePresetRepository } from "@/server/database/sqlite-scene-preset-repository";
import { NodeDirectoryGateway } from "@/server/filesystem/directory-gateway";
import { NodeLibraryFileScanner } from "@/server/filesystem/library-file-scanner";
import { createApplicationHandler } from "@/server/http/application-handler";
import { createMediaHandler } from "@/server/media/media-handler";
import { resolveRuntimeConfig } from "@/server/runtime-config";
import appHtml from "../client/index.html";

const config = resolveRuntimeConfig(Bun.argv.slice(2), Bun.env);
await mkdir(dirname(config.databasePath), { recursive: true });

const database = new Database(config.databasePath, {
  create: true,
  strict: true,
});
database.run("PRAGMA journal_mode = WAL");

const libraryRepository = new SqliteLibraryRepository(database);
const library = new LibraryService({
  directories: new NodeDirectoryGateway(),
  repository: libraryRepository,
  scanner: new NodeLibraryFileScanner(),
});
const media = createMediaHandler(new SqliteMediaLocationRepository(database));
const presets = new ScenePresetService(
  new SqliteScenePresetRepository(database),
);

if (config.libraryRootOverride) {
  await library.configureRoot(config.libraryRootOverride);
  await library.scan();
}

const applicationHandler = createApplicationHandler({
  library,
  media,
  presets,
});

const server = Bun.serve({
  hostname: "localhost",
  port: config.port,
  development:
    Bun.env.NODE_ENV === "production"
      ? false
      : {
          console: true,
          hmr: true,
        },
  routes: {
    "/": appHtml,
  },
  fetch: applicationHandler,
});

console.log(`Wave Player Next listening at ${server.url}`);

function shutdown(): void {
  void server.stop().finally(() => database.close());
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
