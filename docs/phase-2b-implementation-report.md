# Phase 2B implementation and verification report

> Status: Complete.
>
> Goal: `019f6c17-63eb-7940-8447-2cc57e9991eb`.
>
> Verified: July 16, 2026.

## Result

Wave Player Next now has a typed internal registry containing exactly the
existing `signal` scene and the new `light-machine` scene. A browser
visualization session owns scene state and renderer lifecycle outside React,
while the existing media element, Web Audio graph, controller, card identity,
and transport remain independent and continuously mounted.

The new light machine is an original two-texture WebGPU feedback synthesizer.
It combines bounded decay, mirrored polar symmetry, rotation and zoom,
three explicit palettes, color cycling, and modulation from the existing RMS,
peak, bass, mid, and treble data. Pointer, keyboard, explicit controls, reset,
bounded `Vary`, and scene-owning presets all operate through validated scene
state.

No Phase 2A, Rust, WASM, cymatics, cloud, native-client, public-plugin, shader
editor, node-graph, or new audio-analysis work was added.

## Delivered architecture

- `src/core/scene/` owns stable IDs, version 1 state contracts, strict
  parameter validation, defaults, and bounded light-machine variation.
- `src/app/visualization/` owns renderer/session contracts without browser or
  React dependencies.
- `src/client/visualization/` owns the internal two-renderer registry, browser
  session, WebGPU resources, shared-canvas serialization, animation loops,
  resize, error reporting, and deterministic cleanup.
- React mounts one canvas, renders session snapshots, forwards semantic input,
  and exposes explicit controls for the active scene. It does not own GPU
  resources.
- The existing SQLite schema stores both scene unions without a migration.
  Existing signal rows continue to parse unchanged.
- Renderer factories are serialized per shared canvas. A stale renderer is
  disposed before a current renderer configures the context, and activation or
  initialization failure leaves the queue recoverable.

## Automated verification

The final gate ran from the repository root:

| Check | Result |
|---|---|
| `bun test --coverage` | 71 passed, 0 failed, 309 assertions; 93.68% line and 85.32% function coverage |
| `bun run typecheck` | passed with TypeScript 7.0.2 |
| `bun run check` | passed across the complete repository |
| `bun run build` | passed; server, client, HTML, and CSS emitted under ignored `dist/` |
| `git diff --check` | passed |

The focused scene/session/GPU tests prove:

- exactly two built-in scene definitions and factories;
- duplicate and unknown IDs, unknown versions, extra keys, and out-of-range
  parameters fail explicitly;
- deterministic defaults and bounded variation;
- legacy signal-preset compatibility and light-machine HTTP/SQLite round trips;
- preset-driven scene selection;
- per-scene state retention and playback-runtime identity across scene changes;
- stale async renderer disposal, shared-canvas factory serialization, current
  factory rejection, activation-failure recovery, and idempotent disposal;
- one active loop, hidden-view cancellation, one resumed loop, and capped
  resize;
- device loss immediately releases observers, contexts, buffers, devices, and
  both light-machine textures; later repeated disposal leaves counts unchanged;
- initial size equality still creates two feedback textures and renders;
- backing-size changes reconfigure the canvas before the next frame;
- constructor configure failure releases the observer, buffer, context, and
  device;
- failure on the second feedback texture destroys the first partial texture
  plus the uniform buffer, observer, context configuration, and device;
- frame failures publish one understandable terminal renderer error instead of
  escaping the animation callback.

The real HTTP tests bind localhost and prove both preset kinds, malformed
payload rejection, unsupported scene/version rejection, and the existing
media and library behavior. The full suite requires loopback permission in the
Codex sandbox; without it, only the four HTTP tests fail with `EPERM` while
binding `127.0.0.1:0`.

## Live fixtures and surfaces

Live verification used only generated disposable audio:

- `/private/tmp/wave-player-next-phase2b-audio/Phase2B-Light.mp3`;
- `/private/tmp/wave-player-next-phase2b-audio/Phase2B-Stereo.wav`.

Both are 45-second stereo tones. Runtime data was isolated under
`/private/tmp/wave-player-next-phase2b-data`, and the app ran at
`http://localhost:3216/`. No user audio was read, copied, moved, renamed,
retagged, changed, or deleted.

The Codex in-app Browser was the primary verification surface. Native Safari
was used only for the trusted media gesture that automated browser interaction
cannot grant. No project-managed Playwright runner was installed.

The project-pinned `shadcn` 4.13.0 CLI was used successfully for project info,
component documentation, dry-run, diff, view, and generation of the Base UI
toggle primitives. The remote `@latest` rejection did not block shadcn usage,
and generated source was reviewed before integration.

## Real-audio playback and visual evidence

The trusted Safari run proved that one playing `Phase2B-Light.mp3` continued
through repeated scene changes:

| State | Time | Transport | Volume |
|---|---:|---|---:|
| signal Visual | 6.6 s | playing | 0.8 |
| signal Scene view | 12.9 s | playing | 0.8 |
| light-machine selected | 16.8 s | playing | 0.8 |
| signal selected again | 20.8 s | playing | 0.8 |
| light-machine Visual | 33 s | playing, analyser live | 0.8 |

The selected track, media element, Web Audio graph, volume, and time progression
were not reset. The live light-machine frame visibly rendered an audio-reactive
four-fold electric pattern while the interface reported `analyser live`.

Real WebGPU shader/pipeline creation succeeded in both Chromium and Safari.
The in-app Browser rendered the default scene and an alternate eight-fold
ultraviolet variation. Its final fresh-tab check reported `light-machine`,
version 1, renderer `ready`, no horizontal overflow, and an empty warning/error
console.

