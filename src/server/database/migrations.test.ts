import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import {
  applyMigrations,
  DATABASE_MIGRATIONS,
} from "@/server/database/migrations";

type TableRow = {
  name: string;
};

test("applies the Task 1 schema once to a fresh SQLite database", () => {
  using database = new Database(":memory:", { strict: true });

  applyMigrations(database);
  applyMigrations(database);

  const tables = database
    .query<TableRow, []>(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `)
    .all()
    .map((row) => row.name);

  expect(tables).toEqual([
    "asset_locations",
    "assets",
    "library_roots",
    "scene_presets",
    "schema_migrations",
    "tracks",
  ]);
  expect(
    database
      .query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM schema_migrations",
      )
      .get()?.count,
  ).toBe(1);
});

test("fails loudly when an applied migration checksum changes", () => {
  using database = new Database(":memory:", { strict: true });
  applyMigrations(database);
  const initialMigration = DATABASE_MIGRATIONS[0];

  if (!initialMigration) {
    throw new Error("The initial migration must be registered.");
  }

  expect(() =>
    applyMigrations(database, [
      {
        ...initialMigration,
        sql: `${initialMigration.sql}\n-- changed`,
      },
    ]),
  ).toThrow("does not match the applied checksum");
});
