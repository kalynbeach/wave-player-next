# Testing Strategy

> Status: Living design document; Task 1 is implemented and verified.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Quality requirement

The codebase must be thoroughly, efficiently, and effectively tested from the beginning.

The initial test runner is `bun test`. Related testing libraries are appropriate when they add confidence that Bun's test environment cannot provide alone. Tests should minimize mocks and prefer real, inexpensive boundaries.

## Principles

1. Test observable behavior and invariants, not private implementation details.
2. Use pure unit tests for pure logic.
3. Use a real SQLite database for repository and migration tests.
4. Use real temporary files and directories for scanner tests.
5. Use a real Bun HTTP server on an ephemeral port for API and media tests.
6. Use committed, tiny audio fixtures with known properties.
7. Use React Testing Library for component behavior and accessibility-oriented queries.
8. Use the Codex in-app Browser for media, Web Audio, WebGPU, layout, focus, and visual behavior.
9. Mock only boundaries that are expensive, nondeterministic, unavailable, or intentionally forced into failure.
10. Keep tests deterministic and parallel-safe.
11. Treat coverage as evidence and a gap detector, not as a substitute for behavioral completeness.
12. Every production bug should add the narrowest useful regression test.

## Confidence layers

### 1. Core unit tests

Run under `bun test` with no DOM preload.

Cover:

- identifier and value-object validation;
- track/asset/location invariants;
- filename and metadata normalization;
- asset selection policy;
- scene parameter validation and preset migration;
- pure state transitions;
- typed error classification.

These tests should be fast enough to run continuously in watch mode.

Work grouping, collection ordering, Ableton evidence scoring, and other later-phase core behavior gain tests when those phases begin; they are not Task 1 scaffolding requirements.

### 2. Application/controller tests

Cover:

- initialization and idempotency;
- scan orchestration;
- selection and queue behavior;
- stale-session restoration;
- rapid and conflicting commands;
- cancellation and disposal;
- missing assets;
- derived snapshots;
- error propagation without leaking infrastructure details.

Prefer small in-memory adapters that implement an explicit port over module mocks. A fake is acceptable when the real dependency is a browser runtime, but it should model behavior rather than assert call trivia.

### 3. SQLite integration tests

Use a real temporary database or in-memory SQLite database, depending on whether file behavior matters.

Cover:

- schema creation;
- migrations from each supported prior version;
- foreign-key and uniqueness invariants;
- transaction rollback;
- stable domain ID mapping;
- query ordering and filtering;
- root/track/asset/location persistence;
- missing-location reconciliation;
- scene-preset round trips;
- concurrent read behavior;
- bounded scan transactions.

Do not mock SQL statements.

Work, collection, theme, grouping-evidence, and analysis-artifact persistence tests begin with the migrations that introduce those tables.

### 4. Filesystem scanner tests

Use real temporary directory trees.

Cover:

- initial discovery;
- repeated scan idempotency;
- nested directories;
- supported and unsupported extensions;
- symlink policy;
- changed metadata;
- file rename or move behavior;
- missing files;
- duplicate content at two paths;
- unreadable paths;
- paths outside approved roots;
- partial failures without corrupting prior catalog state.

Initial fixtures should be small enough to commit and understand.

### 5. Bun host integration tests

Start a real Bun server on an ephemeral port and use real `fetch` requests.

Cover:

- application routes;
- validation and typed errors;
- library scan commands;
- catalog reads;
- settings persistence;
- media resolution by location ID;
- `200` and `206 Partial Content` responses;
- `Range` and invalid-range behavior;
- content type and content length;
- missing and unavailable assets;
- path traversal attempts;
- disabled roots;
- server startup and graceful shutdown.

Do not expose arbitrary file paths in request contracts.

### 6. React component tests

Use `bun test`, React Testing Library, `@testing-library/jest-dom`, and Happy DOM where appropriate.

Cover:

- semantic roles and accessible names;
- transport controls;
- card view selection and persistent transport behavior;
- selected and disabled states;
- library empty/loading/error states;
- scene mode and parameter controls;
- keyboard interaction that does not require real layout;
- focus behavior that Happy DOM can represent reliably.

Prefer `getByRole`, `getByLabelText`, and visible behavior over test IDs.

Official Bun references:

