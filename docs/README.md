# Wave Player Next

> Status: Living design packet; Task 1 implementation is underway.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Purpose

This directory is the durable planning record for Wave Player Next: a local-first personal audiovisual music system that begins as an isolated TypeScript and Bun application and may later contribute stable modules or packages back to KKB.

The packet is intended to support continued design discussion in the current Codex task and a clean handoff to future implementation tasks after explicit approval. It is not an implementation plan that should be executed automatically.

## Current product direction

Wave Player Next should become:

- a useful personal player for original music, Ableton exports, masters, stems, and related audio;
- a durable local music library with explicit modeling for works, listenable versions, assets, and locations;
- an interactive visual instrument inspired by Winamp, the Virtual Light Machine, oscilloscopes, Lissajous figures, and cymatics;
- a card-centered player interface structurally inspired by trading card games;
- a polished open-source project;
- a structured learning path through TypeScript 7, Bun, Rust, WebAssembly, GPUI, and later native environments;
- a possible source of proven audio and visualization modules for KKB.

## Document index

Read these documents in order before planning or implementing:

1. [Product vision](product-vision.md) — product identity, principles, users, and long-term success.
2. [Architecture](architecture.md) — modular-monolith shape, module boundaries, dependencies, state ownership, and main flows.
3. [Core model](core-model.md) — works, tracks, assets, locations, collections, Ableton grouping, and stable identities.
4. [Playback and visualization](playback-and-visualization.md) — transport, signal, renderer, scene, preset, theme, and Rust/WASM boundaries.
5. [UI system](ui-system.md) — shadcn/ui, the Base UI preset, component composition, theming, and accessibility.
6. [Player card interface](player-card-interface.md) — card anatomy, internal views, responsive behavior, motion, and agent-assisted design workflow.
7. [Testing strategy](testing-strategy.md) — `bun test`, real-boundary tests, Codex-native browser verification, fixtures, coverage, and minimal-mock policy.
8. [Backend evolution](backend-evolution.md) — SQLite-first design, future Convex integration, object storage, synchronization, and additional clients.
9. [Scope and roadmap](scope-and-roadmap.md) — first useful release, exclusions, later phases, and phase gates.
10. [Decision log](decision-log.md) — settled, provisional, and deferred decisions from the planning discussion.
11. [Implementation handoff](implementation-handoff.md) — readiness criteria and instructions for future Codex implementation tasks.

## Settled constraints

- Begin in a new isolated repository at `~/dev/apps/wave-player-next` rather than KKB.
- Treat `wave-player-next` as a working name that may later become `wave-player` or another durable project name.
- Use a `localhost` React application served by a Bun process for the first useful version.
- Use TypeScript 7 and Bun as the initial application stack.
- Use Bun SQLite as the initial durable catalog.
- Index audio files in place rather than copying them into a managed library.
- Guarantee WAV and MP3 as the initial playable formats.
- Treat Ableton Live Project directories and `.als` Live Sets as later metadata inputs rather than playable assets in Task 1.
- Use `HTMLMediaElement` as the default playback transport.
- Keep playback and visualization independent and compose them through an analysis/signal boundary.
- Name the pure domain and invariant layer `src/core/`.
- Name the application/use-case layer `src/app/`.
- Use shadcn/ui for the React component layer.
- Initialize shadcn/ui with Base UI primitives, not Radix UI, and apply preset `b1D0enCq`.
- Use one portrait player card as the initial application shell, with persistent track identity and transport around changeable visual, library, and scene views.
- Borrow trading-card structure, not collectible-card styling or game mechanics.
- Add a small Wave-specific semantic token layer while retaining the preset's component tokens.
- Use a small typed JSON HTTP API over `Bun.serve`, with runtime validation at untrusted boundaries.
- Persist one UI-configured canonical library root, with a CLI bootstrap or recovery override.
- Use ordered transactional SQL migrations without an ORM.
- Keep browser audio and visualization adapters under `src/client/` rather than a top-level `src/audio/` directory.
- Test thoroughly with `bun test` and related libraries while minimizing mocks.
- Use Codex's in-app Browser as the primary localhost verification surface and Computer Use for native macOS or browser-chrome gaps; do not add a project-managed Playwright runner in Task 1.
- Implement the first scene as an oscilloscope/Lissajous instrument.
- Follow quickly with a VLM-style light synthesizer and then a cymatics-inspired nodal scene.
- Introduce Rust first through a pure analysis/cymatics core compiled to WASM and reused by a native CLI.
- Treat Convex, S3/R2, GPUI, Native SDK, and broader source integrations as later phases.
- Task 1 implementation began after explicit user approval on July 15, 2026.

## Prior local work to consult

Future planning and implementation tasks should inspect, but not blindly copy:

- [KKB audio runtime adapter architecture](/Users/kalynbeach/dev/kkb/kkb/docs/reports/2026-04-30-audio-runtime-adapter-architecture.md)
- [KKB audio package architecture vision](/Users/kalynbeach/dev/kkb/kkb/docs/reports/2026-04-29-audio-package-architecture-vision.md)
- [KKB web audio player architecture research](/Users/kalynbeach/dev/kkb/kkb/docs/research/2026-06-01-web-audio-player-architecture.md)
- [KKB track loading, selection, and storage specification](/Users/kalynbeach/dev/kkb/kkb/docs/specs/2026-03-12-web-audio-player-track-loading-selection-storage.md)
- [WavePlayer current-state deep-dive](/Users/kalynbeach/dev/apps/wave-player/docs/2026-04-24-current-state-deep-dive-review.md)
- WavePlayer card-layout prototype screenshot at `/Users/kalynbeach/Desktop/Screenshot 2026-07-15 at 11.04.56 AM.png`
- [`wave_tools` Rust repository](https://github.com/kalynbeach/wave_tools)

## How this packet should evolve

- Add newly settled choices to `decision-log.md`.
- Update the affected design document when a decision changes architecture or scope.
- Keep deferred ideas in `scope-and-roadmap.md` instead of silently adding them to the first release.
- Keep `implementation-handoff.md` marked ready for goal creation only while all blocking decisions remain resolved.
- When implementation begins, preserve this directory as the design source of truth and record material deviations.

## Handoff recommendation

Use one primary Codex implementation task for the first vertical slice because the Bun host, SQLite catalog, media route, player controller, React UI, and first visualizer must be proven together. Use later tasks for the Rust/WASM core, additional visual scenes, Convex/cloud work, and GPUI exploration after the first slice is stable.

Do not create worktrees. Do not begin a KKB migration during the isolated experiment.
