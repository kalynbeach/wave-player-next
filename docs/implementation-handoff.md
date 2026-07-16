# Implementation Handoff

> Status: Task 1 and Phase 2B implemented and verified.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 16, 2026.

## Purpose

This document records the handoff from planning into Task 1 and the gate for future implementation tasks.

The user explicitly approved implementation on July 15, 2026. Task 1 completed
in the isolated repository described below; see the
[Task 1 implementation report](implementation-report.md). The separately
approved Phase 2B light synthesizer completed on July 16, 2026; see the
[Phase 2B implementation report](phase-2b-implementation-report.md).

## Recommended task structure

### Task 1: first vertical slice

Use one primary Codex task for the first useful release.

Reason:

- project initialization, shadcn/Base UI setup, core model, SQLite, filesystem scanning, media routes, player state, React UI, Web Audio, and the first scene form one cross-cutting vertical slice;
- dividing them across independent tasks before contracts exist would create coordination and merge risk;
- one persistent task can sequence the work, run the complete test story, and keep the application usable.

The implementation agent may delegate bounded research or verification internally only when authorized by the active instructions, but one task should own the outcome.

### Follow-up tasks

After Task 1 is complete and stable:

- Task 2A: Ableton-aware library intelligence and Work grouping;
- Task 2B: VLM-style feedback/light synthesizer — complete;
- Task 3: Rust core, native CLI, WASM Worker, and cymatics scene;
- later tasks: open-source hardening, Convex/object storage, GPUI, and KKB extraction.

Tasks 2A and 2B may proceed separately only if Task 1 leaves stable non-overlapping seams.

## Required reading for future implementation tasks

Read every document in this directory before changing code:

- `README.md`;
- `product-vision.md`;
- `architecture.md`;
- `core-model.md`;
- `playback-and-visualization.md`;
- `ui-system.md`;
- `player-card-interface.md`;
- `testing-strategy.md`;
- `backend-evolution.md`;
- `scope-and-roadmap.md`;
- `decision-log.md`;
- this handoff.

Also inspect the prior KKB and WavePlayer documents linked from `README.md`.

## Preconditions before creating the first goal

The planning packet, repository path, format boundary, root flow, API shape, card interface, theme layer, migration approach, runtime directories, and verification workflow are settled.

All preconditions were satisfied and the implementation goal was created on July 15, 2026.

## Task 1 objective

The eventual objective should be equivalent to:

> Build and verify the first useful Wave Player Next vertical slice in a new isolated repository at `~/dev/apps/wave-player-next`: a TypeScript 7 and Bun localhost React application using shadcn/ui with Base UI preset `b1D0enCq`; a tested SQLite-backed library that configures one root and indexes WAV and MP3 files in place; secure Range-capable media serving; reliable browser-native playback and session restoration; and a responsive trading-card-structured player with persistent track identity and transport around changeable Visual, Library, and Scene views, including one interactive WebGPU oscilloscope/Lissajous scene with saved presets. Use the installed design skills and Codex-native Browser and Computer Use verification. Persist until the complete implementation acceptance criteria pass, while keeping every deferred phase out of scope.

This objective was activated and completed on July 15, 2026.

## Required implementation constraints

- Use `bun`, `bunx`, and `bun pm` for JavaScript/TypeScript/package work.
- Use TypeScript 7 for type-checking.
- Do not assume TypeScript 7.0 provides a compiler API; verify compiler-integrated tooling and add TypeScript 6 side-by-side only for a demonstrated compatibility need.
- Configure Bun and any other required global type packages explicitly in `compilerOptions.types`.
- Do not introduce `any` unless absolutely necessary and documented.
- Check installed dependency types rather than guessing APIs.
- Do not create barrel files without a clear reason.
- Do not create or use git worktrees.
- Do not modify KKB during the isolated experiment.
- Use `~/dev/apps/wave-player-next` as the target and keep `wave-player-next` as the working name.
- Do not add Convex, S3/R2, Redis, Rust, WASM, GPUI, or Native SDK to Task 1.
- Do not replace `HTMLMediaElement` with a custom transport.
- Do not copy, move, rename, delete, or retag user audio.
- Bind the host to `localhost`.
- Do not accept raw filesystem paths from media requests.
- Guarantee WAV and MP3; ignore `.als` and other unsupported files without treating them as playback assets.
- Use a small typed JSON API over `Bun.serve`; do not add tRPC, GraphQL, or generated API infrastructure.
- Use ordered transactional SQL migrations with checksums and no ORM.
- Use Base UI component APIs, not Radix-specific patterns.
- Apply only the specified shadcn preset and review generated files.
- Keep core and app boundaries as documented.
- Keep browser audio and visualization adapters under `src/client/` rather than creating a top-level `src/audio/` layer.
- Keep playback independent from visualization.
- Keep the portrait player card as the primary shell, with persistent identity and transport around Visual, Library, and Scene views.
- Use one outer card and semantic internal regions; do not build nested cards, a permanent sidebar, or a permanent inspector.
- Add the documented Wave-specific semantic tokens without replacing the preset's component token system.
- Use the installed Impeccable, shadcn, Interface Craft, and Emil design-engineering skills during UI work.
- Use the Codex in-app Browser as the primary localhost verification surface and Computer Use for native UI gaps.
- Do not install `@playwright/test` or create a project-managed browser runner in Task 1.
- Use real inexpensive dependencies in tests and minimize mocks.
- Update design docs when implementation evidence requires a material change.