Direct interaction produced validated, observable state changes:

- `P`, ArrowRight, and ArrowUp changed electric to ember, rotation from 0° to
  4°, and zoom from 1.04 to 1.07;
- a pointer drag changed rotation from 4° to 29° and zoom from 1.07 to 1.20;
- `Vary` changed feedback 0.88 to 0.90, rotation 0° to 30°, zoom 1.04 to
  0.88, color cycle 0.18 to 0.33, audio modulation 0.72 to 0.90, and intensity
  1.10 to 1.05, all within each control's declared bounds;
- reset restored every documented default;
- signal reset restored gain from a changed 1.20 to 1.15.

During Safari verification, a real shared-canvas race first surfaced as
`getCurrentTexture(): canvas is not configured`. The fix serializes factories,
reconfigures after backing-size changes, and contains genuine frame errors.
After reload the runtime overlay was gone, playback and scene switching passed,
and the regression suite directly covers the race and cleanup paths.

## Preset evidence

The live UI saved both `Phase 2B Light proof · Light machine` and
`Phase 2B Signal proof · Signal` into the isolated database. Loading the light
preset from signal selected `light-machine` and initialized its renderer as
`ready`; loading the signal preset from light selected `signal` and initialized
that renderer as `ready`.

Automated storage and HTTP tests separately prove scene ID, version, validated
parameters, and palette round-trip; direct insertion and reading of a Task 1
signal row proves no-migration compatibility. Malformed, unknown-scene, and
unsupported-version payloads fail at the untrusted boundary.

## Accessibility, motion, and responsive evidence

Scene selection, signal mode, light symmetry, palette, every range, preset
selection, reset, `Vary`, and save have unambiguous accessible names. Pressed
state is semantic and non-color-only. The canvas has scene-specific keyboard
and pointer instructions without coupling transport use to visual perception.

At `390 × 844`, the scene and mode selectors, range inputs, preset select,
reset, name input, and Save action measured at least 44 pixels on each required
interactive dimension. The focused Scene tab had a solid 1-pixel outline plus
a visible 3-pixel focus ring.

The runtime stylesheet contains two `prefers-reduced-motion: reduce` branches:
scrolling becomes immediate, tab/tooltip animations become 0.01 ms, button
transitions become 0.01 ms, and shimmer animation is removed. The continuous
WebGPU scene remains driven by audio and renderer activity rather than
decorative interface motion.

| Viewport | Observed result |
|---|---|
| `1440 × 1000` | card `672 × 896` at `(384, 52)`; active panel `672 × 653`; Visual, Library, and Scene had no horizontal overflow |
| `1024 × 768` | card about `526 × 736` at `(249, 16)`; active panel about `526 × 493`; all views had no horizontal overflow |
| `390 × 844` | card `374 × 828` at `(8, 8)`; active panel `374 × 551`; all views had no horizontal overflow and Scene scrolled internally |

## Acceptance matrix

| # | Result | Evidence |
|---:|---|---|
| 1 | Pass | Core and client registries contain exactly `signal` and `light-machine`; duplicate and unknown IDs are tested failures. |
| 2 | Pass | Signal defaults, oscilloscope/Lissajous controls, geometry tests, legacy preset row, and Task 1 behavior remain green. |
| 3 | Pass | Two capped `rgba8unorm` feedback textures, bounded resize, real analyser modulation, and the live Safari light frame are verified. |
| 4 | Pass | Explicit feedback, symmetry, transform, palette, cycle, modulation, and intensity changes produced distinct named and rendered states. |
| 5 | Pass | Keyboard and pointer input changed validated scene state; transport remains independently named and operable. |
| 6 | Pass | Bounded variation and deterministic defaults are unit-tested and live reset/Vary values were measured. |
| 7 | Pass | The same playing track progressed from 6.6 s to 33 s through repeated scene changes with volume 0.8; runtime identity is also unit-tested. |
| 8 | Pass | Hidden/resume, one-loop, stale/reverse ownership, partial allocation, and repeated disposal tests pass; device loss itself releases every owned observer/GPU resource before a later idempotent dispose. |
| 9 | Pass | Both scene unions round-trip through SQLite and real HTTP with version, validated parameters, and light palette. |
| 10 | Pass | Both live preset kinds selected their owner; malformed and unsupported presets fail clearly in core and HTTP tests. |
| 11 | Pass | Unsupported, factory rejection, activation recovery, configure/allocation failure, device loss, and frame error paths are typed and contained; playback ownership is separate. |
| 12 | Pass | Semantic names and pressed states, 44-pixel mobile targets, visible focus, keyboard controls, and canvas instructions were inspected. |
| 13 | Pass | All three views passed `1440 × 1000`, `1024 × 768`, and `390 × 844` without horizontal overflow. |
| 14 | Pass | Coverage, TypeScript, Biome, production build, and diff checks pass. |
| 15 | Pass | Generated real audio, both scenes, live switching, analyser reaction, direct input, presets, three viewports, clean console, lifecycle, and reduced motion were verified. |
| 16 | Pass | This report maps every criterion and records deferred scope below. |

## Deferred work

Phase 2A library intelligence, multiple roots, Ableton parsing/grouping, Rust,
WASM, Workers, cymatics, beat/onset analysis, MIDI/OSC/gamepad input, public
plugins, shader editing, node graphs, Canvas2D fallback, automatic unsaved
parameter persistence, cloud/auth/remote media, native clients, KKB extraction,
and broad player-card redesign remain deferred exactly as documented.