- [Bun test runner](https://bun.com/docs/test)
- [Bun DOM testing](https://bun.com/docs/test/dom)
- [Testing Library with Bun](https://bun.com/docs/guides/test/testing-library)

### 7. Codex-native browser verification

A real browser is mandatory for capabilities Happy DOM does not implement accurately:

- `HTMLMediaElement` playback lifecycle;
- autoplay/user gesture behavior;
- seeking and ended events;
- same-origin Web Audio media graph;
- analyser data;
- WebGPU capability and device lifecycle;
- pointer capture and real geometry;
- layout, overflow, resizing, and focus;
- shadcn/Base UI overlays and positioning;
- theme rendering;
- no console errors.

Use the bundled Codex in-app Browser as the primary localhost verification surface. Task 1 does not add `@playwright/test`, a Playwright configuration, or another project-managed browser runner.

The Browser plugin should provide:

- semantic DOM snapshots and stable locator-based interaction;
- screenshots and visual comparison;
- viewport control for responsive checks;
- console-log inspection;
- read-only page evaluation for geometry, media state, canvas state, focus, and runtime diagnostics;
- visual or coordinate interaction when the WebGPU canvas has no meaningful DOM target.

Use Computer Use only when verification crosses into browser chrome, macOS dialogs, Finder, media-key behavior, or another native UI surface that the Browser plugin cannot inspect adequately.

The Browser plugin may expose internal Playwright-shaped APIs. Using those through Codex is not the same as installing or managing Playwright in the Wave Player Next repository.

Required viewport passes:

| Viewport | Primary checks |
|---|---|
| `1440 × 1000` | card focal hierarchy, visualizer scale, pointer interaction, overlays, and surrounding whitespace |
| `1024 × 768` | short-height fitting, persistent transport, internal scrolling, and overlay positioning |
| `390 × 844` | narrow card anatomy, touch-sized controls, long metadata, internal view scrolling, and no horizontal overflow |

For each pass, record the route, viewport, actions, observed state, console status, and screenshot path in the implementation report. Agent-run verification complements tests; it must not be represented as a repeatable CI suite.

### 8. Visual regression and performance checks

Visualizers require more than snapshotting React markup.

Use:

- deterministic generated signal fixtures;
- stable scene parameters and timestamps;
- selected screenshot baselines for important states;
- numerical assertions for generated vertices, buffers, or field values;
- runtime measurements for frame stability and allocation behavior;
- manual visual review for artistic quality.

Do not overuse pixel-perfect snapshots for nondeterministic GPU output. Test deterministic inputs and major visual structure.

## Fixture strategy

Maintain a small, documented fixture library containing only files whose purpose is clear.

Suggested fixtures:

- short stereo PCM WAV;
- short mono WAV;
- WAV with metadata chunks;
- one short MP3;
- unsupported or intentionally malformed file;
- same audio bytes under two paths;
- filename examples representing Ableton versions and stems;
- a directory containing an ignored `.als` file beside WAV and MP3 exports;
- generated oscillator buffers for scene tests.

Each binary fixture should have a companion manifest describing:

- origin and license;
- expected format;
- duration;
- sample rate and channels;
- expected metadata;
- tests that depend on it.

Do not use the user's personal music in automated tests.

## Minimal-mock policy

Mocks are appropriate for:

- forcing an autoplay rejection;
- simulating WebGPU device loss when a real failure cannot be induced reliably;
- deterministic clocks or schedulers;
- a future network backend when offline tests must force specific failures;
- verifying rare cancellation races after the real boundary has integration coverage.

Mocks are not appropriate for:

- SQLite;
- filesystem discovery;
- Bun HTTP and media routes;
- core grouping logic;
- serializing themes or presets;
- ordinary React user interaction;
- proving that playback works in a browser.

Prefer a narrow typed fake over `mock.module`. Avoid deep mock graphs.

## Coverage

Run `bun test --coverage` regularly and in CI once CI exists.

Coverage expectations:

- core invariants, parsers, reconciliation, and state transitions should approach complete branch coverage;
- server security and media routing need explicit happy and failure-path coverage;
- controllers need race, cancellation, and disposal coverage;
- generated shadcn component source does not need artificial tests unless customized or critical;
- visual quality cannot be reduced to a line-coverage target.

Do not set an arbitrary global threshold before the first real suite reveals the baseline. Before the first public release, establish and enforce a threshold that prevents regression while retaining behavior-focused review.

Bun supports text/LCOV coverage and configurable thresholds. Reference: [Bun code coverage](https://bun.com/docs/test/code-coverage).

## Test organization

Prefer tests beside the behavior they specify when that improves discoverability, with dedicated fixture and system-test directories for shared resources.

Possible shape:

```text
src/core/library/track.test.ts
src/app/player/player-controller.test.ts
src/server/database/library-repository.integration.test.ts
src/server/media/media-route.integration.test.ts
src/client/player/transport-controls.test.tsx

test/
  fixtures/audio/
  fixtures/library/
  visual/

docs/
  reports/
    task-1-verification.md
```

Use names that state behavior, not vague labels such as `works correctly`.

## Quality gates

Before a change is considered complete, run the most relevant subset of:

```text
bun test
bun test --coverage
TypeScript 7 type-check
lint/format checks
Codex-native live verification
production build
```

Before a commit, review the pending diff and ensure no broken or skipped critical test is being hidden.

## First vertical-slice test matrix

The first implementation goal is not complete until tests prove:

- a configured root scans into a real SQLite database;
- rescanning is idempotent;
- rescanning preserves playback when the selected location, asset fingerprint, and media URL are unchanged;
- changing a selected file's size or modification time at the same location reloads it without autoplay;
- unsupported files are reported without corrupting the import;
- a catalog track resolves to a known local location;
- the media endpoint supports byte ranges and rejects arbitrary paths;
- selection loads the expected track;
- play, pause, seek, next, previous, and ended state behave in a real browser;
- selected track and volume restore after reload;
- changing between visual, library, and scene card views does not reset playback or transport state;
- the oscilloscope and Lissajous modes receive real analyser data;
- scene parameters and presets round-trip;
- UI controls are accessible and keyboard operable;
- runtime and GPU resources dispose cleanly.

## Deferred testing decisions

- CI browser automation is deferred until a repeatable need justifies project-managed infrastructure.
- The initial coverage baseline and threshold are selected after the first behavior-complete suite exists.
- Cross-platform visual baselines wait until the macOS-first card and scene are stable.
- WebGPU CI coverage waits for a supported runner with evidence that it exercises a real-enough adapter.