## Draft sequence for Task 1

1. Read and summarize the complete design packet, including the player-card interface.
2. Inspect or create the clean target directory at `~/dev/apps/wave-player-next` and establish repository rules without creating a worktree.
3. Bootstrap the minimal Bun/React/TypeScript 7 application.
4. Initialize shadcn/ui with Base UI and apply preset `b1D0enCq`.
5. Use Impeccable to create target-repository `PRODUCT.md` and `DESIGN.md` from this packet before substantial UI work.
6. Establish `bun test`, React Testing Library, Happy DOM, fixtures, and coverage before building product behavior.
7. Implement core IDs, track/asset/location model, and invariants.
8. Implement the ordered SQL migration runner, `0001_initial`, and real SQLite repository tests.
9. Implement UI-backed one-root configuration plus a CLI bootstrap/recovery override.
10. Implement WAV/MP3 scan and reconciliation with real filesystem fixtures that also contain ignored `.als` and unsupported files.
11. Implement the typed JSON API, secure media resolution, and Range-capable route tests.
12. Implement framework-agnostic playback runtime/controller and browser-local restoration.
13. Implement the responsive card shell, persistent track header and transport, and Visual, Library, and Scene views with shadcn/Base UI components.
14. Implement the signal provider and WebGPU oscilloscope/Lissajous scene without coupling it to playback internals.
15. Add meaningful scene parameters and SQLite-backed preset persistence.
16. Use Interface Craft and Emil design-engineering guidance to storyboard, tune, and review only the purposeful card-view and state transitions.
17. Run tests, coverage, type-check, lint/format, and the production build.
18. Use the Codex in-app Browser to verify the complete flow at `1440 × 1000`, `1024 × 768`, and `390 × 844`; use Computer Use only for native UI gaps.
19. Review scope, design quality, accessibility, docs, diff, and remaining limitations; write the implementation and verification report.

The sequence may change when repository evidence justifies it, but scope may not expand silently.

## Acceptance criteria

Use the complete definition of done in `scope-and-roadmap.md`. At minimum, the implementing task must demonstrate:

- real scan into real SQLite;
- idempotent rescan;
- no user-file mutation;
- secure media access by known asset location;
- Range requests;
- real playback lifecycle;
- persisted selection and volume;
- persistent playback while changing card views;
- usable Visual, Library, and Scene card views;
- responsive card behavior at all required viewports;
- real analyser data;
- interactive oscilloscope and Lissajous modes;
- saved scene preset;
- Base UI shadcn implementation;
- accessible controls;
- passing tests and coverage review;
- passing type-check and build;
- Codex Browser evidence and any required Computer Use evidence;
- clean resource disposal;
- updated documentation.

## Babysitting expectations

The future Codex task should persist until the objective is actually achieved or a genuine external/user decision blocks progress.

It should:

- share concise status updates during long-running work;
- fix failures within scope rather than stopping after the first failed check;
- inspect real runtime behavior, not rely only on unit tests;
- revisit the active scope before accepting agent-suggested improvements;
- avoid declaring completion with known broken critical behavior;
- report changed files, checks, browser evidence, and remaining deferred work;
- not create a commit unless the user explicitly requests one.

## Scope stop rules

Stop and ask for direction if implementation would require:

- changing the selected primitive base away from Base UI;
- removing intentional functionality;
- mutating or relocating user audio;
- adding a cloud account or external service;
- changing the default transport away from `HTMLMediaElement`;
- making a significant new package or process boundary;
- selecting among materially different unresolved product behaviors;
- replacing the settled card shell with a conventional dashboard, permanent sidebar, or multi-card grid;
- adding a project-managed browser automation framework.

## Documentation obligations during implementation

- Keep the planning packet intact.
- Add an implementation report or update this handoff when Task 1 completes.
- Record material design deviations in `decision-log.md` with rationale.
- Move newly discovered later-phase ideas into `scope-and-roadmap.md`.
- Do not rewrite planning history to make implementation appear inevitable.

## Readiness checklist

- [x] Repository name/path settled.
- [x] Initial formats settled.
- [x] Root configuration UX settled.
- [x] Client/host API shape settled.
- [x] Initial UI layout settled.
- [x] Theme-layer decision settled.
- [x] SQLite migration approach settled.
- [x] Browser verification workflow settled.
- [x] Packet consistency reviewed.
- [x] User gave explicit implementation approval.

Task 1 completed after the approved transition. Do not begin a later phase without a separately scoped and authorized goal.
