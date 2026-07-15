import type { Database } from "bun:sqlite";

import initialSql from "@/server/database/migrations/0001_initial.sql" with {
  type: "text",
};

type Migration = {
  version: number;
  name: string;
  sql: string;
};

type AppliedMigrationRow = {
  version: number;
  name: string;
  checksum: string;
};

export const DATABASE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: initialSql,
  },
];

function migrationChecksum(sql: string): string {
  return new Bun.CryptoHasher("sha256").update(sql).digest("hex");
}

export function applyMigrations(
  database: Database,
  migrations: readonly Migration[] = DATABASE_MIGRATIONS,
): void {
  database.run("PRAGMA foreign_keys = ON");
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const findApplied = database.query<AppliedMigrationRow, [number]>(`
    SELECT version, name, checksum
    FROM schema_migrations
    WHERE version = ?
  `);

  const insertApplied = database.query<
    unknown,
    [number, string, string, string]
  >(`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const migration of migrations) {
    const checksum = migrationChecksum(migration.sql);
    const applied = findApplied.get(migration.version);

    if (applied) {
      if (applied.name !== migration.name || applied.checksum !== checksum) {
        throw new Error(
          `Migration ${migration.version} (${migration.name}) does not match the applied checksum.`,
        );
      }

      continue;
    }

    const apply = database.transaction(() => {
      database.exec(migration.sql);
      insertApplied.run(
        migration.version,
        migration.name,
        checksum,
        new Date().toISOString(),
      );
    });

    apply.exclusive();
  }
}
