# Phase 2B: Light Synthesizer

> Status: Approved for implementation.
>
> Approved: July 16, 2026.

## Objective

Turn the visualization layer into a genuinely multi-scene system and add one
expressive VLM-style light synthesizer without changing playback, library
behavior, or the card-centered product shell.

## User outcome

While music is playing, the user can switch between the existing signal
instrument and a new light synthesizer, directly shape the active scene, vary
it within safe bounds, and save or restore scene-specific presets without
interrupting playback.

## In scope

- a typed internal registry containing exactly two built-in scenes:
  - `signal`, preserving oscilloscope and Lissajous modes;
  - `light-machine`, the new VLM-style scene;
- stable scene IDs, versions, metadata, default parameters, validation,
  renderer creation, and deterministic disposal;
- a browser visualization session that owns active-scene and renderer
  lifecycle outside React presentation;
- scene-specific controls selected by scene ID without a generic
  schema-driven form framework;
- a WebGPU light synthesizer with bounded feedback textures, decay or trails,
  symmetry or mirroring, spatial transforms, color cycling or palette
  parameters, and modulation from existing frequency bins, RMS, and peak data;
- pointer and keyboard performance input;
- a bounded `Vary` action and deterministic reset;
- scene-aware presets and API types;
- loading a preset automatically selects its owning scene;
- preservation of existing stored signal presets;
- scene switching without resetting playback, selection, time, volume, the
  media element, or the Web Audio graph;
- focused automated tests, complete project gates, and live browser
  verification;
- a final `docs/phase-2b-implementation-report.md`.

## Explicitly out of scope

- Phase 2A library intelligence or Ableton grouping;
- public scene plugins, dynamic loading, or a plugin SDK;
- a third scene or cymatics work;
- Rust, WASM, Workers, or new offline analysis;
- beat detection, onset detection, or a new audio-analysis subsystem;
- custom playback transport or AudioWorklet infrastructure;
- MIDI, gamepad, OSC, or Ableton control;
- a shader editor, node graph, or user-authored shader format;
- a generalized runtime theme or palette-management system;
- a Canvas2D fallback;
- automatic persistence of unsaved scene parameters across reload; durable
  state remains preset-based;
- cloud, authentication, remote media, KKB extraction, or native clients;
- broad player-card redesign.

## Technical boundaries

- Reuse the existing `SignalFrame`; its waveform, frequency-bin, RMS, and peak
  data are sufficient for Phase 2B.
- Use a discriminated scene-state and preset union keyed by scene ID and
  version.
- Keep pure scene identities and parameter validation in `src/core/`.
- Keep orchestration contracts under `src/app/`.
- Keep WebGPU resources and browser visualization implementations under
  `src/client/visualization/`.
- React mounts the surface, renders snapshots and controls, and forwards
  commands; it does not directly manage GPU objects.
- The current SQLite table already has generic scene ID, version, parameters,
  and palette columns. Do not add a migration unless implementation evidence
  shows that schema is insufficient.
- A renderer may recreate scene-specific GPU resources during a scene switch,
  but it must not create duplicate animation loops, leak resources, or disturb
  playback.

## Proposed sequence

1. Add the Phase 2B scene-state, definition, registry, and preset contracts.
2. Generalize preset persistence and HTTP boundaries while preserving existing
   signal presets.
3. Introduce the visualization session and move the signal renderer behind it
   without changing observable signal-scene behavior.
4. Build and lifecycle-test the light-machine renderer.
5. Add scene selection, light-machine controls, direct interaction, reset, and
   bounded variation.
6. Prove playback-safe scene switching and scene-aware preset behavior.
7. Perform accessibility, responsive, lifecycle, visual, and real-audio
   verification.
8. Update affected design documents and write the implementation report.

The sequence may change when repository evidence justifies it, but scope may
not expand silently.

## Acceptance criteria

1. The internal registry exposes exactly `signal` and `light-machine`; unknown
   or duplicate IDs fail explicitly.
2. Existing oscilloscope/Lissajous behavior and presets remain functional.
3. The light-machine scene uses bounded feedback resources and visibly reacts
   to real playback analysis.
4. Feedback, symmetry, transform, palette, and modulation controls produce
   meaningful visible changes.
5. Pointer and keyboard input can shape the scene without making visual
   perception necessary for transport operation.
6. `Vary` changes only validated light-machine parameters; reset restores
   documented defaults.
7. Switching scenes while audio plays preserves the media element, Web Audio
   graph, transport status, selected track, time progression, and volume.
8. Scene switching, hidden-view suspension, device loss, and repeated disposal
   leave no duplicate frame loops or unreleased owned GPU resources.
9. Presets round-trip with scene ID, version, validated parameters, and any
   required palette data.
10. Loading either kind of preset selects the correct scene; malformed or
    unsupported presets fail clearly.
11. WebGPU-unavailable and renderer-failure states remain understandable and do
    not break playback.
12. Scene selection and controls have unambiguous names, visible focus,
    keyboard behavior, and non-color-only state.
13. Visual, Library, and Scene views remain usable without horizontal overflow
    at `1440 x 1000`, `1024 x 768`, and `390 x 844`.
14. `bun test --coverage`, `bun run typecheck`, `bun run check`,
    `bun run build`, and `git diff --check` pass.
15. Live verification covers real audio, both scenes, switching during
    playback, direct interaction, presets, responsive layout, console state,
    device and resource lifecycle, and reduced motion.
16. The implementation report maps every criterion to evidence and lists
    deferred work.

## Stop rules

Stop and request direction if Phase 2B would require:

- changing playback or media-source architecture;
- creating a public extension API;
- introducing Rust, WASM, or another process boundary;
- changing the card shell substantially;
- breaking existing signal presets;
- selecting between materially different unresolved product interactions;
- mutating user audio;
- introducing a new external service or project-managed browser runner.

## Implementation ownership and verification

- One implementation task owns all writes and may create tested logical local
  milestone commits.
- A separate read-only supervisor task monitors progress, sends only useful
  evidence-based interventions, and independently audits completion.
- Neither task may push, publish, open a pull request, or mutate GitHub without
  separate user authorization.
- The supervisor deletes its heartbeat after verified completion and does not
  remain active afterward.
