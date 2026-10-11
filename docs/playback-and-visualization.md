# Playback and Visualization

> Status: Living design document; Task 1 and Phase 2B are implemented and verified.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 16, 2026.

## Architectural position

Playback and visualization are independent products that the application composes.

Playback owns transport correctness. Visualization owns signal interpretation, scene lifecycle, rendering, and interaction. Neither subsystem owns catalog persistence or React presentation.

This follows the strongest boundary from the existing [KKB audio runtime architecture](/Users/kalynbeach/dev/kkb/kkb/docs/reports/2026-04-30-audio-runtime-adapter-architecture.md).

## Playback layers

```text
PlayerController
  -> resolves Track to Asset
  -> asks MediaResolver for a playable location
  -> sequences load/play/pause/seek
  -> owns queue and restore behavior

PlaybackRuntime
  -> owns HTMLMediaElement
  -> owns source and transport lifecycle
  -> publishes runtime snapshots
  -> exposes diagnostics and analysis capability

React adapter
  -> subscribes to controller/runtime
  -> forwards user commands
  -> owns no transport state machine
```

## Default transport

Use `HTMLMediaElement` for normal playback:

- loading;
- buffering;
- play and pause;
- seeking;
- duration and time updates;
- ended state;
- source errors;
- native codec support;
- eventual Media Session integration.

Do not revive the prior WavePlayer Worker/AudioWorklet/SharedArrayBuffer transport as the default. Its experiments remain useful for specialized processing, but the existing [WavePlayer deep-dive](/Users/kalynbeach/dev/apps/wave-player/docs/2026-04-24-current-state-deep-dive-review.md) shows the correctness cost of owning transport, decoding, buffering, sample-rate conversion, clocking, and seeking too early.

Task 1 guarantees WAV and MP3 through the complete path: discovery, MIME handling, Range responses, browser playback, fixtures, and live verification. Ableton Live Project directories and `.als` Live Set files may coexist with those exports, but they are metadata inputs for a later phase and must never enter the playback runtime as media assets.

## Playback contracts

### Runtime snapshot

A runtime snapshot should eventually expose:

- lifecycle status;
- source or location ID;
- current time and duration;
- buffered ranges;
- volume and rate;
- paused/playing/ended state;
- typed runtime error;
- capability and selected-source diagnostics;
- whether an analysis tap is available.

### Commands

At minimum:

- `load`;
- `play`;
- `pause`;
- `seek`;
- `setVolume`;
- `destroy`.

Command ordering and cancellation must be explicit. Important cases include:

- selecting another track while the first is loading;
- seeking during load;
- rapid next/previous commands;
- destroying while commands are pending;
- an autoplay rejection;
- a file disappearing after catalog import.

The HTML media runtime gives each `play` request ownership of its pending media
and Web Audio activation. A later `play`, `load`, `pause`, or `destroy` supersedes
that request. Its eventual success or failure cannot pause the current source,
change the current playback error, or reattach disposed analysis resources.
Superseded completions resolve without reporting an error to the caller. A
failure from the current request still rejects and publishes the playback error.

### Disposal

`destroy` should be idempotent. Media listeners, animation frames, Web Audio nodes, and object URLs must have clear owners and deterministic cleanup.

## Playback-to-visualization seam

Playback does not import visualization.

Preferred composition:

```text
PlaybackRuntime
  -> AnalysisTap
  -> SignalProvider
  -> VisualizationSession
```

The first browser implementation can connect the same-origin media element to Web Audio and an analyser graph. The signal provider adapts that graph into the visualization contract.

## Signal contract

A signal frame may contain:

- transport timestamp;
- left/right time-domain buffers;
- mono time-domain buffer when appropriate;
- frequency-domain bins;
- RMS and peak levels;
- sample rate and channel layout when known;
- later, spectral flux, onset, beat, or structure events.

Performance rules:

- reuse typed arrays;
- do not allocate unbounded objects per frame;
- distinguish audio timestamps from display timestamps;
- keep rendering work off transport event handlers;
- expose unavailable capabilities explicitly;
- permit non-playback sources such as microphone, oscillator, and generated test signals later.

## Visualization runtime

The visualization runtime owns:

- renderer creation and disposal;
- surface resize and pixel ratio;
- animation loop;
- signal buffer consumption;
- scene selection;
- parameter validation;
- input action dispatch;
- device-loss and renderer errors;
- diagnostics and performance measurements.

React should mount a surface, subscribe to a snapshot, and forward commands. It should not own GPU resources or the animation loop.

## Scene model

A `SceneDefinition` is code and should provide:

- stable scene ID;
- scene version;
- display metadata;
- parameter schema and defaults;
- initialization;
- resize;
- update and render behavior;
- deterministic disposal.

A `ScenePreset` is data and should provide:

- scene ID and compatible version;
- validated parameter values;
- palette/theme linkage;
- optional action mapping;
- user-facing name and metadata.

