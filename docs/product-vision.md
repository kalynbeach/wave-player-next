# Product Vision

> Status: Living design document; Task 1 implementation is underway.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Vision

Wave Player Next is a personal audiovisual music system for listening to, organizing, studying, and visually performing original music.

It should feel less like a generic streaming-service client and more like a deliberately authored creative instrument: reliable enough for everyday listening, expressive enough to invite experimentation, and structured well enough to grow into a flagship open-source project.

## Motivation

The project is not primarily a response to a market gap. It exists because building personal and creative software is itself a goal.

A concrete daily need anchors that creative goal: listening back to original music and Ableton exports without relying on Apple Music or Spotify. The application should make those recordings feel like a first-class personal library rather than incidental files uploaded into somebody else's ecosystem.

## Influences

### Winamp

Winamp demonstrates that a music player can carry a strong identity, support themes, and make visualization part of the culture of the application rather than a peripheral diagnostic.

### Virtual Light Machine

The Virtual Light Machine is important because it behaves as a light synthesizer, not merely a screensaver. Its interactive mode lets the listener manipulate visual generation while music plays. Wave Player Next should adopt that instrument-like relationship between audio, rendering, presets, and user input.

Reference: [Virtual Light Machine](https://en.wikipedia.org/wiki/Virtual_Light_Machine)

### Oscilloscopes and Lissajous figures

Oscilloscope and Lissajous rendering connect the visible form directly to waveform and stereo relationships. This is the first visual direction because it is technically grounded, already related to KKB work, and can become expressive through persistence, trails, symmetry, color, and interaction.

### Cymatics

Cymatics motivates a later family of scenes based on standing waves, eigenmodes, nodal fields, particles, material geometry, and frequency-driven physical behavior. The project should distinguish physically motivated simulation from merely cymatics-inspired aesthetics.

### Trading card structure

Trading Card Game cards provide the primary structural reference for the initial player interface. A single bounded artifact creates a clear hierarchy: identity above, an artwork-like visual field in the center, and persistent information or action regions below.

Wave Player Next should borrow that hierarchy without imitating Pokémon, Yu-Gi-Oh!, Magic: The Gathering, or another game's style. The result should remain a precise personal music instrument rather than a collectible-card simulation.

## Product pillars

### Personal library

The user can index and browse original tracks, mixes, masters, stems, references, and Ableton exports without copying them into a third-party service.

### Dependable player

Playback, seeking, next/previous behavior, state restoration, file compatibility reporting, and error handling must be trustworthy before specialized playback technology is introduced.

### Visual instrument

Visual scenes are interactive, parameterized, theme-aware, and capable of being saved as presets. They react to audio but also respond to deliberate performance input.

### Audio analysis workshop

The system can grow into waveform, loudness, spectral, onset, structure, and cymatics analysis without making every analysis capability part of the first release.

### Authored identity

Themes, typography, motion, layout, and visual scenes should make the software feel personal and recognizable. The visual language should be precise and instrument-like rather than imitating current streaming products. The first release centers the experience in one portrait player card whose internal views reveal the library and scene controls without displacing playback.

### Open-source craft

The repository should be understandable, tested, documented, and pleasant for outside contributors. It may be open from the beginning without promising stable public APIs before real usage proves them.

### Learning platform

Technology exploration has an explicit order:

1. TypeScript 7 and deeper Bun APIs
2. Rust compiled to WebAssembly
3. native Rust and GPUI
4. Native SDK and Zig

Each technology must enter through a product-relevant boundary rather than as an unrelated demo.

## Primary user

The first user is Kalyn: a musician and software developer using macOS, Ableton Live, Bun, TypeScript, and agent-assisted development.

The first release can be opinionated around this workflow. Broader open-source usability should come through well-defined boundaries and documented assumptions, not by generalizing everything before the application is personally useful.

## Product principles

1. Personal usefulness comes before platform breadth.
2. Reliable transport comes before custom decoding.
3. Interactive scenes are a core creative surface, not an afterthought.
4. Local files remain usable without a cloud account.
5. Device-local locations and portable music identity remain distinct.
6. Works, listenable versions, encodings, and storage locations are not the same entity.
7. Themes and scene presets are data; scene implementations are code.
8. Playback does not depend on visualization, and visualization does not reach into player internals.
9. Stable modules precede packages.
10. New technology must justify its place through a concrete product capability.
11. Tests should exercise real inexpensive boundaries before mocks.
12. Later backends should be possible without pretending the first release already supports synchronization.
13. The player card is a stable interaction shell, not a decorative wrapper or a grid of generic cards.
14. Motion explains view and playback state; it does not delay frequent transport actions.

## Long-term success

The flagship succeeds if it becomes:

- the default way the user listens back to original music and Ableton exports;
- a credible open-source player and library project rather than a collection of demos;
- a home for distinctive interactive visual scenes;
- a practical bridge between TypeScript, Bun, Rust, WASM, and native UI work;
- a source of stable modules that can later be adopted by KKB;
- a project whose internal structure supports experimentation without sacrificing playback correctness.

## Explicit non-goals for the first release

- replacing Spotify or Apple Music catalogs;
- streaming-service parity;
- collaborative multi-user music management;
- a public plugin marketplace;
- a generalized DAW;
- a custom codec or audio transport engine;
- automatic cloud upload;
- bidirectional local/cloud synchronization;
- every desired visual scene at initial launch;
- a native desktop shell.

## Creative promise

The smallest version should already express the project's identity: choose personal music, play it reliably inside the portrait player card, see it through a controllable oscilloscope/Lissajous instrument, experience a deliberate initial theme, save the visual state, close the application, and return to the same library later.
