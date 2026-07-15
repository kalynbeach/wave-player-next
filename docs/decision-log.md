# Decision Log

> Status: Living design document; Task 1 implementation is underway.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Status meanings

- Settled: use this decision unless the user explicitly changes it.
- Provisional: current recommendation; discuss further before the affected implementation.
- Deferred: intentionally later, not rejected.
- Open: must be decided before the relevant implementation goal.

## Decisions

| Date | Status | Decision | Rationale and consequence |
|---|---|---|---|
| 2026-07-13 | Settled | Build a personal audiovisual music system, not a generic streaming clone. | Personal creative software is the primary motivation; listening to original music and Ableton exports is the anchor workflow. |
| 2026-07-13 | Settled | Target a genuinely useful personal tool, polished open-source project, and focused learning vehicle. | Each phase must produce usable value while preserving craft and a clear learning axis. |
| 2026-07-13 | Settled | Begin as an isolated experiment and later move proven modules into KKB where appropriate. | The experiment needs freedom without destabilizing KKB; extraction waits for a second consumer. |
| 2026-07-13 | Settled | Technology order is TypeScript 7/Bun, Rust/WASM, Rust/GPUI, then Native SDK/Zig. | The roadmap should not introduce later technologies before their product boundary exists. |
| 2026-07-13 | Settled | macOS-first is acceptable. | The first browser/runtime and WebGPU support can be verified against the primary development machine. |
| 2026-07-14 | Settled | Use a local-first modular monolith. | One Bun host, React client, SQLite catalog, browser playback, and independent visualization runtime minimize operational complexity. |
| 2026-07-14 | Settled | Use `HTMLMediaElement` as the default playback transport. | Reliable native transport comes before custom decoding, buffering, or worklet pipelines. |
| 2026-07-14 | Settled | Model Work, Track, Asset, and AssetLocation separately. | A mix/master version is not the same thing as an encoding or a filesystem path. |
| 2026-07-14 | Settled | Index local files in place for the initial useful version. | Avoid copying or mutating personal media while the catalog and player are being proven. |
| 2026-07-14 | Settled | A localhost React application is acceptable initially. | This keeps the first focus on TypeScript, Bun, library behavior, playback, and scenes. |
| 2026-07-14 | Settled | Scene order is oscilloscope/Lissajous, VLM-style light synthesizer, then cymatics-inspired nodal field. | It advances from a direct signal instrument to feedback art and then Rust/WASM-friendly physical computation. |
| 2026-07-14 | Settled | Convex and other backend changes belong in later phases. | Preserve backend boundaries now without delaying local usefulness for sync and auth infrastructure. |
| 2026-07-15 | Settled | Name the pure product/invariant layer `src/core/`. | The name is acceptable if it remains free of frameworks, infrastructure, and generic helper accumulation. |
| 2026-07-15 | Settled | Name the use-case/orchestration layer `src/app/`. | React remains under `src/client/`; `src/app/` expresses application commands and controllers. |
| 2026-07-15 | Settled | Use `bun test` and related libraries with thorough coverage and minimal mocks. | Prefer real SQLite, filesystem, Bun server, media fixtures, and browser behavior over deep mock graphs. |
| 2026-07-15 | Settled | Use TypeScript 7 as the primary CLI type-checker without depending on its compiler API. | TypeScript 7.0 has no programmatic API; use TypeScript 6 side-by-side only if a selected tool concretely requires that API, and explicitly configure Bun types. |
| 2026-07-15 | Provisional | Import Ableton exports as independent tracks and offer non-destructive Work grouping suggestions. | This makes import predictable while still enabling metadata/project-aware grouping with confidence and user approval. |
| 2026-07-15 | Settled | Use shadcn/ui for the React component layer. | Reuse accessible source components and compose custom audio/visual surfaces around them. |
| 2026-07-15 | Settled | Use Base UI primitives, not Radix UI, with preset `b1D0enCq`. | Future initialization must verify `base: base`; the preset begins with Mira, neutral tokens, Phosphor icons, Geist Mono, and no radius. |
| 2026-07-15 | Settled | Create the isolated repository at `~/dev/apps/wave-player-next`. | `wave-player-next` is an acceptable working name; a later rename to `wave-player` or another durable name remains expected and does not block the experiment. |
| 2026-07-15 | Settled | Guarantee WAV and MP3 in Task 1. | They are the user's primary Ableton export formats; other formats can follow a verified browser-support matrix. |
| 2026-07-15 | Settled | Defer Ableton Live Project directory and `.als` parsing to Phase 2A. | These are metadata and grouping inputs, not playable assets; their presence must not break Task 1 scans. |
| 2026-07-15 | Settled | Configure one canonical library root through the first-run UI with a CLI bootstrap or recovery override. | This produces a useful product flow without requiring a native folder picker in the localhost web shell. |
| 2026-07-15 | Settled | Use a small typed JSON API implemented with `Bun.serve` and boundary validation. | Direct routes keep the local modular monolith understandable; no RPC framework is required. |
| 2026-07-15 | Settled | Use one responsive portrait player card as the initial application shell. | Trading cards provide the structural hierarchy: persistent identity, artwork-like visualization, changeable internal views, and persistent transport. |
| 2026-07-15 | Settled | Borrow trading-card structure without borrowing a specific game's visual style or mechanics. | The player should remain an original music instrument rather than a collectible-card simulation. |
| 2026-07-15 | Settled | Put visual, library, and scene controls in changeable card views while keeping track identity and transport mounted. | This supports progressive disclosure without surrounding the player with a dashboard sidebar or permanent inspector. |
| 2026-07-15 | Settled | Add a small Wave-specific semantic token layer immediately. | The shadcn preset remains the component foundation, while the player frame, scene, signal, meter, and transport gain stable product roles. |
| 2026-07-15 | Settled | Use ordered transactional SQL files and a checksum-tracked migration table without an ORM. | The first schema stays small and later Work/grouping tables prove the migration path. |
| 2026-07-15 | Settled | Use the Codex in-app Browser and Computer Use instead of a project-managed Playwright runner for Task 1. | This leans into Codex-native semantic, visual, responsive, GPU, and desktop verification while keeping the project test stack centered on `bun test`. |
| 2026-07-15 | Settled | Keep browser audio and visualization implementations under `src/client/`. | `src/client/audio/` and `src/client/visualization/` are clearer than an ambiguous top-level `src/audio/` layer. |
| 2026-07-15 | Settled | Require the implementation task to use the installed Impeccable, shadcn, Interface Craft, and Emil design-engineering skills for UI work. | The card shell, Base UI composition, motion, responsive behavior, and polish should be shaped and verified through the user's established agent workflow. |
| 2026-07-15 | Settled | Do not begin implementation until explicit approval. | The current task remains architecture and documentation work. |
| 2026-07-15 | Settled | Begin Task 1 after explicit user approval, with logical verified milestone commits. | The implementation goal is active; commits remain local and no remote, push, PR, or publication is authorized. |