Use an internal scene registry first. Do not design a public plugin API before multiple built-in scenes prove the lifecycle.

## Scene order

### 1. Oscilloscope/Lissajous instrument

This is the first complete scene.

It should begin with:

- time-domain waveform mode;
- stereo X/Y Lissajous mode;
- persistence or decay;
- line intensity and thickness;
- scale and gain;
- palette integration;
- pointer or keyboard manipulation;
- saved presets.

First-scene acceptance criteria:

- visibly responds to the selected track;
- switches between waveform and X/Y modes;
- remains synchronized while seeking and changing tracks;
- exposes at least three meaningful performance controls;
- stores and restores a preset;
- resizes without recreating unrelated playback state;
- cleans up animation and GPU resources;
- remains smooth on the primary macOS development machine.

### 2. VLM-style feedback/light synthesizer

Phase 2B implemented this scene as the built-in `light-machine` on July 16,
2026. It uses an internal two-scene registry and a browser visualization
session that serializes renderer ownership for one shared canvas without
changing playback ownership.

Implemented ingredients:

- two capped ping-pong feedback textures with bounded decay;
- polar symmetry and mirroring at 2, 4, 6, or 8 folds;
- rotation, zoom, palette selection, and color cycling;
- modulation from existing frequency bins, RMS, and peak data;
- pointer and keyboard performance input;
- scene-aware presets, deterministic reset, and bounded variation;
- explicit failure states, device-loss handling, and deterministic cleanup.

The result is original rather than a copy of a historical visual style. See
the [Phase 2B implementation report](phase-2b-implementation-report.md).

### 3. Cymatics-inspired nodal field

This should follow the light-synthesizer scene.

Start with analytically tractable rectangular-plate modes and clearly label artistic mappings versus physically motivated calculations.

Potential later forms:

- Chladni nodal lines;
- particles accumulating around nodes;
- frequency and geometry controls;
- multiple mode interference;
- offline analysis-informed scene setup;
- Rust/WASM field calculation.

Reference: [ChladniSonify](https://arxiv.org/abs/2605.09846)

## Rendering choice

Use TypeScript, WebGPU, and WGSL for the first scene, informed by the existing KKB WebGPU oscilloscope work.

Reasons:

- it keeps the first technical focus on TypeScript 7 and Bun;
- renderer lifecycle remains easy to compose with the React client;
- Rust can enter through algorithms rather than taking over every browser concern;
- WGSL shaders can later inform native `wgpu` experiments.

A Canvas2D fallback is not required for the first macOS-focused vertical slice. Capability detection and a clear unsupported state are required.

## Interaction model

Scenes should consume semantic actions rather than raw input codes.

Examples:

- increase/decrease intensity;
- change mode;
- rotate or offset field;
- change symmetry;
- freeze/hold;
- randomize within safe bounds;
- reset preset.

Initial keyboard and pointer mappings can later be extended to MIDI, gamepad, OSC, or Ableton control without changing scene internals.

## Theme interaction

Application themes and scenes are related but distinct:

- themes own semantic UI tokens and default palette hints;
- scenes own rendering parameters;
- presets may reference a theme or capture a palette;
- changing theme should not silently replace scene code or destroy a preset.

## Rust/WASM entry

After the TypeScript vertical slice works, add a pure `wave-core` Rust crate.

Recommended responsibilities:

- waveform envelopes;
- RMS, peak, and spectral calculations;
- onset candidates;
- deterministic feature mapping;
- Chladni mode and nodal-field calculation.

Compile it for:

- a native `wave-tools` CLI;
- a browser Worker through WASM;
- a future GPUI/native client.

Keep calls across the WASM boundary coarse. Pass blocks or complete analysis requests, not individual samples.

Do not initially place WASM in an AudioWorklet. Start in a Worker or offline analysis path where scheduling and failure handling are simpler.

## Verification requirements

Playback and visualization require verification in the Codex in-app Browser in addition to `bun test`:

- actual media load and Range requests;
- play, pause, seek, next, previous, and ended behavior;
- user-gesture/autoplay handling;
- track changes during active rendering;
- Web Audio analysis from the same-origin media route;
- WebGPU initialization and resize;
- disposal and remount;
- visual inspection at desktop and narrow layouts;
- no console errors or leaked loops after navigation.

Use Computer Use only when a check crosses into browser chrome, a macOS dialog, Finder, media keys, or another native surface the Browser plugin cannot inspect adequately. Task 1 should not install or manage `@playwright/test`, a Playwright configuration, or another project-level browser runner; any Playwright-shaped automation exposed internally by the Browser plugin remains a Codex capability rather than a repository dependency.

## Deferred capabilities

- custom codecs and transport;
- crossfade and gapless playback;
- AudioWorklet DSP;
- microphone and live-input scenes;
- public scene plugins;
- MIDI/OSC/gamepad control;
- WebGPU fallback renderer;
- video export or recording;
- scientific general-purpose plate simulation.
