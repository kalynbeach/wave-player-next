# Lifecycle and Testing Architecture

> Research ticket: [Understand lifecycle and testing architecture](https://github.com/kalynbeach/wave-player-next/issues/7). This document records evidence and architectural conclusions; it does not prescribe an implementation plan.

## Executive answer

Wave Player Next should treat the browser runtime as two independently owned, observable lifecycle machines—playback and visualization—composed by an application controller and merely subscribed to by React. Each owner should serialize or supersede asynchronous work, reject commands after terminal disposal, make disposal idempotent at its public boundary, publish immutable cached snapshots, and expose enough typed diagnostics to distinguish expected cancellation, capability absence, recoverable activation failure, media failure, render failure, and terminal resource loss.

Confidence should come from complementary layers, not from maximizing mocks: deterministic module tests for pure transitions and lifecycle orchestration; real lightweight adapters for inexpensive stateful boundaries; narrow behavior fakes for unavailable browser capabilities; mocks only to force otherwise unreachable timing or failures; and real-browser checks for media, Web Audio, WebGPU, animation, user activation, layout, and leak symptoms. Current code already demonstrates good local ownership and cleanup practice, especially in visualization generation gating and renderer resource tests, but command supersession, disposal completion, diagnostic depth, WebGPU asynchronous error coverage, allocation/frame measurements, and repeatable real-browser lifecycle evidence remain incomplete.

## Evidence labels

- **Normative fact** means a requirement or defined behavior from a specification or framework contract.
- **Implementation practice** means a credible technique demonstrated by official guidance or mature implementation patterns, but not required by the platform.
- **Architectural judgment** means the conclusion recommended for Wave Player Next from the evidence and current repository shape.

## 1. Lifecycle and state model

### Platform facts

- **Normative fact:** A state-machine model consists of active states and event-triggered transitions, with initial and final states; reaching a top-level final state terminates processing. SCXML also gives entry and exit actions explicit semantics. This supports a terminal `disposed` state rather than an unrelated Boolean spread through the runtime. [W3C SCXML](https://www.w3.org/TR/scxml/)
- **Normative fact:** `HTMLMediaElement` exposes distinct network, readiness, and playback facts. Ready-state transitions may skip intermediate values, and invoking `load()` discards pending media tasks while settling in-flight play promises according to the media load algorithm. A product snapshot therefore must not pretend browser events form a perfectly linear sequence. [WHATWG media element](https://html.spec.whatwg.org/multipage/media.html)
- **Normative fact:** `AudioContext` has `suspended`, `running`, and `closed` states. `resume()` may reject, and `close()` releases system resources but does not automatically release every context-created JavaScript object; closing an already closed context can reject with `InvalidStateError`. [Web Audio API § AudioContext](https://www.w3.org/TR/webaudio/#AudioContext)
- **Official browser guidance:** `requestAnimationFrame` is one-shot, its identifier must be retained for cancellation, and callbacks are normally paused in background tabs. Animation progress must use the supplied timestamp rather than assume 60 Hz. [MDN `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) and [`cancelAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/cancelAnimationFrame)

### Binding principles for Wave Player Next

1. **Architectural judgment: represent lifecycle as tagged state, not independent flags.** Playback needs product states such as `idle`, `loading`, `ready`, `playing`, `paused`, `ended`, `error`, and terminal `disposed`; visualization needs `detached`, `initializing`, `ready`, `unsupported`, `error`, and terminal `disposed`. Capability and activity facts may be orthogonal data, but impossible combinations should be unrepresentable or rejected by a pure transition function.
2. **Architectural judgment: separate product state from platform evidence.** A snapshot may say `loading` while diagnostics retain `networkState`, `readyState`, the last media event, and a command identifier. Product state is stable for UI consumers; platform facts preserve debugging power without leaking raw browser mechanics into controllers.
3. **Architectural judgment: one owner per resource and one terminal boundary.** Playback owns the media element, AudioContext, audio nodes, listeners, and signal-provider attachment. A renderer owns its device, buffers, textures, observer, canvas configuration, and animation handle. The visualization session owns exactly one current renderer. React owns only effect bindings and unsubscribers.
4. **Architectural judgment: activation and allocation must be atomic.** Either a candidate graph/renderer becomes the current owned instance, or every partially allocated resource is released before the attempt resolves. Late completion must never regain ownership after supersession or disposal.
5. **Architectural judgment: `dispose()`/`destroy()` is an idempotent public command even when platform cleanup calls are not.** The first call changes the owner to terminal state and begins cleanup; later calls are no-ops or return the same completion promise. This facade is necessary because platform methods such as `AudioContext.close()` do not themselves guarantee repeat-call idempotency.
6. **Architectural judgment: post-disposal commands fail before side effects and late callbacks become inert.** Synchronous commands may throw immediately; promise-returning commands reject immediately rather than producing a later operational failure. Listener callbacks, device-loss continuations, animation callbacks, and async factory completions must check ownership generation/terminal state before publishing.

## 2. Structured cancellation and command ordering

### Platform facts and practice

- **Normative fact and official guidance:** An `AbortSignal` is one-shot, carries a reason, and `throwIfAborted()` throws that reason. Official guidance for a promise API accepting a signal is to reject unsettled work with the signal's abort reason and handle an already-aborted signal immediately. [DOM Standard: `AbortSignal`](https://dom.spec.whatwg.org/#interface-AbortSignal), [MDN `AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal), and [`throwIfAborted()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/throwIfAborted)
- **Implementation practice:** A lifecycle owner creates a cancellation scope for each supersedable operation and aborts the previous scope with a typed reason such as `superseded`, `surface-detached`, or `disposed`. Generation tokens remain useful for non-abortable APIs and as a last-write ownership guard; an abort signal alone cannot undo arbitrary platform side effects.

### Binding principles

- **Architectural judgment:** Commands that can overlap (`load`, `select`, renderer creation, initial API hydration) require an explicit ordering rule: serialize, supersede, or reject. The rule belongs to the application/runtime owner, not React.
- **Architectural judgment:** Cancellation is an expected outcome, not a runtime error. A superseded operation should settle deterministically without replacing the current snapshot with an error. Failure and cancellation must be distinguishable in typed results and diagnostics.
- **Architectural judgment:** A command epoch should travel through the async path. Before each externally visible commit, the operation verifies both `!signal.aborted` and that its epoch is still current. This addresses APIs such as media playback and WebGPU creation whose work cannot be fully cancelled.
- **Architectural judgment:** Disposal cancels the root scope before releasing resources. Child operations inherit or are composed with that scope so no pending command outlives its owner.

### Failure modes to test

- Old `play()` rejection overwrites a newer successful track selection.
- `ended` auto-advance races with explicit next/previous.
- Renderer A resolves after scene B was selected or after the surface detached.
- A subscriber or status callback throws while ownership work is settling.
- Disposal occurs between allocation steps or while `AudioContext.resume()` is pending.
- An abort listener leaks after successful completion.

## 3. Error surfaces and observability

### Browser error surfaces

- **Official browser guidance:** `HTMLMediaElement.play()` returns a promise and may reject after a delay; `NotAllowedError` represents policy/user-activation blocking. The UI must reflect fulfillment or rejection rather than assume playback began. [MDN `HTMLMediaElement.play()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)
- **Official browser guidance:** `MediaError.code` distinguishes aborted, network, decode, and unsupported-source failures; `message` is user-agent-specific diagnostic text. [MDN `MediaError.code`](https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code)
- **Normative fact:** WebGPU object creation is often internally asynchronous even when the API call is synchronous. Many failures arrive as `GPUError`s rather than thrown exceptions. Predictable release should use explicit `destroy()`, and loss of a device makes its owned objects unusable. Relevant surfaces are `GPUDevice.lost`, error scopes (`pushErrorScope`/`popErrorScope`), and `uncapturederror`. [WebGPU § Errors and Debugging](https://www.w3.org/TR/webgpu/#errors-and-debugging) and [§ Device Loss](https://www.w3.org/TR/webgpu/#device-loss)
- **Normative fact:** React's `useSyncExternalStore` requires `subscribe` to return an unsubscribe function. `getSnapshot` must return an immutable cached snapshot until the store changes; a changed `subscribe` function causes React to resubscribe. A server snapshot is required when server rendering applies. [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)

### Observable contract

**Architectural judgment:** Public snapshots should be immutable, cached by identity, and contain product-relevant state plus typed error data. Diagnostics should be separately available or nested so presentation does not depend on unstable user-agent messages. Useful fields are:

- lifecycle state and monotonically increasing snapshot revision;
- current source/scene and command epoch;
- last transition (`from`, `event`, `to`) and timestamp;
- cancellation reason for the most recently settled command;
- media `networkState`, `readyState`, `MediaError.code`, and last event;
- AudioContext state and analysis graph availability;
- renderer generation, active/hidden state, canvas dimensions, pixel ratio, adapter/device status;
- counts of live listeners, scheduled frames, renderer creations/disposals, and resource-release failures in diagnostic builds;
- last frame duration, rolling slow-frame count, and allocation/memory observations where the browser supports them.

**Implementation practice:** Use stable event names and dimensions so a transition log or metric can be correlated across subsystems. OpenTelemetry's semantic-convention rationale—consistent names across code and platforms—is applicable even if this local-first product does not adopt an exporter. [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)

**Architectural judgment:** User-facing errors remain coarse and actionable (`autoplay_blocked`, `media_network`, `media_decode`, `media_unsupported`, `audio_activation`, `webgpu_unsupported`, `webgpu_initialization`, `webgpu_validation`, `webgpu_out_of_memory`, `webgpu_device_lost`, `render_failure`). Diagnostics retain the original exception name/message and platform code. Cancellation is not included in this error union.

## 4. Animation, audio, and GPU allocation constraints

- **Official browser guidance:** rAF callbacks share the frame budget with JavaScript, layout, paint, and browser work. The platform does not promise 60 Hz. [MDN `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- **Implementation practice:** Use a single self-scheduling loop per active renderer, cancel it while hidden/disposed/lost/failed, retain one current handle, and do no render work from transport event handlers.
- **Implementation practice:** Reuse typed arrays, geometry storage, uniform arrays, GPU buffers, bind groups, and bounded texture sets. Frequent object creation increases garbage-collection pressure and can cause frame hitches; allocation optimization should nevertheless be justified by profiling rather than blanket pooling. [web.dev, “Optimize JavaScript execution”](https://web.dev/articles/optimize-javascript-execution) and [“Static memory JavaScript with object pools”](https://web.dev/articles/speed-static-mem-pools)
- **Architectural judgment:** “No allocations per frame” is too absolute as a universal correctness rule, but **zero unbounded growth and stable steady-state allocation rate** are binding. Any unavoidable per-frame allocations should be measured and bounded on the primary machine.
- **Architectural judgment:** Canvas backing dimensions and feedback textures need explicit caps based on device limits and product policy. Resize should not recreate resources when effective dimensions are unchanged, and allocation of a replacement set must clean up a partial set on failure.
- **Implementation practice:** Long Animation Frames can be observed with `PerformanceObserver`; a long animation frame is over 50 ms and the buffer is bounded, so observations must be consumed rather than queried indefinitely. [MDN Long Animation Frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing)

## 5. Testing taxonomy and confidence architecture

These terms should not be used interchangeably:

| Layer | Definition | Appropriate Wave Player Next evidence | What it cannot prove |
|---|---|---|---|
| **Deterministic module test** | Runs one pure or framework-independent module with controlled inputs, clock/scheduler, and no real browser resource. | Pure transition table; command epoch/cancellation races; signal geometry; snapshot identity; state validation; disposal algebra. | Browser codec, autoplay, Web Audio routing, GPU driver behavior, layout. |
| **Real lightweight adapter** | A real implementation of an inexpensive boundary used in-process or in a temporary environment. | `BrowserPlayerSessionStore` with real `Storage`; real in-memory SQLite elsewhere in the repo; a deterministic scheduler implementation; a real scene registry with tiny renderers. | Expensive/native browser behavior not supplied by that environment. |
| **Fake** | A small typed behavioral substitute with its own state and controllable outcomes. It models the contract rather than checking call trivia. | Fake playback runtime for controller tests; fake renderer that can resolve late; fake signal provider; fake clock/rAF queue; fake GPU environment for ownership tests. | Fidelity beyond behaviors deliberately modeled. A fake GPU does not prove WebGPU works. |
| **Mock** | An interaction-focused substitute or patched API, usually configured per test to force a call result or assert a rare interaction. | Force `play()` to reject `NotAllowedError`; make the second texture allocation throw; force resume/device-loss timing; verify cancellation of a rare callback. | End-to-end behavior or architecture. Deep call-order assertions become refactor-sensitive. |
| **Browser integration check** | Runs the assembled localhost application in an actual browser process against real browser APIs and user-like interaction. | Media load/play/pause/seek/ended, gesture policy, analyser data, WebGPU capability/rendering, resize/pointer/focus, remount/disposal symptoms, console/page errors. | Exhaustive races or deterministic low-level failure injection; GPU output can vary. |

**Implementation practice:** Browser checks should use user-facing locators, actionability/auto-waiting, and retrying assertions rather than sleeps or private-state selectors. Console errors and page errors are explicit failure channels, and each test context should have isolated lifetime. [Playwright best practices](https://playwright.dev/docs/best-practices), [auto-waiting](https://playwright.dev/docs/actionability), and [console messages](https://playwright.dev/docs/api/class-consolemessage)

**Architectural judgment:** The repository's current decision not to install a project-managed Playwright suite remains coherent for the existing phase, but it limits repeatability. Agent-run browser verification is evidence, not a deterministic CI gate. This distinction must remain explicit in reports.

### Test design rules

1. Assert state transitions and owned-resource counts, not private method call sequences.
2. Run every disposal scenario twice and after partial initialization.
3. Drive pending operations in every meaningful order using deferred promises or a controllable scheduler.
4. Assert no notification after unsubscribe/disposal and cached snapshot identity between mutations.
5. Make fakes contract-shaped and reusable only while their modeled behavior remains small and legible.
6. Keep at least one real-browser check for every browser-only capability; unit fakes only narrow diagnosis.
7. Treat screenshots as visual-structure evidence, not proof of deterministic GPU pixels.
8. Record browser name/version, OS/GPU, viewport, actions, final diagnostic snapshot, console/page errors, and performance sample conditions.

## 6. Current implementation assessment

### Existing strengths

- **Implementation evidence:** `HtmlMediaPlaybackRuntime` owns media listeners and the AudioContext graph, clamps transport values, maps autoplay rejection to a typed error, disconnects nodes, clears its signal provider, and guards repeat `destroy()`. [`html-media-playback-runtime.ts`](../../src/client/playback/html-media-playback-runtime.ts)
- **Implementation evidence:** `BrowserVisualizationSession` serializes renderer creation, uses a generation guard to invalidate stale completion, disposes stale renderers, makes disposal idempotent, and prevents post-disposal commands. [`browser-visualization-session.ts`](../../src/client/visualization/browser-visualization-session.ts)
- **Implementation evidence:** Both WebGPU renderers hold one animation handle, gate scheduling when hidden/failed/lost/disposed, cap or reuse resources, explicitly destroy owned GPU objects, unconfigure canvas, and handle `device.lost`. The light-machine renderer atomically destroys a partially created texture pair. [`webgpu-signal-renderer.ts`](../../src/client/visualization/webgpu-signal-renderer.ts) and [`webgpu-light-machine-renderer.ts`](../../src/client/visualization/webgpu-light-machine-renderer.ts)
- **Implementation evidence:** `WebAudioSignalProvider` reuses a stable frame and typed arrays. Its tests assert reference reuse and cleared buffers while unavailable. [`web-audio-signal-provider.ts`](../../src/client/playback/web-audio-signal-provider.ts)
- **Implementation evidence:** Representative tests cover idempotent disposal, stale renderer completion, activation failure recovery, initial/partial allocation failure, device loss, hidden-loop cancellation, provisional AudioContext cleanup, autoplay rejection, and retry after failed resume. [`browser-visualization-session.test.ts`](../../src/client/visualization/browser-visualization-session.test.ts), [`webgpu-signal-renderer.test.ts`](../../src/client/visualization/webgpu-signal-renderer.test.ts), [`webgpu-light-machine-renderer.test.ts`](../../src/client/visualization/webgpu-light-machine-renderer.test.ts), and [`html-media-playback-runtime.test.ts`](../../src/client/playback/html-media-playback-runtime.test.ts)
- **Implementation evidence:** React uses `useSyncExternalStore` for controller and visualization snapshots and disposes both application runtimes in effect cleanup. [`app.tsx`](../../src/client/app/app.tsx) and [`scene-visualizer.tsx`](../../src/client/app/scene-visualizer.tsx)

### Gaps, stated as evidence gaps rather than implementation tasks

- **Current gap:** Playback has a `#playActivationPending` Boolean but no command epoch or abort scope. Overlapping `load`/`play`, rapid selection, ended auto-advance, and destruction during pending resume/play have no comprehensive supersession model in code or tests.
- **Current gap:** Visualization has robust generation gating but not structured cancellation. Factory work is serialized and stale output is discarded; underlying pending work cannot be asked to stop early.
- **Current gap:** Playback `destroy()` starts `AudioContext.close()` without exposing or awaiting cleanup completion. The promise is discarded without a rejection handler, so a permitted close rejection can become unhandled; tests prove invocation/guarding only for successful closure, not that release settled or failure was observed.
- **Current gap:** Playback's media error mapping collapses network, decode, unsupported source, and most graph activation failures into `media_error`; diagnostic snapshots omit `MediaError.code`, media readiness/network state, AudioContext state, event/command epoch, and cleanup outcome.
- **Current gap:** WebGPU renderers observe `device.lost` and synchronous render exceptions but do not expose error scopes or `uncapturederror`, leaving validation and out-of-memory errors incompletely classified.
- **Current gap:** Renderer tests use credible narrow fakes but do not prove actual adapter/device/canvas behavior. The existing docs require agent-run browser verification, yet it is not a repeatable repository-managed suite and no current test artifact in this scope establishes rapid remount/resource quiescence.
- **Current gap:** Per-frame reuse is asserted for signal buffers and bounded GPU resources, but no measured steady-state allocation rate, frame-time distribution, slow-frame count, or post-remount memory/resource plateau is recorded.
- **Current gap:** `useSyncExternalStore` receives inline subscribe/getSnapshot closures. Snapshot identity is stable in stores, but subscription churn and Strict Mode mount-cleanup-remount behavior are not directly characterized.
- **Current gap:** `PlayerController`'s fake is useful but simplistic: `play()` resolves immediately, destroy is only a Boolean, and no deferred failure/cancellation ordering exercises stale outcomes.

## 7. Measurable fitness-check candidates

These are architectural fitness checks, not a proposed delivery checklist. Thresholds marked “baseline first” require the experiment below before becoming gates.

| Property | Candidate measure | Pass signal |
|---|---|---|
| Deterministic lifecycle | Pure transition-table coverage | Every state/event pair is accepted, ignored, cancelled, or rejected explicitly; terminal state has no outgoing operational transition. |
| Command supersession | Deferred-promise permutation test | In all tested completion orders, only the current epoch changes the snapshot; superseded work settles as cancellation, not error. |
| Idempotent disposal | Resource-ledger test | Calling dispose twice after each allocation step releases each owned resource at most once and leaves zero listeners/frames/current renderer. |
| Late-callback safety | Post-disposal scheduler drain | Draining all queued callbacks/promises produces no notifications, new frames, or resource acquisition. |
| External-store correctness | Snapshot/subscription test | `getSnapshot()` is referentially equal without mutation, changes identity once per published mutation, and no listener fires after unsubscribe. |
| Loop uniqueness | Controlled-rAF test | At most one pending frame per active renderer; zero while hidden, failed, lost, detached, or disposed. |
| Bounded GPU allocation | Resize/scene-cycle ledger | Live textures/buffers never exceed documented scene bounds; unchanged effective size creates none; failed replacement leaves no partial set. |
| WebGPU error coverage | Fake plus browser diagnostic evidence | Adapter/context unsupported, device request failure, validation/OOM capture, uncaptured error, device loss, and render exception map to distinct diagnostics without loop continuation. |
| Media error coverage | Typed classification tests plus browser fixture | autoplay, abort/supersession, network, decode, unsupported source, and missing file remain distinguishable. |
| Steady-state animation | Real-browser profile, baseline first | Frame-time percentile, >50 ms LoAF count, dropped-frame observation, and per-frame allocation slope remain within a threshold derived from the primary macOS machine. |
| Remount quiescence | Instrumented browser cycle experiment | After each cycle, an explicit diagnostic ownership ledger and disposal-completion barrier report zero live loops/listeners/renderers/resources; browser memory is supplementary trend evidence, not the correctness oracle. |
| Browser integration health | Recorded real-browser scenario | Real WAV/MP3 play/seek/end, analyser non-zero data, scene switch/resize, user interaction, and unmount complete with no unexpected console/page errors. |

## 8. Tradeoffs, failure modes, and open uncertainties

- **Explicit state model vs. complexity:** A tagged transition model prevents contradictory state and supports exhaustive tests, but mirroring every browser event creates an unwieldy pseudo-browser. Wave should model only product decisions and retain raw platform facts as diagnostics.
- **Serialization vs. responsiveness:** Serial renderer ownership prevents shared-canvas corruption, but a hung factory can block newer work. Structured cancellation can reduce wasted work, but generation gating remains necessary because WebGPU operations are not uniformly abortable.
- **Close-on-destroy vs. reuse:** Closing AudioContext deterministically releases scarce resources, but a closed graph cannot resume. Suspending can make hide/show cheaper but prolongs ownership. The correct boundary depends on whether hidden view, detached surface, and application unmount are distinct lifecycle events.
- **Detailed diagnostics vs. snapshot churn:** Publishing every `timeupdate`, frame duration, or platform event through React would create needless rendering. High-frequency metrics should be sampled or exposed through a diagnostics channel rather than the presentation snapshot.
- **Aggressive zero-allocation policy vs. maintainability:** Typed-array reuse is justified in frame loops, while global object pooling can increase retained memory and complexity. Measurements should decide where additional pooling is warranted.
- **Fakes vs. browser fidelity:** Narrow fakes make races and cleanup deterministic; they can also encode incorrect assumptions. Each real browser capability boundary needs browser integration evidence, while inaccessible validation/OOM/device-loss injections may remain fake-only and must be labeled as such rather than claimed as browser proof.
- **Agent-run browser checks vs. CI automation:** The current approach avoids infrastructure cost and can inspect GPU output interactively, but it is less repeatable and cannot prevent regression automatically. Evidence of recurring browser lifecycle regressions would justify revisiting the deferred runner decision; this brief does not assume that evidence exists.
- **Open uncertainty:** Browser and GPU behavior under device/OS-specific pressure cannot be inferred from fake `device.lost` tests. Validation/OOM/device-loss recovery policy needs real adapter evidence.
- **Open uncertainty:** Web Audio ownership across a destroyed context and the same media element is constrained by browser behavior and deserves direct verification before promising runtime recreation semantics.

## 9. Precisely bounded experiment still necessary

The experiment has an instrumentation prerequisite: a development-only diagnostic probe must expose an ownership ledger (live media/context listeners, scheduled frames, current renderers, explicitly owned GPU buffers/textures, and active session generations) plus a disposal-completion/idle barrier that settles when tracked asynchronous cleanup and scheduled work are quiescent. This probe is not a production feature; without it, browser observation cannot prove exact release.

On the primary supported macOS browser/GPU, run 20 cycles in one fresh browser context:

1. mount the application and record browser/OS/GPU, initial diagnostic ledger, and memory capability availability;
2. select alternating committed WAV and MP3 fixtures rapidly while the prior `play()`/AudioContext activation is pending where timing permits;
3. play for 10 seconds, verify non-zero analyser data, switch both scenes, resize through the three documented viewports, hide/show the visual view, seek, and force ended/next;
4. unmount/remount the application, await the explicit disposal/idle barrier, then wait two animation frames to detect forbidden rescheduling;
5. after each cycle record the ownership ledger, AudioContext state/close outcome, unexpected console/page errors, LoAF entries, frame-time samples, and `measureUserAgentSpecificMemory()` when supported.

The correctness signal is exact and observable: after each unmount the ledger reaches zero, disposal settles without an unhandled rejection, two later frames create no new work, and no unexpected browser error occurs. Browser memory remains noisy and is supplementary only: inspect whether later-cycle samples stabilize, but do not use a single monotonic-growth or percentage threshold as a correctness gate. Repeat the run or profile retained objects if memory continues trending upward despite a zero ledger. Numerical frame and memory budgets should be set only after this baseline.

## Sources retained

### Primary and official

- [W3C SCXML](https://www.w3.org/TR/scxml/) — normative state/transition/final-state vocabulary.
- [WHATWG HTML media element](https://html.spec.whatwg.org/multipage/media.html) — normative media network, readiness, event, load, and play behavior.
- [W3C Web Audio API](https://www.w3.org/TR/webaudio/) — normative AudioContext state and cleanup behavior.
- [W3C WebGPU](https://www.w3.org/TR/webgpu/) — normative error, device-loss, ownership, and explicit-destruction behavior.
- [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) — official external-store snapshot and subscription contract.
- [MDN `AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) — platform cancellation API and promise guidance.
- [MDN `HTMLMediaElement.play()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play) and [`MediaError.code`](https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code) — official browser-facing explanation of rejection and error categories.
- [MDN `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [`cancelAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/cancelAnimationFrame), and [Long Animation Frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing) — scheduling and measurement facts.
- [Playwright best practices](https://playwright.dev/docs/best-practices), [actionability](https://playwright.dev/docs/actionability), and [console messages](https://playwright.dev/docs/api/class-consolemessage) — authoritative mature browser-testing practice; cited without recommending immediate dependency adoption.
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/) — credible naming practice for observable signals; cited without recommending an exporter.

### Repository evidence

- [Architecture](../architecture.md), [Testing Strategy](../testing-strategy.md), and [Playback and Visualization](../playback-and-visualization.md) — settled local boundaries and testing policy.
- Browser runtime implementations and representative tests linked in §6 — direct evidence of current behavior.

### Dropped or limited

- Old Web Audio and WebGPU draft snapshots — superseded by current W3C documents.
- Generic state-management library articles — unnecessary; SCXML and current code provide sufficient state-model evidence without selecting a framework.
- General testing SEO content — omitted in favor of Bun/repository guidance, React, and Playwright official documentation.
- web.dev object-pooling guidance — retained only as implementation practice and explicitly constrained by profiling; it is not treated as a universal requirement.
