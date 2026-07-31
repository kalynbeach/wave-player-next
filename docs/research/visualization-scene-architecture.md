# Visualization scene architecture

> Research ticket: [Understand visualization scene architecture](https://github.com/kalynbeach/wave-player-next/issues/5)
>
> Scope: the internal browser visualization scene architecture. This brief does not design public plugins, schema-driven controls, or deferred input/rendering systems.

## Answer in brief

Wave Player Next already has the correct large-scale boundary: pure scene identity and serializable state in `core`, browser-free session interfaces in `app`, browser renderer adapters and their lifecycle in `client/visualization`, and thin React subscriptions and input adapters. The next architecture should preserve those boundaries while increasing **locality**: each built-in scene should be assembled as one internal scene **module** that supplies its core definition, renderer factory, and optional runtime behaviors such as variation and semantic-action reduction to the visualization registry. The session should orchestrate the selected module and own the one-active-renderer invariant; it should not accumulate scene-ID branches.

Scene ID and scene version remain core-owned persisted identity. Version means compatibility of persisted scene state/presets, not renderer implementation version. Each scene's core module remains the semantic authority for parameter types, parameter validation, defaults, and pure variation, while the current HTTP DTO layer duplicates IDs, options, versions, and numeric bounds and therefore needs an explicit parity strategy. Renderer selection remains in the client adapter registry because it depends on canvas and GPU capabilities. Raw keyboard/pointer events remain in React. The target input adapter should translate them into normalized semantic actions before they reach a scene module; the current `shape` action still carries raw CSS-pixel deltas and is only partially normalized.

This is an internal modular-monolith pattern, not a plugin SDK. It adds **depth** to the existing registry seam with little mechanism: one module registration should carry enough behavior that a third scene does not require changes to the browser session. Explicit scene-specific React controls may remain explicit until a third real scene provides evidence for a separate UI-module seam.

## Evidence labels

- **Source-backed fact** reports behavior visible in repository code or an external primary source.
- **Implementation practice** is a recurring technique in a mature renderer or framework.
- **Architectural judgment** is the recommendation for Wave Player Next; it is not claimed as a rule imposed by a source.

## Subsystem mechanics

### Current execution path

**Source-backed fact.** The documented runtime path is playback runtime → analysis tap → signal provider → visualization session → scene renderer → WebGPU canvas. Playback and visualization are intentionally independent; visualization consumes a `SignalProvider`, not player internals. The visualization runtime owns renderer creation/disposal, resize, animation, signal consumption, scene selection, validation, input dispatch, device-loss/errors, and diagnostics, while React mounts a surface, subscribes to snapshots, and forwards commands. [Architecture](https://github.com/kalynbeach/wave-player-next/blob/main/docs/architecture.md) [Playback and visualization](https://github.com/kalynbeach/wave-player-next/blob/main/docs/playback-and-visualization.md)

The implemented call chain is:

1. `SceneVisualizer` attaches one canvas to `BrowserVisualizationSession`, subscribes with `useSyncExternalStore`, maps pointer/keyboard events to `VisualizationPerformanceAction`, and displays session status. [Scene visualizer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/app/scene-visualizer.tsx)
2. `BrowserVisualizationSession` owns the active scene snapshot, retained state for each scene, surface attachment, active/inactive state, renderer replacement, async generation checks, error publication, and disposal. [Browser visualization session](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/browser-visualization-session.ts)
3. `VisualizationSceneRegistry` validates state through the registered core definition and delegates creation to the matching browser renderer factory. [Visualization scene registry](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/visualization-scene-registry.ts)
4. The built-in composition maps `signal` and `light-machine` definitions to their WebGPU renderer adapters. [Built-in visualization scenes](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/built-in-visualization-scenes.ts)
5. Each WebGPU renderer owns its GPU device/context/resources, resize observer, animation frame, signal reads, status reporting, device-loss handling, and deterministic release. [Signal renderer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/webgpu-signal-renderer.ts) [Light-machine renderer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/webgpu-light-machine-renderer.ts)

**Source-backed fact.** The session serializes renderer factories for the shared canvas and uses a generation token to dispose stale async results and ignore stale statuses/failures. Tests cover retained per-scene state, stale renderer disposal, shared-canvas ordering, factory rejection, activation failure, hidden-view activation, and idempotent session disposal. [Session tests](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/browser-visualization-session.test.ts)

**Implementation practice.** deck.gl similarly treats stable identity and lifecycle as separate concerns: layers are matched by `id`, persistent state is retained across matched render cycles, and explicit initialization/update/draw/finalization stages own resource setup and teardown. This supports the current Wave decision to put lifetime orchestration in a session rather than in React rendering. [deck.gl layer lifecycle](https://deck.gl/docs/developer-guide/custom-layers/layer-lifecycle) [deck.gl Layer source](https://github.com/visgl/deck.gl/blob/master/modules/core/src/lib/layer.ts)

**Implementation practice.** React documents `useSyncExternalStore` as the seam for subscribing to a non-React store and requires cached immutable snapshots plus cleanup-returning subscriptions. The Wave session publishes replacement snapshots and React only subscribes/renders them, which is the intended shape. [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)

### GPU lifetime and capability mechanics

**Source-backed fact.** Each current renderer asynchronously requests a high-performance adapter and device, reports explicit unsupported/error states, configures the existing canvas, schedules/cancels its own animation frame, observes resize, and releases resources after initialization failure, device loss, or disposal. A runtime resize/frame failure stops scheduling and retains resources until later disposal. The light-machine bounds feedback textures to 2,048 pixels per dimension. [Signal renderer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/webgpu-signal-renderer.ts) [Light-machine renderer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/webgpu-light-machine-renderer.ts)

**Source-backed fact.** `GPUDevice.lost` can resolve at any time, all resources from the lost device must be recreated, and transient losses may justify acquiring another device. That supports keeping device loss inside the renderer/runtime adapter and exposing only a typed status across the interface. [MDN `GPUDevice.lost`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost) [WebGPU specification, device loss](https://gpuweb.github.io/gpuweb/#dom-gpudevice-lost)

**Implementation practice.** regl accepts an existing canvas or graphics context, owns explicit per-frame callbacks, and exposes explicit destruction for resources and the runtime. PixiJS similarly performs asynchronous renderer selection/setup at its application boundary and treats WebGL/WebGPU preference as an application option. Both place renderer/capability choice near the rendering adapter rather than in serializable scene data. [regl API](https://github.com/regl-project/regl/blob/master/API.md) [PixiJS Application](https://pixijs.com/8.x/guides/components/application)

## Current Wave Player Next design

### Core scene model

**Source-backed fact.** `signal` and `light-machine` each define a stable literal ID, version `1`, parameter/state/preset types, deterministic defaults, strict parameter parsing, and state parsing that requires exact ID/version equality. Parameter parsers reject unknown fields and out-of-range/non-finite values; current state and preset parsers accept and strip unknown top-level fields. The light-machine module additionally owns a deterministic-injectable, bounded variation function whose result is parsed again. [Signal scene](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/signal-scene.ts) [Light-machine scene](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/light-machine-scene.ts)

`SceneRegistry` then provides:

- closed `SceneId`, `SceneState`, and `ScenePreset` unions;
- display metadata;
- default creation and parsing dispatch;
- duplicate-ID rejection and immutable registration order;
- preset parsing through scene state validation.

[Core scene registry](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/scene-registry.ts)

**Source-backed fact.** Presets persist `scene_id`, `scene_version`, and JSON parameters. Reads and writes re-enter core parsing, so the database adapter does not become a second semantic validator. [SQLite scene preset repository](https://github.com/kalynbeach/wave-player-next/blob/main/src/server/database/sqlite-scene-preset-repository.ts)

**Source-backed fact.** The HTTP boundary is a second structural validator: `src/shared/api.ts` duplicates scene IDs, versions, enum options, and numeric bounds in strict Zod schemas. This protects an untrusted transport boundary but creates real drift and locality cost; a third built-in scene currently changes this DTO seam too. [Shared API schemas](https://github.com/kalynbeach/wave-player-next/blob/main/src/shared/api.ts)

### Application and client interfaces

**Source-backed fact.** `VisualizationSession` exposes snapshot/subscription plus scene selection, state/preset loading, reset, variation, semantic action dispatch, activation, and disposal. `VisualizationRenderer` is deliberately narrow: `setActive`, `setState`, and `dispose`. These are browser-free interfaces in `app`. [Visualization session interfaces](https://github.com/kalynbeach/wave-player-next/blob/main/src/app/visualization/visualization-session.ts)

**Source-backed fact.** `VisualizationSceneDefinition` currently pairs a core `SceneDefinition` with an async `createRenderer` factory. This is a useful adapter seam, but `vary()` and semantic-action interpretation are not part of it; the browser session switches directly on `LIGHT_MACHINE_SCENE_ID` and `SIGNAL_SCENE_ID`. [Visualization scene registry](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/visualization-scene-registry.ts) [Browser visualization session](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/browser-visualization-session.ts)

**Source-backed fact.** React control and display code also branches on the two literal IDs. Parameter bounds are repeated between core parsers and sliders. Scene controls are explicit, typed components rather than schema-generated UI. [Scene controls](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/app/scene-controls.tsx) [Scene visualizer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/app/scene-visualizer.tsx)

### What is already strong

**Architectural judgment.** Preserve these decisions:

- `core` owns pure persisted meaning; no DOM, WebGPU, or React imports.
- `app` defines narrow session/renderer interfaces and no concrete browser mechanics.
- `client/visualization` adapts core state and signal input to WebGPU.
- the session, not React, owns renderer lifetime and mutable runtime resources.
- one active renderer owns the shared canvas at a time.
- presets carry intent (ID/version/parameters), never raw GPU/runtime internals.
- untrusted persistence boundaries parse through the same core scene parser.
- renderers are explicit about unsupported/error states and deterministic disposal.

These modules already have useful **depth**: a small renderer interface hides canvas configuration, frame loops, GPU allocation, resize, signal mapping, and device-loss cleanup.

## Ownership decisions

| Concern | Recommended owner | Reason |
|---|---|---|
| stable scene ID | scene's `core/scene` module | persisted product identity; infrastructure-independent |
| scene version | scene's `core/scene` module | compatibility of serialized state/presets |
| parameter meaning and authoritative validation | scene's `core/scene` module | one semantic authority used by UI, session, persistence, and transport contracts |
| HTTP DTO validation | `src/shared/api.ts`, kept in parity with core | untrusted transport validation currently duplicates structural constraints; drift must be tested or reduced without leaking Zod into core |
| deterministic defaults | scene's `core/scene` module | defaults are product meaning and must round-trip through validation |
| pure variation algorithm | scene's `core/scene` module | deterministic, renderer-independent transformation of valid state |
| whether variation is available and how session invokes it | internal client scene module/registry entry | runtime capability dispatch should not branch in the session |
| semantic action interpretation | internal client scene module, delegating to pure scene functions where useful | keeps the app action interface browser-free while localizing scene-specific behavior |
| raw pointer/key mapping | React adapter | raw DOM codes and coordinates are presentation/input mechanics |
| renderer factory/selection | `client/visualization` scene module | canvas, WebGPU support, and backend policy are infrastructure concerns |
| renderer/GPU resource lifetime | active renderer, coordinated by session | locality of allocation/cleanup; session enforces one owner and stale-work cancellation |
| scene selection and retained per-scene state | visualization session | use-case/runtime orchestration independent of React |
| control layout/copy | explicit React scene-control components | presentation concern; no evidence yet for a schema framework |
| preset persistence | application port + server adapter, validated by core | storage mechanism stays outside scene meaning |

### Identity and version semantics

**Architectural judgment.** A scene ID is durable persisted identity, not a class name or renderer name. Renaming a source file, replacing WGSL, or changing WebGPU resource strategy must not change it. A scene version is the compatibility version of parameter/state semantics. Increment it only when an existing preset cannot be interpreted with the same meaning after validation/default migration; do not increment it for visual tuning or renderer refactors that preserve the contract.

The current exact-version rejection is safe for versions that exist today. Do not add a migration framework preemptively. When the first real version change is proposed, decide explicitly whether v1 remains supported, can be locally migrated, or must fail with a precise message; then test that actual path.

### Validation and defaults

**Architectural judgment.** Keep strict parameter shape and finite/range checks. Decide explicitly whether unknown top-level state/preset fields remain forward-compatible and stripped or become strict; do not claim current strictness there. Every state mutation path should end at the scene parser before publication to the renderer. Defaults should be fresh values and should themselves pass the parser. Exporting selected named bounds/options for explicit controls is reasonable to reduce drift, but generating controls from a schema would widen scope and weaken the current explicit UI locality.

### Variation

**Architectural judgment.** Variation is optional scene behavior, not a method every scene must fake. The light-machine owns the algorithm and bounds in core; the registered internal scene module should advertise a `vary` operation that the session delegates to. The session should report capability absence in a stable way (or React should hide the command based on registered capability), rather than know that only `light-machine` varies.

### Semantic actions

**Architectural judgment.** Make the target action seam semantic and normalized; do not pass DOM `KeyboardEvent`, key codes, pointer IDs, canvas elements, or presentation-unit deltas into a scene. `nudge` and `cycle-palette` are semantic today, but `shape` carries raw CSS-pixel pointer deltas and the session applies scene-specific divisors/multipliers. Normalize pointer movement at the React/input adapter into a documented unit before moving interpretation behind the active scene module. This preserves future input leverage—another adapter can issue the same actions—without designing MIDI/OSC/gamepad now.

Avoid pretending all scenes have identical actions. A small shared action union may contain broadly meaningful performance intent, while a module may ignore unsupported actions. If a third real scene demonstrates that names such as `shape` are too vague, revise the action vocabulary from observed use; do not build a general command bus now.

### Renderer selection

**Architectural judgment.** Core definitions must never select `WebGpuSignalRenderer` or know backend capabilities. The client registry entry is the adapter from scene state to a renderer. The session asks the active module to create a renderer and only understands the narrow `VisualizationRenderer` interface. If a real fallback backend is later added, capability/preference selection belongs inside that client factory or a client renderer-selector adapter, not in `ScenePreset`.

## Viable module and registry patterns

### Pattern A: current paired registries

Core definitions live in one registry; client entries pair each definition with a renderer factory.

- **Benefits:** simple, explicit, closed-world typing, no dynamic loading, already tested.
- **Costs:** a new scene touches central unions, core registry, client registry, session switches, controls, and visualizer copy. Two registries can drift. `SceneDefinition` methods return broad unions, so the type relationship between a particular definition and its state is partially erased.
- **Use:** acceptable at two scenes, but insufficient locality for the next one.

### Pattern B: one internal scene module per built-in scene — recommended

An internal client scene module composes an existing pure core definition with renderer factory and optional runtime behaviors. Conceptually, not as a prescribed public API:

```ts
type VisualizationSceneModule = {
  scene: SceneDefinition;
  createRenderer(options: VisualizationRendererCreateOptions): Promise<VisualizationRenderer | null>;
  reduceAction?(state: SceneState, action: VisualizationPerformanceAction): SceneState;
  vary?(state: SceneState, random: () => number): SceneState;
};
```

The registry validates registration identity and delegates all operations; the session contains no scene-ID switch. Each module immediately narrows/validates its own state before calling scene-specific functions or renderer constructors.

- **Benefits:** best locality; one registration carries behavior; session gains **leverage** without growing branches; tests can exercise every module against a common contract; still static and internal.
- **Costs:** generic TypeScript correlation between ID and state needs care. An overly broad non-generic interface can merely move unsafe casts. Registration-time wrappers or scene-specific factory functions should preserve narrowing locally.
- **Guardrail:** do not add discovery, manifests, dynamic imports, external packages, user code, compatibility negotiation, or plugin security. This is a static built-in module list.

### Pattern C: renderer registry separate from behavior registry

Keep renderer factories keyed by scene ID and add separate action/variation maps.

- **Benefits:** individually small interfaces.
- **Costs:** multiple ID-indexed maps create synchronization failure modes and reduce locality; registering a scene becomes a multi-registry transaction.
- **Judgment:** reject unless independent consumers appear. It adds seams without depth.

### Pattern D: base scene class with renderer lifecycle hooks

Model scenes as subclasses with initialize/update/render/finalize methods, similar to deck.gl or projectM.

- **Evidence:** deck.gl exposes lifecycle methods and projectM defines a `Preset` interface with initialize/render/output behavior plus a factory abstraction. [deck.gl lifecycle](https://deck.gl/docs/developer-guide/custom-layers/layer-lifecycle) [projectM `Preset`](https://github.com/projectM-visualizer/projectm/blob/master/src/libprojectM/Preset.hpp) [projectM `PresetFactory`](https://github.com/projectM-visualizer/projectm/blob/master/src/libprojectM/PresetFactory.hpp)
- **Costs for Wave:** it would mix serializable product state with browser/GPU lifetime, weaken dependency direction, and duplicate the renderer interface already providing a better seam.
- **Judgment:** reject for this project. Borrow explicit lifecycle discipline, not the inheritance shape.

## Project-specific recommendation

### Recommended target

1. Keep each pure scene model in `src/core/scene/<scene>.ts` with ID, compatibility version, typed state/preset, authoritative parameter parser, defaults, and optional pure transformations; make top-level unknown-field policy explicit.
2. Keep `SceneRegistry` as the core authority for parsing persisted scene state and presets. It must remain browser-free and closed to only built-ins.
3. Deepen `VisualizationSceneRegistry` entries into internal visualization scene modules that compose the core definition with renderer creation and optional action/variation behavior.
4. Refactor `BrowserVisualizationSession.dispatch()` and `vary()` to delegate to the active registered module. The session retains selection, per-scene state, renderer queue/generation ownership, status, activation, and disposal.
5. Keep renderer implementations independent and scene-specific. They validate/narrow incoming state, own GPU resources, and implement the same narrow renderer interface.
6. Keep React explicit. Extract `SignalControls` and `LightMachineControls` into scene-local presentation files only when editing them for a real reason; a third scene can justify a small internal control-component lookup. Do not infer controls from validation data.
7. Keep the static built-in registry as the composition root. No public registration API or package split is justified.

### Why this is the right amount of architecture

The recommendation increases **locality** exactly where current branching predicts growth while preserving the established module boundaries. The registry seam gains **depth** because it hides renderer construction plus optional scene behavior behind one lookup. The session interface stays small and gains **leverage**: renderer race handling, state publication, and cleanup work for every registered scene. Adapters remain explicit: signal provider to renderer, raw DOM input to semantic action, and scene module to concrete WebGPU renderer.

It does not generalize the parameter model, controls, persistence schema, or plugin loading. Those systems have no second independent requirement and would widen the ticket.

## Tradeoffs and failure modes

1. **Central branching grows.** Today a third scene would require edits in `BrowserVisualizationSession`, `SceneControls`, `SceneVisualizer`, both registries, core unions, and the duplicated HTTP DTO schemas in `src/shared/api.ts`. Session branches are the highest-risk part because they combine behavior with async renderer ownership. Delegating runtime behavior removes that pressure.
2. **Type correlation can be erased.** Current `SceneDefinition.parseParameters` and `createDefaultState` return union-wide types. A naive module interface can accept a state for the wrong scene and rely on runtime checks. Keep narrowing inside a scene-specific module constructor/wrapper and retain explicit wrong-scene rejection tests.
3. **Registry skew.** The core and visualization registries can list different IDs. Add a parity fitness check for built-ins; do not create more keyed registries.
4. **Version means too many things.** Tying renderer revisions to preset version causes needless incompatibility; failing to bump for semantic parameter changes silently misinterprets presets. Document and test compatibility meaning.
5. **Validation drift.** Slider bounds/options duplicate parser limits. A UI may emit values core rejects or omit newly legal values. Export selected constants where helpful and always parse session mutations; do not solve this with generated controls.
6. **Shared-canvas races.** Async factories may configure the same canvas after selection changed. The existing serialized queue and generation checks are essential and must remain in the session. The Phase 2B report records a real `getCurrentTexture(): canvas is not configured` race that this design fixed. [Phase 2B report](https://github.com/kalynbeach/wave-player-next/blob/main/docs/phase-2b-implementation-report.md)
7. **Stale callbacks.** A disposed/lost renderer may publish status after replacement. Generation-scoped status callbacks and renderer-owned cleanup must remain tested.
8. **Partial allocation leaks.** Pipeline/buffer/texture/observer setup can fail midway. Each renderer factory/constructor needs one deterministic cleanup path, including device loss and repeated disposal.
9. **Per-scene state retention surprises.** The session retains unsaved state while switching scenes. This is useful instrument behavior but is not persistence. UI and tests should distinguish retained session state, reset defaults, and saved presets.
10. **Device-per-renderer churn.** Both renderers currently request their own device, so switching scenes can reacquire a device. Sharing a device could reduce churn but would couple failure domains and ownership. Do not change this without measurement.
11. **Over-generalized actions.** A lowest-common-denominator action union can become vague; a scene-specific union can leak concrete IDs into the session. Keep the present small semantic union until a real third scene reveals the pressure.
12. **Premature UI/plugin framework.** Registry work can drift into dynamic discovery, schema controls, or public compatibility promises. The static internal composition root is an explicit scope boundary.

## Architecture-sensitive fitness checks

These checks should protect module boundaries and ownership rather than only pixels:

1. **Pure core:** core scene tests run without Bun, DOM, React, Web Audio, or WebGPU globals; static dependency direction prevents `core` from importing `app`, `client`, or `server`.
2. **Definition contract:** for every built-in core definition, `parseState(createDefaultState())` succeeds and returns an equal fresh state; unknown parameter keys, non-finite/out-of-range values, wrong IDs, and unsupported versions fail. Top-level unknown state/preset fields follow the explicitly selected strip-or-reject policy.
3. **Preset boundary:** every built-in preset round-trips through core parser, SQLite adapter, and HTTP DTO; renderer details never appear in stored JSON.
4. **Registry uniqueness/parity:** duplicate IDs fail, unknown IDs fail, and the set of core built-in IDs equals the set of client visualization module IDs.
5. **Module locality probe:** replace one existing built-in's registered module with a fake implementation for the same closed `SceneId`/`SceneState` and prove selection, action reduction, optional variation, reset, renderer replacement, and disposal without editing `BrowserVisualizationSession`. A distinct test-only third ID is valid only if the chosen target interface intentionally provides a generic internal fixture seam; it must not require unsafe casts or production-union edits merely to satisfy the test.
6. **Wrong-scene isolation:** each module and renderer rejects state for another ID before mutating resources.
7. **Renderer ownership:** at most one renderer is active for a canvas; stale async creations are disposed before the current factory configures it; stale status callbacks cannot change the current snapshot.
8. **Lifecycle failures:** common harness tests cover unsupported creation, factory rejection, activation failure, resize/configure failure, frame failure, device loss, partial allocation, hidden/resume behavior, and idempotent disposal.
9. **Snapshot contract:** repeated `getSnapshot()` calls return the same object until state/status changes, and unsubscribe stops updates, matching React's external-store requirements.
10. **Semantic input seam:** React tests prove raw keys/pointer motion become semantic actions; session/module tests prove actions produce validated state without DOM event objects.
11. **Playback independence:** scene selection and renderer failure do not replace or command playback runtime/signal provider identity.
12. **Resource bounds:** backing dimensions and feedback allocations stay capped across resize and device-pixel-ratio changes.

## Precisely scoped experiment still needed

Before deciding whether GPU device/context ownership should move above individual renderers, measure the current design on the primary macOS development machine:

- alternate `signal` ↔ `light-machine` 50 times after warm-up;
- record `selectScene` to renderer `ready` latency (median/p95), number of `requestDevice` calls, transient error/device-loss events, and maximum GPU/process memory;
- repeat a prototype where a test-only runtime adapter supplies one shared `GPUDevice` while each renderer still owns all scene resources;
- verify the same stale-factory, device-loss, and idempotent-disposal tests under both ownership models.

Adopt shared-device ownership only if switch latency/resource churn materially improves and device-loss cleanup remains no more coupled. Until then, renderer-local device ownership has better locality and simpler failure containment.

Separately, the module-locality probe in fitness check 5 should be implemented before the production third scene. It should substitute a fake module for an existing closed ID unless the selected target interface deliberately supports a type-safe internal fixture ID.

## Open uncertainties

- The first actual scene v2 will determine whether compatibility needs migration, multi-version parsing, or explicit rejection; current evidence only supports exact v1.
- A third real scene may show that the current semantic action names are too generic or that actions belong in scene-specific capability interfaces.
- A third real controls surface may justify a small presentation-module registry, but two explicit components do not justify schema-driven controls.
- Renderer-local versus session-shared GPU devices requires the measured experiment above.
- It is not yet established whether retained unsaved per-scene state should survive browser-session reconstruction; that is persistence policy, not renderer architecture.
- There is no evidence for WebGL/Canvas fallback selection, dynamic scene loading, public plugins, or external scene compatibility, so this brief makes no design commitment for them.

## Sources

### Wave Player Next primary sources

- [Architecture](https://github.com/kalynbeach/wave-player-next/blob/main/docs/architecture.md)
- [Core model](https://github.com/kalynbeach/wave-player-next/blob/main/docs/core-model.md)
- [Playback and visualization](https://github.com/kalynbeach/wave-player-next/blob/main/docs/playback-and-visualization.md)
- [Phase 2B implementation report](https://github.com/kalynbeach/wave-player-next/blob/main/docs/phase-2b-implementation-report.md)
- [Signal scene](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/signal-scene.ts)
- [Light-machine scene](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/light-machine-scene.ts)
- [Core scene registry](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/scene-registry.ts)
- [Visualization session interfaces](https://github.com/kalynbeach/wave-player-next/blob/main/src/app/visualization/visualization-session.ts)
- [Browser visualization session](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/browser-visualization-session.ts)
- [Visualization scene registry](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/visualization-scene-registry.ts)
- [Built-in visualization scenes](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/built-in-visualization-scenes.ts)
- [Signal renderer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/webgpu-signal-renderer.ts)
- [Light-machine renderer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/webgpu-light-machine-renderer.ts)
- [Scene controls](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/app/scene-controls.tsx)
- [Scene visualizer](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/app/scene-visualizer.tsx)
- [Core registry tests](https://github.com/kalynbeach/wave-player-next/blob/main/src/core/scene/scene-registry.test.ts)
- [Browser session tests](https://github.com/kalynbeach/wave-player-next/blob/main/src/client/visualization/browser-visualization-session.test.ts)
- [SQLite preset repository](https://github.com/kalynbeach/wave-player-next/blob/main/src/server/database/sqlite-scene-preset-repository.ts)

### External primary and implementation sources

- [WebGPU specification: device loss](https://gpuweb.github.io/gpuweb/#dom-gpudevice-lost) — normative lifetime behavior.
- [MDN: `GPUDevice.lost`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost) — browser-facing recovery guidance.
- [React: `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) — official external-store snapshot/subscription contract.
- [deck.gl: layer lifecycle](https://deck.gl/docs/developer-guide/custom-layers/layer-lifecycle) and [Layer source](https://github.com/visgl/deck.gl/blob/master/modules/core/src/lib/layer.ts) — mature identity, retained state, update, draw, and finalization practice.
- [regl API](https://github.com/regl-project/regl/blob/master/API.md) — mature canvas/context injection, reusable rendering commands, frame loop, resource destruction, and context-loss practice.
- [PixiJS Application](https://pixijs.com/8.x/guides/components/application) — renderer selection and asynchronous application lifecycle at the rendering boundary.
- [projectM `Preset`](https://github.com/projectM-visualizer/projectm/blob/master/src/libprojectM/Preset.hpp), [`PresetFactory`](https://github.com/projectM-visualizer/projectm/blob/master/src/libprojectM/PresetFactory.hpp), and [Milkdrop preset implementation](https://github.com/projectM-visualizer/projectm/blob/master/src/libprojectM/MilkdropPreset/MilkdropPreset.hpp) — mature audio-visualizer evidence for explicit initialization/render/resource behavior and factory separation; used as comparative evidence, not as a model for public presets/plugins.

## Conclusion

The target is an internal, static, module-based scene architecture built on the boundaries already present. Core owns stable persisted meaning; the visualization registry composes that meaning with client adapters and optional scene behavior; the session owns orchestration and one-renderer lifetime; renderers own GPU mechanics; React owns presentation and raw-input adaptation. The main improvement is to remove scene-specific branching from the session before the third scene, while deliberately refusing plugin, schema-control, and backend abstractions that current evidence does not require.
