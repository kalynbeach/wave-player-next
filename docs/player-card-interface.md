# Player Card Interface

> Status: Living design document; Task 1 is implemented and verified.
>
> Planning source: Codex task `019f5f0f-9558-7ce0-b667-92d79994d3fd`, discussed July 13-15, 2026.
>
> Last updated: July 15, 2026.

## Design thesis

The primary interface is one bounded player artifact organized like a trading card. The inspiration is structural rather than stylistic: Pokémon, Yu-Gi-Oh!, Magic: The Gathering, and similar cards establish a durable outer frame containing a hierarchy of identity, artwork, rules or detail, and actions.

Wave Player Next should translate that hierarchy into:

- persistent track identity at the top;
- an artwork-like central viewport dominated by the active visualization;
- persistent transport at the bottom;
- alternate internal views for the library and visualization controls;
- a restrained surrounding page that keeps the player card as the clear focal object.

This is not a conventional dashboard with a sidebar around a media player. The card is the application shell for the first useful release.

## Prototype reference

The initial idea is visible in the existing WavePlayer prototype:

- screenshot: `/Users/kalynbeach/Desktop/Screenshot 2026-07-15 at 11.04.56 AM.png`;
- [player component](/Users/kalynbeach/dev/apps/wave-player/components/wave-player.tsx);
- [track information](/Users/kalynbeach/dev/apps/wave-player/components/wave-player-track-info.tsx);
- [visual section](/Users/kalynbeach/dev/apps/wave-player/components/wave-player-track-visual.tsx);
- [transport controls](/Users/kalynbeach/dev/apps/wave-player/components/wave-player-track-controls.tsx);
- [page composition](/Users/kalynbeach/dev/apps/wave-player/app/page.tsx).

The prototype already establishes a useful `5 / 7` portrait proportion and the correct high-level order: information, art/visual, controls.

## Prototype interpretation

| Prototype | Wave Player Next | Why |
|---|---|---|
| Track list is a detached card below the player. | Library browsing becomes an alternate view inside the main card viewport. | The listening artifact remains the single focus, and the interface does not become a dashboard of unrelated panels. |
| Header, visual, footer, and outer shell each draw a border. | One outer frame owns elevation; internal zones use spacing and separators. | This preserves the card hierarchy without stacked borders or nested-card noise. |
| The visual section is a large placeholder. | The visual viewport is the primary interactive scene surface. | The most visually important area should represent the product's defining capability. |
| Transport controls read as an isolated generic footer. | Transport is a persistent, card-native control zone shared by every internal view. | Playback remains reachable while browsing tracks or changing scene parameters. |
| Page title, player, track list, and theme control are separate page regions. | Product utilities move into the card or a compact adjacent utility control. | The surrounding page stops competing with the player object. |

The prototype should be revived as a structural reference, not copied component-for-component. Its custom transport architecture and Radix-era component assumptions do not carry forward.

## Card anatomy

```text
┌─ PlayerCard ──────────────────────────────────────┐
│ TrackHeader                                       │
│ title · artist · optional work/version · status   │
│ ViewSelector: Visual · Library · Scene            │
├───────────────────────────────────────────────────┤
│                                                   │
│ CardViewport                                      │
│                                                   │
│ Visual: oscilloscope / Lissajous instrument       │
│ Library: scan state and selectable track list     │
│ Scene: mode, parameters, and saved preset         │
│                                                   │
├───────────────────────────────────────────────────┤
│ PersistentTransport                               │
│ elapsed · seek · duration                         │
│ previous · play/pause · next · volume             │
└───────────────────────────────────────────────────┘
```

The outer component may use shadcn's `Card` composition. The internal zones are semantic `header`, `section`, and `footer` regions rather than nested `Card` components.

## Persistent regions

### Outer frame

The frame provides:

- a single visual boundary;
- the responsive portrait geometry;
- semantic theme tokens;
- view and playback state attributes useful for styling and verification;
- overflow containment for the scene without clipping Base UI overlays, which must remain portaled.

It must not become an ornate imitation of a collectible card. Borders, foil treatments, rarity badges, fantasy ornament, and card-game typography are not part of the initial direction.

### Track header

The header keeps listening context stable while the viewport changes.

Task 1 content:

- title;
- artist when available;
- optional record, folder, or version context when available;
- playback or availability state when it needs user attention;
- the internal view selector.

Long titles must truncate or wrap within a deliberate maximum. Metadata should not cause the transport or viewport to move unexpectedly.

### Persistent transport

Transport remains mounted in every card view and owns:

- elapsed and duration display;
- seek control;
- previous, play/pause, and next;
- volume access and persisted value;
- loading, buffering, unavailable, and ended feedback.

Changing card views must never reset playback, selection, position, volume, the media element, or the player controller.

## Card viewport

The central viewport is a stable slot with three Task 1 views.

### `visual`

The default view contains the oscilloscope/Lissajous scene and minimal scene identity. The canvas should occupy the visual field instead of being surrounded by control chrome.

Direct scene interaction belongs here when it is meaningful. Configuration-heavy controls belong in the scene view.

### `library`

The library view contains:

- the configured root and scan status;
- manual scan or rescan;
- loading, empty, unsupported, and failure states;
- a scrollable flat track list;
- current selection and playback state;
- track selection.

Playlist management, collections, Ableton Work grouping, and advanced search remain later phases. The first library view should be deliberately small but genuinely useful.

### `scene`

The scene view contains:

- oscilloscope/Lissajous mode selection;
- at least three meaningful parameters;
- parameter reset;
- preset name, save, and restore behavior;
- capability or renderer errors when applicable.

Use Base UI-backed shadcn controls. The visualizer canvas remains a specialized custom surface.

## First-run and exceptional states

Before a library root exists, the viewport becomes a first-run configuration view while the outer frame, product identity, and disabled transport remain understandable.

The initial root flow accepts an absolute directory path, validates it through the Bun host, and persists the canonical root. The UI must explain that files are indexed in place and will not be copied, renamed, or modified.

Other exceptional states stay inside the viewport when they replace its content:

- no supported audio found;
- scan partially failed;
- selected file disappeared;
- browser cannot play the selected asset;
- Web Audio or WebGPU initialization failed.

Use `Empty`, `Alert`, `Skeleton`, and other appropriate shadcn components instead of inventing one-off panels.

## View state and lifecycle

The active card view is presentation state, separate from playback and visualization state.

```text
CardView = visual | library | scene
```

Rules:

- view changes do not issue playback commands;
- the media element and player controller stay mounted;
- hiding the visual view may suspend animation-frame rendering to save resources, but it must not destroy the visualization session or audio analysis graph;
- returning to the visual view resumes from current playback and scene parameters;
- the active view may persist locally, but restoring it must not block playback restoration;
- narrow and wide layouts expose the same view model rather than different product behavior.

## View selection

Use a clearly labeled Base UI-backed `Tabs` or single-select `ToggleGroup`, selected after inspecting the generated component APIs. It should live in or immediately below the track header.

Requirements:

- selected state is programmatically exposed;
- labels remain understandable without icons;
- keyboard navigation follows the chosen component's conventions;
- switching views is quick enough for repeated use;
- view selection is not conflated with scene mode selection.

Do not use a full three-dimensional card flip for routine navigation. A flip is slower, obscures spatial continuity, complicates reduced-motion behavior, and makes frequent library access feel theatrical.

## Responsive behavior

The card metaphor is structural, not a requirement to preserve a rigid pixel size.

### Comfortable desktop

- center one portrait card in a restrained application canvas;
- preserve an approximate `5 / 7` outer proportion when the viewport allows it;
- size the card from available height as well as width so transport remains visible without page scrolling;
- give the visual viewport enough area for the oscilloscope to feel like an instrument rather than a thumbnail.

### Short or medium viewport

- compress outer spacing before compressing controls;
- allow the central viewport to lose height while retaining header and transport usability;
- scroll only the active internal view that needs it, primarily the library or scene controls;
- never scale the entire interface like an image, because that makes text and targets unusably small.

### Narrow viewport

- let the card approach the viewport edges with a small safe gutter;
- retain the same header, viewport, and transport order;
- keep the visualizer prominent;
- use internal scrolling for library and scene views;
- preserve minimum touch targets and readable time labels;
- avoid adding a separate sidebar or permanent inspector.

The initial verification sizes are `1440 × 1000`, `1024 × 768`, and `390 × 844`.

## Visual language

The TCG reference must not dictate a particular fantasy, anime, or collectible aesthetic. The initial preset provides a precise monochrome, no-radius foundation that suits an instrument-like player.

Use one Wave-specific semantic layer from the beginning:

- `--player-frame` and `--player-frame-foreground`;
- `--player-section` and `--player-section-foreground`;
- `--visualizer-background`;
- `--signal-primary` and `--signal-secondary`;
- `--meter-active`;
- `--transport-active`.