## Deferred decisions

| Topic | Current direction | Revisit when |
|---|---|---|
| Convex | Portable metadata and reactive synchronization candidate | Local player and library are useful |
| S3/R2 | Candidate for remote audio objects and signed URLs | Remote media is approved |
| Redis | No current requirement | A real cache, queue, pub/sub, or distributed-state need appears |
| Rust core | Pure algorithms reused by CLI, WASM, and native clients | TypeScript vertical slice is stable |
| GPUI | Native client or focused experimental interface | Core serialization and Rust analysis are stable |
| Native SDK | Comparative native UI experiment | GPUI and web-client tradeoffs are understood |
| KKB extraction | Move only proven, shared modules | KKB becomes a real second consumer |
| Public scene plugins | Internal registry and several built-in scenes first | Scene lifecycle is proven and external demand exists |
| Managed library | Continue indexing in place initially | Copying, transcoding, or content-addressed storage solves a real need |

## First-goal readiness

All blocking product and architecture decisions identified for the first implementation goal are settled. Exact visual values, route spelling, leaf filenames, and other evidence-driven implementation details remain tunable within the documented boundaries.

## Questions to revisit before Phase 2A

- Which Ableton Live Project and Set metadata can be parsed reliably.
- How grouping evidence and confidence appear in the UI.
- Whether albums/releases become a dedicated entity.
- Whether stems are tracks with a role or have explicit relationships.
- How user edits and imported metadata retain provenance.

## Questions to revisit before cloud work

- Canonical authority for portable metadata.
- Offline-edit guarantees.
- Conflict model.
- Object-storage provider and URL authorization.
- Device identity and local-path privacy.
