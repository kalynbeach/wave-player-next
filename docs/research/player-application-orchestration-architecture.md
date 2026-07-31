# Player application orchestration architecture

> Research ticket: [Understand player application orchestration](https://github.com/kalynbeach/wave-player-next/issues/6), part of [Find the target architecture for the Wave Player Next browser runtime](https://github.com/kalynbeach/wave-player-next/issues/2). This document is research and architectural guidance, not an implementation decision by itself.

## Executive recommendation

Create one framework-independent, deep `PlayerApplication` module in `src/app/` that owns the browser application's lifecycle, immutable application snapshot, user-intent commands, command ordering, cancellation, expected-failure policy, and device-local intent persistence. Inject narrow catalog, preset, playback, visualization, and session-persistence ports. Keep the React layer to composition, `useSyncExternalStore`, rendering snapshots, and forwarding commands.

Do not introduce Redux, XState, a generic command bus, event sourcing, or a package split now. Their mature contracts are useful design evidence, but the current product needs a small method-oriented application boundary. Commands should return typed, discriminated outcomes and also publish durable user-observable state; cancellation should be an expected non-error outcome. Persist app intent, not runtime mechanics.

The recommendation follows the repository's existing `core -> app <- adapters` dependency direction and uses the codebase-design vocabulary directly: pull orchestration complexity downward, hide temporal decomposition, provide a different abstraction at the application layer, and prefer a deep module over pass-through services and React callbacks that expose workflow order.

## Evidence labels

- **Authoritative fact / contract**: a platform specification, official framework/library contract, or the repository's settled architecture.
- **Mature practice**: a pattern demonstrated by a mature implementation or established architecture literature; useful evidence, not a requirement to adopt that library.
- **Project judgment**: the recommended choice for Wave Player Next based on current scope and code.

## 1. Subsystem mechanics

A browser player application coordinates several stateful systems with different clocks and failure domains:

1. The catalog and preset API performs request/response work and persists authoritative local-library data through the Bun host and SQLite.
2. The playback runtime wraps `HTMLMediaElement` and emits transport state independently of React.
3. The visualization session owns renderer and GPU lifecycle while consuming the playback signal-provider contract.
4. Device-local storage retains selected track, volume, and active card view across reloads.
5. React renders current state and originates user intent, but component mounts are not a suitable application lifecycle protocol.

The orchestration layer must turn those independent mechanisms into a coherent application protocol: initialize, restore, configure-and-scan, rescan, select and play, move through the queue, persist a preset, recover from expected failures, and dispose. A caller should not need to know the ordering of API calls, when catalog results become controller tracks, which operations supersede others, or which errors should be displayed.

**Authoritative fact / contract.** The repository architecture assigns user-intent commands, derived snapshots, restoration, persistence commands, cancellation, ordering, and lifecycle to `src/app/`; React adapters should be thin subscriptions and lifecycle bindings ([`docs/architecture.md`](../architecture.md)).

**Mature practice.** Fowler's Service Layer defines an application boundary as available operations that coordinate responses; a command-oriented interface can add uniform logging, transactions, and queuing but costs more interface machinery, so it is most justified at major subsystem boundaries ([Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html), [Command Oriented Interface](https://martinfowler.com/bliki/CommandOrientedInterface.html)).

**Project judgment.** `PlayerApplication` should be that major boundary, but ordinary typed methods are currently deeper than a generic `dispatch(Command)` API: method signatures preserve command-specific inputs and outcomes without a generic result registry or command-class ceremony.

## 2. Current Wave Player Next design

The foundations are already aligned with the target architecture:

- `PlayerController` in `src/app/playback/player-controller.ts` is framework-independent, exposes cached `getSnapshot`/`subscribe`, coordinates queue selection with `PlaybackRuntime`, restores `PlayerSession`, and owns runtime teardown.
- `PlaybackRuntime` and `PlayerSessionStore` are narrow ports in `src/app/playback/playback-ports.ts`.
- `BrowserPlayerSessionStore` validates malformed local storage and persists selected track, bounded volume, and active view under a versioned key.
- `LibraryService` and `ScenePresetService` keep server use cases behind repository and gateway ports; SQLite remains the authoritative owner for roots, catalog entities, and presets.
- `createApplicationRuntime` composes concrete browser adapters once, and the application test verifies playback runtime, signal-provider, and snapshot identity survive scene changes. It does not start playback or prove that a live `AudioContext` graph survives.

The main architectural gap is `ConnectedPlayer` in `src/client/app/app.tsx`. It currently owns:

- initial `Promise.all` ordering and a closure-only cancellation flag;
- root and preset state;
- global `busy`, `initialLoading`, and error state;
- configure-root-then-scan workflow;
- scan result reconciliation into `PlayerController`;
- preset save/update/sort policy;
- playback error translation;
- several promise-catching conventions.

That is temporal decomposition: the workflow is split according to UI callback timing rather than hidden behind the module that owns the application protocol. It creates information leakage and change amplification because React must know API sequencing, controller updates, visualization reads, persistence calls, and failure wording.

There are concrete contract risks:

- The inline `subscribe` closure passed to `useSyncExternalStore` has a new identity on each render. React documents that a changed subscribe function causes resubscription; a stable adapter method or memoized callback avoids it ([React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)).
- The initial-load `cancelled` boolean prevents React writes after cleanup but does not abort fetches or server work.
- A single `busy` bit conflates configure, scan, and preset save and cannot express overlap or command identity.
- `runTransportAction` deliberately discards the promise after a local catch; automatic `ended -> next()` is also fire-and-forget internally. Failures are not represented as a command outcome and can be difficult for non-React callers to observe.
- `PlayerSessionStore.save` can throw (for example storage restrictions or quota). Today that can make otherwise local transport/view intent fail according to adapter mechanics.
- `setActiveView` does not assert that the controller is active, unlike most commands.
- `PlayerController.select` persists and loads before awaiting play. If autoplay fails, selection is retained; that may be the correct product rule, but it is currently implicit rather than an outcome/failure-policy contract.

## 3. Ownership model

### Application state

`PlayerApplication` should own one immutable, cached `PlayerApplicationSnapshot` containing at least:

- lifecycle: `starting | ready | degraded | fatal | destroyed`;
- root and tracks/catalog projection;
- player snapshot (or the stable nested snapshot from `PlayerController`);
- preset list;
- active view;
- operation status by meaningful operation, not one global flag (for example `initialization`, `libraryMutation`, `presetSave`);
- the latest recoverable user-facing failure, with an operation/code/message and retry relevance.

The snapshot should change identity only when observable state changes. Repeated `getSnapshot()` calls must return the same object while unchanged, because React compares snapshots with `Object.is` and requires immutable cached snapshots. `subscribe` must return an unsubscribe function. These are authoritative React contracts ([React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)).

React should retain only ephemeral presentation state that has no product meaning, such as an open tooltip or uncommitted input text. Active card view, loading, catalog/preset results, and recoverable command failures are application state because another presentation must see the same behavior.

### Commands and outcomes

Expose intention-revealing methods, for example:

```ts
type CommandOutcome<Value = void> =
  | { status: "succeeded"; value: Value }
  | { status: "cancelled"; reason: "superseded" | "destroyed" | "caller" }
  | { status: "failed"; failure: ApplicationFailure };

interface PlayerApplication {
  getSnapshot(): PlayerApplicationSnapshot;
  subscribe(listener: () => void): () => void;
  start(options?: { signal?: AbortSignal }): Promise<CommandOutcome>;
  configureLibrary(path: string, options?: { signal?: AbortSignal }): Promise<CommandOutcome>;
  scanLibrary(options?: { signal?: AbortSignal }): Promise<CommandOutcome>;
  selectTrack(trackId: TrackId, options?: { signal?: AbortSignal }): Promise<CommandOutcome>;
  togglePlayback(options?: { signal?: AbortSignal }): Promise<CommandOutcome>;
  saveCurrentScenePreset(name: string, options?: { signal?: AbortSignal }): Promise<CommandOutcome<ScenePreset>>;
  destroy(): void;
}
```

The exact leaf API should follow implementation evidence. The important contract is that every async command settles to an observable outcome, expected failures are discriminated data, and the snapshot reflects any user-visible pending/failure state. Do not expose a generic command/event type until a second adapter or cross-cutting executor demonstrates that it simplifies the interface.

Fowler's command-query separation is useful as a naming and reasoning rule—queries read; commands modify observable state—while acknowledging that command results are pragmatic at an application boundary ([Command Query Separation](https://martinfowler.com/bliki/CommandQuerySeparation.html)). Redux likewise requires reducers to remain free of side effects and places async effects in middleware; Wave can preserve the same separation with explicit orchestration rather than adopting Redux ([Redux Style Guide](https://redux.js.org/style-guide/), [Redux side-effect approaches](https://redux.js.org/usage/side-effects-approaches)).

### Port ownership

Define ports at the application side, shaped around what orchestration needs:

- a catalog port for load/configure/scan whose async methods accept `AbortSignal`;
- a preset port for list/save with `AbortSignal`;
- a playback session port whose commands carry source/operation identity or enforce an equivalent serialization protocol, so stale browser-runtime completion cannot mutate a newer source;
- a browser-free visualization session port for scene snapshot, selection, preset/state commands, and lifecycle owned by the application;
- a separate client-only visualization surface port, implemented by the same browser adapter if convenient, for canvas attach/detach, active-view binding, and normalized performance input; React may use this surface port but does not own its disposal;
- a versioned session-intent store.

`WaveApiClient` is a client adapter that implements catalog and preset ports; it must not become an application dependency by concrete type. Server `LibraryService`/repositories continue to own SQLite workflows. Playback owns media mechanics and diagnostic transport state. Visualization owns scene/renderer/buffer lifecycle. The application owns cross-capability sequencing and policy, but not their internals.

This preserves a different abstraction at each layer. Avoid pass-through methods that merely duplicate the playback or visualization interface unless they add application policy, outcome normalization, ordering, or state integration.

### Persistence

Follow the repository's settled rule: persist application intent, not raw runtime internals.

- Browser-local: selected track ID, bounded volume, active view, and only later other proven device-local intent.
- SQLite: configured root, catalog entities, and scene presets through the Bun host.
- Never persist current playback time, buffering state, pending commands, errors, abort controllers, media elements, analyser nodes, or renderer/GPU state unless a separate product requirement is approved.

Keep a versioned, validated serialization boundary. Loading malformed or incompatible state should fall back safely. Device-local persistence failure should normally preserve the accepted in-memory command and publish a nonfatal diagnostic/warning rather than prevent playback; server persistence failure should fail the command and retain the last confirmed server snapshot. This distinction is project judgment and needs explicit tests.

XState's contract usefully distinguishes an emitted snapshot from a persisted snapshot and warns that restored state can be incompatible and must be serializable. It also notes that restoring machine state does not replay completed actions, while invocations restart ([XState persistence](https://stately.ai/docs/persistence)). Wave does not need actor persistence, but should retain that separation.

## 4. Cancellation and ordering

Use structured cancellation based on `AbortController`/`AbortSignal`, plus an operation generation/identity guard before committing results.

**Authoritative fact / contract.** An abortable promise API should accept `AbortSignal`, reject unsettled work with `signal.reason`, check an already-aborted signal, and remove/listen once for cleanup. A signal is single-use. `AbortSignal.any` and `timeout` can compose lifecycle, caller, and timeout cancellation ([MDN `AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal), [DOM Standard](https://dom.spec.whatwg.org/#interface-AbortSignal)).

**Project judgment.** Adapter ports follow that platform convention and reject with `signal.reason`. `PlayerApplication` is the policy boundary: it translates caller-signal abortion into `{ status: "cancelled", reason: "caller" }`, while preserving superseded and destroyed as distinct internal cancellation reasons. Single-flight initialization is lifecycle-owned; aborting one joined caller cancels only that caller's wait and does not cancel the shared initialization. Application destruction or an explicit superseding application command cancels the shared work.

Recommended policies:

- `destroy()` aborts all application-owned in-flight operations, unsubscribes child stores, disposes the playback and visualization sessions exactly once, and prevents future commands. The composition root constructs these children and invokes only `PlayerApplication.destroy()`; React surface effects attach/detach but do not dispose the shared visualization session.
- Initialization is single-flight. Repeated `start()` returns/joins the same work rather than issuing duplicate requests.
- Configure-and-scan is one user-intent command and supersedes stale initialization/library reads, but its publication cannot be called atomic until root/scan failure semantics are decided. Because root replacement currently commits before scanning, the snapshot must represent configured-but-unscanned state unless a later design adds a real rollback transaction.
- Manual scans should be take-leading/coalesced unless product behavior requires restart; two simultaneous scans against one root should not race repository reconciliation.
- Latest selection wins only when enforced on both sides of the seam. Application operation identity suppresses stale application publication, while the playback port must carry source/operation identity or serialize activation so stale browser-runtime completion cannot pause or publish against a newer source.
- Cancellation is not rendered as an error. It still returns `{status: "cancelled"}` so tests and non-React callers can observe it.
- Completion handlers must verify the operation is still current before publishing. Abort alone is insufficient because not every adapter or completed promise is cooperatively cancellable.

Redux Toolkit listener middleware is mature evidence for these semantics: it supplies an `AbortSignal`, `cancelActiveListeners`, cancellation-aware pauses, forked child tasks, and a discriminated task result of `ok | rejected | cancelled` ([listener middleware API](https://redux-toolkit.js.org/api/createListenerMiddleware)). XState actors similarly process messages sequentially, expose snapshots, stop invoked children with their parent lifecycle, and make completion/error observable ([XState actors](https://stately.ai/docs/actors)). Adopt the semantics, not the dependencies.

Client abort does not automatically prove server scan cancellation. The scanner and SQLite reconciliation need a safe cooperative boundary; cancellation must never leave a root indefinitely marked scanning or commit a partial catalog as complete.

## 5. Failure policy

Classify failures at the application boundary:

1. **Expected operational failure**: unavailable library, scan failure, rejected autoplay, media failure, or preset save failure. Return `failed`, publish a typed application failure, keep the application usable where possible, and provide retry through the same command.
2. **Cancellation**: superseded, destroyed, or caller-aborted. Return `cancelled`; do not publish a user error.
3. **Recoverable persistence degradation**: local session save failed. Preserve in-memory intent and publish diagnostics or a nonblocking warning.
4. **Invariant/programmer/contract failure**: impossible transition, command after destroy, malformed trusted adapter result. Throw or transition to `fatal`; do not relabel it as an ordinary user error.

Failure messages should be normalized once in the application module, not separately in React handlers. Preserve a typed cause/code for diagnostics without leaking filesystem, SQL, DOM, or HTTP implementation details. Clear failures by explicit policy (new relevant command, dismiss command, or successful retry), not incidentally on every interaction.

Ousterhout's design guidance recommends pulling complexity downward and reducing the number of places that handle exceptions; deep modules hide implementation knowledge behind a much simpler interface ([Stanford modular design notes](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)). Parnas's information-hiding criterion likewise decomposes around decisions likely to change rather than execution steps ([On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.umd.edu/class/spring2003/cmsc838p/Design/criteria.pdf)). The project-specific consequence is one failure/cancellation policy in `PlayerApplication`, not parallel policies in React callbacks.

## 6. Viable deep-module patterns

### A. Method-oriented application external store — recommended now

A class or factory closure exposes cached snapshot/subscription, typed commands, `start`, and `destroy`; internal helpers implement a reducer-like state transition and operation registry.

Advantages: smallest interface, strong TypeScript result types, no framework dependency, straightforward fakes, and incremental migration from `PlayerController`. Risks: an undisciplined class can become a god object; mitigate with narrow child modules and keep only cross-capability policy here.

### B. Reducer plus effect runner / typed command executor

Pure transitions produce effects that an executor runs through injected ports; resulting events feed the reducer. Advantages: deterministic transition tests, logging/replay opportunities, and explicit state machine. Risks: command/event/effect tax, pass-through types, and substantial interface complexity for today's small state space. Choose only if race behavior grows beyond clear local helpers.

### C. Actor/state-machine runtime

An application actor owns child actors for loading, playback, and visualization, with explicit invoked lifecycle and terminal outcomes. Advantages: rigorous concurrency, cancellation, visualization, and model-based tests. Risks: new runtime and vocabulary, serialized-event constraints, integration surface, and abstraction duplication with existing controllers. Reconsider if multiple concurrent long-lived workflows or formal transition auditing become a demonstrated need.

### D. React-owned hooks and callbacks — reject as target

This is expedient but exposes operation ordering across presentation callbacks, ties lifetime to React effects/Strict Mode, and cannot serve a future non-React presentation without copying policy. It is a shallow boundary, not an application layer.

## 7. Migration shape

A bounded implementation can proceed without production-wide redesign:

1. Define the playback source/operation identity or serialization seam needed for stale activation safety; application generation guards alone are insufficient.
2. Introduce browser-facing catalog/preset application ports and adapt `WaveApiClient` to them, including `AbortSignal` forwarding.
3. Separate the visualization application's browser-free session interface from its client-only canvas/surface interface, even if one concrete `BrowserVisualizationSession` implements both initially.
4. Add `PlayerApplication` above or by deepening `PlayerController`; preserve the controller as a playback/queue child only if that creates a genuinely different abstraction.
5. Move initial load, configure-and-scan, rescan, preset save/sort, active view, operation state, and failure normalization out of `ConnectedPlayer`.
6. Compose the application and its client surface adapter at the client composition root. React receives stable interfaces, uses one stable external-store adapter, forwards commands, and attaches/detaches the canvas; only the application owner disposes shared playback/visualization lifetime.
7. Keep server application services, SQLite repositories, renderer implementations, and user-visible UI behavior otherwise unchanged.

Avoid a second external store that merely mirrors `PlayerController`; either the application snapshot embeds/reuses its stable child snapshot or the deeper module assumes snapshot publication. Do not duplicate all runtime methods as pass-through methods.

## 8. Architecture-sensitive fitness checks

Add or preserve checks that fail when the boundary erodes:

1. **Import boundary:** the production import graph rooted in `src/app` modules contains no React, DOM, concrete HTTP, localStorage, SQLite, or WebGPU imports. Tests may import real outer adapters for integration evidence and the repository-wide Happy DOM preload is not treated as a production dependency.
2. **External-store contract:** repeated `getSnapshot()` is referentially equal until a real change; a change emits after the new snapshot is installed; unsubscribe is idempotent; React receives a stable `subscribe` function.
3. **Initialization:** `start()` is single-flight; partial API failure has a defined degraded/failed snapshot; destroy during each await yields `cancelled` and no later emission.
4. **Command outcomes:** every async command resolves to succeeded/failed/cancelled as specified; no unhandled rejection path, including automatic ended-to-next behavior.
5. **Race matrix:** configure during initialization, two scans, rapid select A/B, pause during pending activation, destroy during scan/save/play, playback end during manual next, and stale completion after a newer source/operation identity. Assertions cover both application snapshot publication and browser playback mutations.
6. **Persistence:** malformed/version-mismatched session falls back; each accepted intent persists exactly as policy states; localStorage throw degrades without undoing playback; failed server save does not appear confirmed.
7. **Failure policy:** cancellation never becomes a user alert; expected adapter errors become stable typed failures; invariant failures are not swallowed.
8. **Port substitution:** controller/application tests use narrow in-memory adapters; `WaveApiClient`, localStorage, and HTML media remain replaceable without React changes. Visualization application behavior and canvas attachment are substituted independently through browser-free session and client-only surface ports.
9. **Lifecycle:** Strict Mode mount behavior cannot create overlapping durable application work; application destroy is idempotent and is the sole owner of playback/visualization session disposal, while React surface cleanup only detaches its canvas binding.
10. **Existing product invariants:** scene changes retain one playback runtime/analysis graph; restored selection does not autoplay; unavailable restored tracks remain representable; volume remains bounded.

These checks align with the repository's testing strategy: observable behavior over private details, small typed fakes for browser boundaries, real SQLite/filesystem/Bun integration at infrastructure boundaries, and explicit race/cancellation/disposal coverage ([`docs/testing-strategy.md`](../testing-strategy.md)).

## 9. Tradeoffs and common failure modes

- **God application object:** centralizing every capability can increase cognitive load. Counter by centralizing only cross-module policy and keeping playback, visualization, and catalog mechanics deep in their owners.
- **Shallow facade:** a `PlayerApplication` that only forwards twenty runtime methods adds a layer without abstraction. Each exposed command must express user intent or application policy.
- **Snapshot churn/tearing:** constructing snapshots in `getSnapshot` violates React's cached snapshot contract and can loop. Commit one immutable snapshot before notification.
- **Global busy/error flags:** they erase operation identity and make safe concurrency impossible. Model only meaningful operation lanes.
- **Abort theater:** setting a boolean or aborting fetch while accepting stale completion is not cancellation. Combine cooperative signals with generation checks.
- **Cancellation as failure:** user navigation or supersession should not show an error.
- **Hidden fire-and-forget:** discarded promises make outcomes untestable. Internal event reactions must publish terminal state/outcome.
- **Persisting runtime snapshots:** media/GPU/internal actor state is incompatible across reloads and leaks adapter mechanics. Persist stable intent only.
- **Overengineering commands:** generic buses, middleware chains, or serialized events create more interface than functionality at current scale.
- **Optimistic server authority:** presenting a preset or root as saved before SQLite confirms it can create false state. Keep last confirmed state unless an explicit optimistic rollback protocol exists.

## 10. Open uncertainties and required experiment

1. **Bun cancellation propagation is not established by current evidence.** Run a focused experiment against the pinned Bun version: start a real long-running `/api/library/scan`, abort client `fetch`, observe `request.signal` on the server, and verify whether scanner work stops. Then add cooperative signal checks before filesystem batches and before the bounded reconciliation transaction. Assert that cancellation either leaves the prior complete catalog intact with a non-running root status or completes reconciliation consistently; never leave `scanning` stuck. This experiment is necessary before claiming end-to-end scan cancellation.
2. Determine whether configure-root failure after root replacement but before scan should retain the new empty root, roll back root configuration, or report a configured-but-unscanned state. Current HTTP sequencing makes this product policy visible.
3. Decide whether autoplay rejection means `selectTrack` is a failed command with retained selection, or a successful selection plus playback warning. The current code retains selection; tests should encode the chosen semantic explicitly.
4. Decide whether session-persistence degradation is user-visible or diagnostics-only. The recommendation is nonblocking warning/diagnostic, but product language is unsettled.
5. If SSR/hydration becomes real, define `getServerSnapshot`; the current browser-only application can intentionally omit it.

## Primary sources

### Authoritative contracts and repository facts

- Wave Player Next architecture: [`docs/architecture.md`](../architecture.md)
- Wave Player Next testing strategy: [`docs/testing-strategy.md`](../testing-strategy.md)
- React, `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- WHATWG DOM, `AbortSignal`: https://dom.spec.whatwg.org/#interface-AbortSignal
- MDN, implementing abortable APIs: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- Redux Style Guide: https://redux.js.org/style-guide/
- Redux Toolkit listener middleware: https://redux-toolkit.js.org/api/createListenerMiddleware
- XState actors: https://stately.ai/docs/actors
- XState persistence: https://stately.ai/docs/persistence

### Architecture literature and mature practice

- David Parnas, “On the Criteria To Be Used in Decomposing Systems into Modules”: https://www.cs.umd.edu/class/spring2003/cmsc838p/Design/criteria.pdf
- John Ousterhout, Stanford modular design notes: https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign
- Martin Fowler, Service Layer: https://martinfowler.com/eaaCatalog/serviceLayer.html
- Martin Fowler, Command Oriented Interface: https://martinfowler.com/bliki/CommandOrientedInterface.html
- Martin Fowler, Command Query Separation: https://martinfowler.com/bliki/CommandQuerySeparation.html
- Martin Fowler, Repository: https://martinfowler.com/eaaCatalog/repository.html