Define these in the shadcn-configured global Tailwind CSS file using OKLCH. Keep ordinary component states on shadcn tokens. Scene palettes remain separate data, although a theme may intentionally map UI and scene roles together.

Use one initial theme. A runtime theme system belongs after the card, scene, and token seams are proven.

## Motion language

Motion should explain state and preserve continuity, not advertise that the interface is animated.

| Interaction | Initial behavior | Constraint |
|---|---|---|
| Card view change | Short crossfade or clipped directional reveal, approximately `150-220ms` | Exit faster than enter; no full flip; reduced motion uses a simple fade or instant swap. |
| Track change | Update identity and scene after the next source is ready, with a restrained crossfade | Do not conceal loading or reset transport state. |
| Transport press | Immediate active feedback around `100-160ms` | Keyboard-initiated transport is not delayed or choreographed. |
| Base UI overlay | Use the generated origin-aware transition and Base UI transform origin | Do not add decorative bounce or arbitrary z-index. |
| Continuous scene | Frame-driven by playback signal and scene parameters | UI motion settings must not alter the audio-derived visualization unless the scene explicitly defines that behavior. |

Prefer CSS transitions for predetermined, frequently interrupted UI changes. Use a spring only for a future gesture whose interruption and velocity make a physical model useful.

Every motion path must respect `prefers-reduced-motion`. Hover motion must be limited to devices with hover and fine pointer support.

During implementation:

- describe coordinated motion with Interface Craft storyboard constants before writing it;
- use DialKit only as a development tuning aid when several visual or motion values genuinely need live comparison;
- remove or isolate development tuning controls from production output;
- inspect transitions in slow motion and at normal speed;
- review animation work again after the rest of the feature is stable.

## Accessibility

- The card is an application region with a useful accessible name, not a semantic list of nested cards.
- The view selector exposes selected state and keyboard navigation.
- Every icon-only transport action has an unambiguous accessible name.
- The seek and volume sliders expose name, range, current value, and keyboard behavior.
- The canvas exposes a concise label and textual renderer/status alternative.
- Library rows distinguish selected, playing, unavailable, and unsupported states without relying on color alone.
- Focus remains visible in every view and theme.
- View transitions preserve or deliberately move focus; they never strand focus inside hidden content.
- Reduced motion preserves comprehension without spatial movement.

## Agent-assisted design workflow

The implementation task must use the user's installed design skills deliberately:

1. Use Impeccable to capture `PRODUCT.md` and `DESIGN.md` in the new repository from this packet, then shape and audit the player surface.
2. Use shadcn guidance before initialization and before composing each unfamiliar Base UI-backed component.
3. Use Interface Craft for screenshot critique, readable animation storyboards, and optional DialKit tuning.
4. Use Emil Kowalski's design-engineering guidance to review easing, timing, transform origins, press feedback, interruption, and perceived performance.
5. Use the Codex in-app Browser for iterative localhost inspection and responsive verification.
6. Use Computer Use for native macOS or browser-chrome interactions that are not adequately exposed through the browser DOM or its visual controls.

The skills guide design judgment; they do not authorize scope additions.

## Codex-native verification

Task 1 should not install or manage a project-level Playwright runner by default.

The implementation agent should use:

- `bun test` for core, application, SQLite, filesystem, Bun host, and component behavior;
- the Codex in-app Browser as the primary live localhost verification surface;
- Browser DOM inspection for semantics, state, geometry, overflow, focus, media state, and console errors;
- Browser screenshots at the target sizes for visual review;
- Browser visual or coordinate interaction for the canvas where DOM semantics do not apply;
- Computer Use when verification crosses into native browser chrome, macOS dialogs, Finder, or other desktop UI.

The Browser plugin's internal automation APIs are acceptable. They do not require adding `@playwright/test` or Playwright configuration to the repository.

Record verification evidence in the implementation report: route, viewport, interaction, observed state, console status, and any screenshot paths.

## Explicit non-goals for Task 1

- literal collectible-card ornament or game mechanics;
- multiple player cards in a grid;
- rarity, packs, achievements, or gamification;
- a permanent sidebar or inspector around the card;
- playlist and collection management;
- Ableton Work grouping UI;
- full-card 3D flips;
- decorative mouse-tracking tilt;
- multiple user-selectable themes;
- a project-managed Playwright suite.

These are not rejected forever. They are excluded until the primary card interaction proves useful in real listening.

## Non-blocking implementation decisions

The exact card width, type scale, colors, separators, and final transition curves should be tuned against the running interface. They do not block the implementation goal as long as the structural model, accessibility requirements, preset, semantic tokens, and verification targets remain intact.
