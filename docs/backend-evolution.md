# Backend Evolution

> Status: Living design document; Task 1 implementation is underway.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Current decision

The first useful version is local-first and uses Bun SQLite. It does not require an account, network connection, cloud database, or remote object storage.

Convex and other data architectures remain intentional later-phase explorations.

## Why SQLite comes first

SQLite fits the initial product because:

- the first library indexes local files;
- one local user and one host process are sufficient;
- the application needs durable metadata, settings, collections, and presets;
- Bun provides a native synchronous SQLite driver;
- real database integration tests are inexpensive;
- the project can become useful before authentication or deployment exists.

SQLite is not treated as a disposable prototype database. Its model should be coherent, migrated, and tested, even though later backends may own different categories of data.

Reference: [Bun SQLite](https://bun.com/docs/runtime/sqlite).

## Persistence boundary

Core and application code should depend on product-shaped operations rather than SQL or generic CRUD.

Examples:

- list or search library tracks;
- load a work with its versions;
- reconcile a scanned asset location;
- save a scene preset;
- restore a playback session;
- accept a Work grouping suggestion.

The initial SQLite implementation fulfills these operations. A future Convex adapter may fulfill portable subsets without changing playback or scene code.

Do not build an abstract ORM or universal repository framework.

## Portable and device-local split

| Portable candidates | Device-local candidates |
|---|---|
| works and user-edited track metadata | approved library roots |
| collections and playlists | absolute file paths |
| themes and scene presets | file watcher and scan state |
| cloud asset identity | local availability and file stats |
| analysis summaries | local analysis-cache paths |
| listening history | device playback session |
| cloud storage references | local media route details |

This distinction should exist in the model now. Synchronization infrastructure should not.

## Stable identity

Use application-generated stable IDs for portable entities.

Do not make these the public identity:

- SQLite row IDs;
- absolute paths;
- Convex document IDs;
- S3 object keys.

A future adapter can map a stable domain ID to backend-specific identity.

## Convex role

Convex is a strong later candidate for:

- typed portable metadata;
- reactive library and collection updates;
- theme and preset synchronization;
- authentication and multi-device identity;
- listening history;
- cloud asset references;
- hosted analysis jobs or status;
- eventual public sharing features.

Convex should not be introduced merely to replace local SQLite queries with network queries.

## Recommended Convex phase

The recommended first Convex integration is a portable metadata layer, not full bidirectional local-first synchronization.

Possible progression:

1. Add authentication and a device identity.
2. Replicate user-approved works, tracks, collections, themes, and presets.
3. Keep absolute paths and local locations only in SQLite.
4. Add cloud `AssetLocation` records for files intentionally uploaded.
5. Let the local host reconcile portable asset identity with device-local availability.
6. Add a conflict policy only after actual multi-device edits exist.

Convex functions should be product-specific and validated. Queries should follow real UI access patterns and use indexes rather than broad collection/filter behavior.

References:

- [Convex best practices](https://docs.convex.dev/understanding/best-practices/)
- [Convex schemas](https://docs.convex.dev/database/schemas)

## Object storage

Large audio files should generally live in an object store such as S3 or R2 when remote media becomes necessary.

Convex can store file references and authorization metadata. Convex file storage supports arbitrary files, but its generated URLs are bearer URLs; permission-checked HTTP action responses are limited to 20 MB. That makes S3/R2 with deliberate URL and authorization policy a better default candidate for large protected audio.

Reference: [Convex file storage security model](https://docs.convex.dev/file-storage/overview).

Bun's S3 API can later provide:

- multipart/streaming uploads;
- partial reads;
- S3-compatible providers;
- a Blob/Response-like programming model.

Reference: [Bun S3](https://bun.com/docs/runtime/s3).

## Synchronization options

### Option A: Convex is canonical for portable metadata

SQLite stores a local projection plus all device-local state.

Benefits:

- clear ownership;
- native Convex reactivity;
- easier multi-device behavior.

Costs:

- offline edits require a queue or constrained offline mode;
- local and remote availability must be reconciled.

This is the leading later-phase option.

### Option B: SQLite and Convex are peer authorities

Both accept offline edits and synchronize through an outbox, versioning, and conflict resolution.

Benefits:

- strongest offline-first behavior.

Costs:

- substantially more implementation and product complexity;
- conflict semantics for ordered collections, metadata, and presets;
- difficult testing and migrations.

Do not select this option before real offline multi-device requirements justify it.

### Option C: separate local and cloud modes

A local-only library and a cloud-backed library remain distinct operating modes.

Benefits:

- simplest data ownership;
- no hidden merge semantics.

Costs:

- fragmented user experience;
- duplicated behavior and transitions between modes.

This remains a valid experiment but is not the preferred product direction.

## What to preserve now

To keep future options open without building them:

- stable domain IDs;
- `Asset` separate from `AssetLocation`;
- paths isolated in local infrastructure;
- versioned serialized themes and presets;
- versioned analysis artifacts;
- application operations separated from SQL;
- explicit timestamps where product semantics need them;
- idempotent scan/reconciliation behavior.

Do not add now:

- sync cursors;
- outbox or inbox tables;
- vector clocks;
- conflict UI;
- auth tables;
- Convex generated types;
- S3 credentials;
- background upload jobs.

## Additional clients

### GPUI

A GPUI client should reuse:

- the Rust analysis core;
- stable domain and serialization formats;
- portable backend APIs;
- possibly the same SQLite file during a read-only spike.

It should not be expected to reuse React components or browser runtime code.

### KKB

KKB becomes a second consumer only after stable modules are proven. Candidate future extractions include playback runtime contracts, signal providers, visualization scenes, preset formats, or the Rust analysis core.

### Native SDK

Native SDK remains a later comparative experiment. Its TypeScript/native markup and Zig-centered native environment should not influence the first repository's core model or package structure.

## Other data architectures worth later experiments

- managed library directory with copied or transcoded assets;
- content-addressed local object store;
- SQLite plus object-store cache;
- embedded document or graph views over the same domain IDs;
- remote-only catalog with a local availability index;
- self-hosted Convex;
- direct S3/R2 catalog manifests.

Each should be tested against an explicit workflow rather than introduced as infrastructure tourism.

## Open backend questions

- Whether Convex or another backend eventually becomes canonical for portable metadata.
- Whether uploaded audio uses R2, S3, Convex storage, or a user-selectable provider.
- Whether the project promises full offline edits after cloud integration.
- Whether local SQLite remains a full projection or only a device-availability index.
- How remote analysis artifacts are versioned and invalidated.
