# Scope and Roadmap

> Status: Living design document; Task 1 implementation is underway.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Scope strategy

The project is a continuing flagship, but implementation should proceed through complete vertical slices.

The first slice proves the boring spine and one distinctive creative surface. Later phases add library intelligence, scenes, Rust/WASM, cloud capabilities, and native clients without making them prerequisites for personal usefulness.

## First useful release

### Goal

Use the application for real listening to local original music through a persistent library and one interactive oscilloscope/Lissajous scene.

### In scope

- isolated repository at `~/dev/apps/wave-player-next`;
- TypeScript 7;
- Bun full-stack localhost process;
- React client;
- shadcn/ui with Base UI primitives and preset `b1D0enCq`;
- Bun SQLite catalog;
- one configured local library root;
- files indexed in place;
- manual scan and rescan;
- guaranteed WAV and MP3 discovery and playback;
- flat track browsing;
- reliable selection, play, pause, seek, next, previous, and ended behavior;
- persisted selected track, volume, and minimal session state;
- same-origin media endpoint with HTTP Range support;
- one theme based on the selected shadcn preset and semantic tokens;
- one responsive portrait player card with persistent track identity and transport;
- changeable visual, library, and scene-control views inside the card;
- one oscilloscope/Lissajous WebGPU scene;
- meaningful interactive scene controls;
- saved and restored scene preset;
- clear loading, empty, unsupported, unavailable, and error states;
- thorough tests and Codex-native Browser and Computer Use verification.

### Explicitly out of scope

- Convex;
- authentication;
- S3/R2;
- Redis;
- multiple devices;
- cloud synchronization;
- automatic file upload;
- filesystem watching;
- `.als` parsing or other Ableton Live Project/Set metadata extraction;
- automatic Ableton Work grouping;
- editing or mutating audio files;
- managed library copies;
- content hashing of every file on first scan;
- public scene plugins;
- custom playback transport;
- WebCodecs or AudioWorklet as default infrastructure;
- Rust or WASM;
- GPUI;
- Native SDK;
- KKB integration;
- VLM and cymatics scenes;
- mobile application;
- a project-managed Playwright or other browser automation suite;
- broad streaming-provider integration.

## Definition of done for the first useful release

The phase is complete only when:

1. A new user can configure one local root with documented steps.
2. A real folder scans into SQLite without mutating its files.
3. Rescanning produces stable, idempotent catalog results.
4. Supported tracks can be browsed and selected.
5. Playback, pause, seek, next, previous, and ended behavior work in a real browser.
6. The application restores the selected track and volume after restart.
7. The media route supports byte ranges and rejects paths outside approved roots.
8. The oscilloscope and Lissajous modes receive real analyser data.
9. At least three meaningful visual controls can be manipulated while audio plays.
10. A scene preset saves and restores.
11. The interface uses the specified shadcn/Base UI preset and remains keyboard accessible.
12. The visual, library, and scene card views preserve the mounted player and persistent transport state.
13. The card remains usable without horizontal overflow at `1440 × 1000`, `1024 × 768`, and `390 × 844`.
14. Core, controller, SQLite, filesystem, media, and component tests pass.
15. Codex-native verification covers media, Web Audio, WebGPU, layout, focus, motion, and disposal with no unexplained console errors.
16. The production build and TypeScript 7 checks pass.

After implementation completion, the user should run a one-week personal-listening evaluation before Phase 2 begins. That evaluation validates the release; it does not require an implementation agent to remain active for a calendar week.

## Phase 2: immediate follow-ups

After the first slice is stable, two bounded tracks may proceed. They should share stable core contracts but avoid overlapping edits.

### Phase 2A: library intelligence

- multiple roots;
- richer metadata and artwork;
- `Work` model in the UI;
- Ableton Live Project directory and `.als` Live Set metadata investigation;
- non-destructive Ableton grouping suggestions;
- confidence and evidence display;
- accept, edit, ignore, and undo grouping;
- missing-file reconciliation;
- collections and playlists;
- improved library search.

### Phase 2B: VLM-style light synthesizer

- prove the internal scene registry with a second scene;
- feedback textures;
- symmetry and transformations;
- audio-feature modulation;
- richer direct interaction;
- preset variation and bounded randomization;
- scene switching without playback interruption.

These are good candidates for separate Codex tasks only after the first implementation task has stabilized the shared interfaces.

## Phase 3: Rust/WASM and cymatics

- create pure `wave-core` Rust crate;
- create or revive `wave-tools` native CLI;
- versioned analysis manifests;
- waveform and spectral analysis;
- Worker-based WASM integration;
- cymatics-inspired nodal field scene;
- initial physically motivated rectangular-plate modes;
- numerical and visual regression tests;
- investigate native `wgpu` reuse only after the algorithm boundary works.

## Phase 4: open-source hardening

- installation and release workflow;
- schema and preset migrations;
- capability diagnostics;
- documentation for contributors;
- stable fixture licenses and provenance;
- browser and platform support matrix;
- performance budgets;
- public preset/theme formats;
- API stability decisions based on actual consumers;
- first review of modules suitable for KKB extraction.

## Phase 5: backend and remote media

- evaluate Convex against updated requirements;
- portable metadata and authentication;
- cloud asset references;
- S3/R2 upload and streaming policy;
- multi-device collections, themes, and presets;
- explicit offline and conflict semantics;
- security and privacy review.

## Phase 6: native environments

- GPUI client spike using Rust core and stable serialized models;
- compare native audio/output choices;
- explore a Native SDK/Base UI/WebView or native-markup spike separately;
- decide whether the flagship remains web-hosted, gains multiple clients, or adopts a native primary client.

## Phase gates

A phase may begin when:

- its predecessor has a stable usable outcome;
- relevant tests and documentation are current;
- the next capability has a clear product purpose;
- its ownership boundary is explicit;
- it does not require silently reopening completed foundational work.

New features should move into a later phase unless they are required to satisfy the current phase's definition of done.

## Scope-change rule

Any material addition to the active implementation goal should state:

- the capability being added;
- why the current phase cannot succeed without it;
- the implementation and test cost;
- what is removed or delayed to make room;
- the affected documents.

Do not let agent suggestions silently change the active phase.

## Success measures

### Personal

- percentage of original-music listening done through Wave Player Next;
- successful one-week and later one-month usage periods;
- number of imported personal tracks and accepted Work groupings;
- frequency of scene and preset use.

### Product quality

- playback failures;
- unsupported or unavailable asset clarity;
- scan duration and reconciliation correctness;
- UI and browser errors;
- regression-test coverage for reported bugs;
- frame stability and resource disposal.

### Open source

- setup success from a clean clone;
- documentation accuracy;
- issue/PR quality;
- outside theme, preset, scene, or code contributions after interfaces stabilize.

## Deferred idea policy

Later-phase ideas remain valuable. Record them here or in the relevant design document instead of partially scaffolding them into the first implementation.
