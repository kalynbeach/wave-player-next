# Browser playback and Web Audio ownership

> Research ticket: [Understand browser playback and Web Audio ownership](https://github.com/kalynbeach/wave-player-next/issues/3)
> Parent map: [Find the target architecture for the Wave Player Next browser runtime](https://github.com/kalynbeach/wave-player-next/issues/2)
> Scope: architecture research only; no production refactoring or user-visible change.

## Answer in brief

Wave Player Next has chosen the right transport: one long-lived `HTMLAudioElement` is the browser's loading, decoding, seeking, buffering, and playback authority, while Web Audio is only an analysis and output-routing adjunct. The important ownership consequence is stronger than the current documentation states: after `createMediaElementSource(element)`, the element's audio is rerouted through that `AudioContext`, there is no standard detach/revert operation, and closing the context leaves connected media output ignored. Therefore the media element, its single media-element source binding, the mandatory audible route, the optional analysis branch, and the context lifecycle must be one browser-session ownership aggregate.

The current `HtmlMediaPlaybackRuntime` approximates that aggregate well: it owns the element and graph, builds the graph lazily during a play gesture, reuses one source node across track changes, calls `AudioContext.resume()` and `HTMLMediaElement.play()` before yielding, exposes analysis through a narrow provider, and disposes idempotently. Its largest architectural risks are not the basic graph. They are stale asynchronous play/resume outcomes across newer load, pause, or disposal intent; a shallow boolean capability model; missing `AudioContext.statechange`/interruption and output-error diagnostics; lossy error classification; and fire-and-forget context closure. These should be addressed inside a deeper browser playback module, not moved into React or visualization.

## Evidence labels

This brief uses three labels deliberately:

- **Normative** — required or defined by a Web specification.
- **Implementation practice** — behavior or architecture demonstrated by browser/vendor guidance or mature open-source code; useful but not a platform guarantee.
- **Architectural judgment** — the recommended Wave Player Next design derived from the evidence and project constraints.

## Subsystem mechanics

### 1. `HTMLMediaElement` remains transport authority

**Normative.** Calling `play()` returns a promise that fulfills when playback has started and rejects when playback cannot start, including `NotAllowedError` when policy blocks it and `NotSupportedError` for an unsupported source. The promise may remain pending while permission or other browser work completes. Calling `load()` resets the media element, aborts ongoing activity, and rejects pending play promises with `AbortError`; media lifecycle is reported through asynchronous media events. `currentTime`, `duration`, `paused`, `ended`, `readyState`, `networkState`, `buffered`, and `MediaError` are element-owned state. [HTML media elements](https://html.spec.whatwg.org/multipage/media.html) [MDN `play()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play) [MDN `load()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/load) [MDN `error`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/error)

**Architectural judgment.** Wave should continue deriving audible transport position and duration from the media element, not from `AudioContext.currentTime`, RAF time, or a duplicated application clock. Web Audio does not replace the media element's transport merely because the element is routed through an audio graph.

### 2. A media-element Web Audio binding changes output ownership

**Normative.** `createMediaElementSource(element)` creates a `MediaElementAudioSourceNode` associated with the element and reroutes the element's audio into that context's graph. Constructing another media-element source for an element that has already been used must throw `InvalidStateError`. The source's channel count follows the media channels. For media fetched without CORS authorization from another origin, the node must output silence. Calling `disconnect()` only removes node connections; the standard exposes no operation that restores the element's pre-Web-Audio output path or transfers it to another context. [Web Audio `MediaElementAudioSourceNode`](https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceNode) [Web Audio security/CORS requirement](https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceOptions-security) [open standards discussion of detachment](https://github.com/WebAudio/web-audio-api/issues/1202)

**Normative.** Closing an `AudioContext` releases its system resources, stops graph processing and `currentTime`, and cannot be reversed. It does not automatically release all JavaScript node objects. Media elements connected to a closed context have their output ignored. Suspending a context is reversible, but connected media element data is likewise ignored while suspended; the media transport itself is not thereby paused. [Web Audio `close()`](https://webaudio.github.io/web-audio-api/#dom-audiocontext-close) [Web Audio context lifetime](https://webaudio.github.io/web-audio-api/#lifetime-AudioContext)

**Architectural judgment.** Creating the media source is a one-way ownership commit, not an optional observer attachment. The owner that makes that call must also own an always-valid audible route to `context.destination`, the graph's failure policy, and final disposal of the element. A separately disposable “analysis plugin” must not create or close the binding behind the playback runtime.

### 3. Context construction, activation, and interruption are asynchronous policy surfaces

**Normative.** A newly constructed context starts with control/render state `suspended`; a user agent may allow it to start immediately, but may require sticky user activation. `resume()` resolves only after processing resumes, rejects if the context is closed, and may stay pending while start is not allowed. Context states are `suspended`, `running`, `closed`, and (in Web Audio 1.1) `interrupted`, with `statechange` events. Web Audio 1.1 also defines an `AudioContext` `error` event for output-device failures, although target-browser exposure must be feature-detected. Contexts are expensive and user agents may impose an implementation-defined maximum; the specification says more than one context per document is usually unnecessary. [Web Audio `AudioContext`](https://webaudio.github.io/web-audio-api/#AudioContext) [system resources](https://webaudio.github.io/web-audio-api/#system-resources-associated-with-baseaudiocontext-subclasses) [MDN `resume()`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume) [MDN `state`](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)

**Implementation practice.** Chrome recommends either creating the context in a user interaction or calling `resume()` after one, and checking actual context state rather than assuming autoplay. WebKit tells authors to treat each media element's play request as independently policy-controlled and to handle the play promise. Howler uses one global context, retries resume, tracks interrupted/suspending states, and optionally suspends after prolonged inactivity. These are practices, not cross-browser normative guarantees. [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay) [WebKit autoplay policy](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/) [Howler context lifecycle](https://github.com/goldfire/howler.js/blob/master/src/howler.core.js)

**Architectural judgment.** Wave's `play()` intent must carry activation provenance. For a trusted user command, graph creation/resume and `media.play()` should both be initiated synchronously before the first `await`. Automatic continuation such as ended-to-next may still attempt playback, but it must not claim fresh activation and must classify policy rejection as a recoverable outcome. No document-wide gesture listener or speculative autoplay is needed.

### 4. Web Audio and display clocks are different clocks

**Normative.** `AudioContext.currentTime` is the start of the next audio render quantum in the context's own time coordinate system. It advances monotonically only while the context runs and “may not be synchronized with other clocks.” `baseLatency` and `outputLatency` estimate different portions of output latency; `outputLatency` can change with platform/device. `getOutputTimestamp()` correlates context and performance clocks where supported, but does not redefine `HTMLMediaElement.currentTime`. [Web Audio `currentTime`](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-currenttime) [Web Audio latency and output timestamp](https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp)

**Normative.** `AnalyserNode` copies the current time-domain or frequency-domain analysis into caller-provided arrays. RAF timestamps are display-loop timestamps. Neither API says an analyser read is stamped with the media transport time. [Web Audio `AnalyserNode`](https://webaudio.github.io/web-audio-api/#AnalyserNode) [MDN analyser visualizer practice](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)

**Architectural judgment.** The current `SignalFrame.timestampSeconds` is populated from RAF and should be understood as `displayTimestampSeconds`, not transport or audio time. If scenes need seek-aware correlation, the playback aggregate should sample `media.currentTime` alongside each analyser read and expose it separately as `transportTimeSeconds`. Do not infer sample-accurate synchronization or compensate latency until a concrete feature and measurement require it.

### 5. Analysis is a capability, not transport truth

**Normative.** Web Audio provides analyser nodes and channel splitting, but capability and policy can fail independently of basic media playback. Cross-origin media transport may advance normally while a rerouted, unauthorized Web Audio source outputs silence; after source association this is not an audible native-output fallback. Context construction can fail at the user-agent limit; resume and output acquisition are asynchronous. [Web Audio specification](https://webaudio.github.io/web-audio-api/)

**Implementation practice.** wavesurfer's default backend keeps `HTMLMediaElement` playback independent and documents wrapping the underlying media element once when an application needs a Web Audio graph. Howler uses a centralized context and explicit HTML5 fallback, with lifecycle state and queues around asynchronous operations. Mature implementations also guard stale fetch/decode completion by comparing the current source. [wavesurfer Web Audio integration](https://wavesurfer.xyz/docs/web-audio/) [wavesurfer current Web Audio player](https://github.com/katspaugh/wavesurfer.js/blob/main/src/webaudio.ts) [Howler core](https://github.com/goldfire/howler.js/blob/master/src/howler.core.js)

**Architectural judgment.** Wave should retain graceful “playback without visualization analysis” only for failures that occur before media-source association. After the binding commits, output depends on the graph; a failed mandatory output route is a playback failure, not an analysis degradation. Optional analyser construction/attachment failures may degrade analysis while the mandatory output path remains audible.

## Current Wave Player Next design

### Ownership map

```text
React App effect
  owns ApplicationRuntime
    PlayerController
      owns PlaybackRuntime lifetime and source/user-intent orchestration
    HtmlMediaPlaybackRuntime
      owns one HTMLAudioElement
      lazily owns one AudioContext and one MediaElementAudioSourceNode
      owns output route and analyser branch
      owns WebAudioSignalProvider attachment
    BrowserVisualizationSession
      borrows SignalProvider; owns no playback/Web Audio resources
```

Relevant files:

- `src/client/app/app.tsx`
- `src/app/playback/player-controller.ts`
- `src/app/playback/playback-ports.ts`
- `src/client/playback/html-media-playback-runtime.ts`
- `src/client/playback/web-audio-signal-provider.ts`
- `src/client/visualization/browser-visualization-session.ts`
- `src/client/visualization/webgpu-signal-renderer.ts`
- `src/client/visualization/webgpu-light-machine-renderer.ts`

### What is already sound

1. **The transport choice matches the settled architecture.** The browser element owns loading, codec handling, buffering, seeking, eventing, and transport position; no custom decoder or AudioWorklet transport has leaked in.
2. **Resource ownership is mostly local.** `HtmlMediaPlaybackRuntime` creates the graph and also disconnects it, clears the media source, and closes the context. Visualization only reads a `SignalProvider`.
3. **Graph creation is lazy.** Initial render and restored selection do not allocate an expensive context or trigger autoplay.
4. **The source binding is reused.** Track changes mutate the same element's `src`; the implementation does not attempt a second `MediaElementAudioSourceNode` per track.
5. **Activation preserves the gesture stack.** `#ensureAudioGraph()` starts synchronously and reaches `resume()` before returning its promise; `media.play()` is then called before `Promise.all` awaits either operation. The focused test `invokes media play before a pending audio-context resume settles` protects this important behavior.
6. **The signal provider reuses typed arrays.** Each display frame updates stable buffers rather than allocating a new frame/arrays, matching the sustained-rendering requirement.
7. **Disposal is idempotent.** Runtime and controller both guard repeated disposal; media listeners and graph nodes have explicit removal/disconnection.
8. **Same-origin routing avoids the current CORS-silence trap.** The selected catalog location maps to `/media/:locationId` on the localhost origin.

### Gaps and failure modes

#### A. Stale asynchronous activation can mutate a newer source

`play()` has one global `#playActivationPending` flag and no source/operation generation. `load()` can run while an older `context.resume()` or `media.play()` is pending. A late rejection from the older request can pause the newly selected source and publish `error`; a late fulfillment can publish `playing` for the wrong intent. `load()` itself triggers the HTML algorithm that can reject an earlier play promise with `AbortError`, making this a normal race rather than an exotic one.

The `PlayerController` similarly awaits commands but does not serialize or invalidate them. Rapid select/next calls therefore rely on favorable browser completion order. Current tests cover ordinary selection and a single pending resume, but not load-vs-play, destroy-vs-play, or competing select races.

#### B. Capability state is too shallow

`analysisAvailable: boolean` conflates:

- graph never requested;
- graph initializing;
- context blocked/suspended/interrupted;
- Web Audio unsupported or context construction failed;
- mandatory graph/output failure;
- analyser branch failure;
- analyser attached and live;
- detached because disposed.

A boolean cannot support useful diagnostics or distinguish recoverable user activation from permanent degradation. `WebAudioSignalProvider.isAvailable()` means only “two analyser references are attached,” not “the context is running and emitting non-silent authorized data.”

#### C. Context state changes are unobserved

The runtime checks only `state === "suspended"` during play. It does not subscribe to `statechange`, expose `interrupted`, feature-detect the Web Audio 1.1 `error` event, diagnose unexpected `closed` or output-device failure, or reconcile analysis state when the UA suspends/interrupts processing. Because routed media output is ignored while the context cannot process, the media element can report logical playback while audible output and analysis are unavailable.

#### D. The graph fallback boundary is implicit and partly unsafe

The graph is assigned immediately after `createMediaElementSource()` and before output/analysis connections finish. The catch path distinguishes “assigned” only by context identity, then retries activation. This can recover some partial failures, but does not state the crucial invariant: once source association succeeds, native element output is no longer a valid fallback. A failure after that commit must preserve/repair the same graph or fail playback explicitly; closing it and claiming native playback degradation would risk permanent silence for that element.

The existing “graph creation fails” test throws inside `createMediaElementSource()`, before association, so it correctly proves pre-commit playback fallback but not any post-commit connection failure.

#### E. Error classification loses actionable facts

Only `NotAllowedError` is classified as `autoplay_blocked`; every other play/resume failure becomes `media_error`. Media element errors expose `MediaError.code`; context construction can throw `NotSupportedError`; `load()` can abort play with `AbortError`; resume can fail because a context is closed; graph association can throw `InvalidStateError`. Current snapshots omit browser exception name, media code, source revision, operation, recoverability, context state, ready/network state, and cause diagnostics.

#### F. Disposal is synchronous in type but asynchronous in fact

`destroy()` disconnects synchronously but ignores the `context.close()` promise. React cannot await an effect cleanup directly, so a Strict Mode remount or future runtime replacement can overlap closing and construction. Lazy construction makes the current Strict Mode path safer, but the ownership contract should still make asynchronous finalization observable to the composition root.

#### G. Timing terminology overclaims

Both renderers pass RAF time to `SignalProvider.readFrame`, and that value becomes `SignalFrame.timestampSeconds`. The design document calls a signal timestamp a transport timestamp, but the implementation value is a display timestamp. That distinction matters after seeks, suspension, background throttling, or if latency-aware visuals are added.

#### H. Channel semantics are heuristic

The provider treats a right frame with no sample above `0.000001` as mono and copies left into right. This is practical for mono media but also converts an intentionally silent right channel in stereo media into duplicated left data for visualization. Frequency bins are read only from the left analyser while time-domain mono is averaged. These are valid artistic choices only if named and tested; they are not browser-guaranteed channel metadata.

## Required ownership and lifecycle invariants

### Ownership

1. One session-scoped browser playback aggregate exclusively owns one media element.
2. That same aggregate exclusively owns the element's one media-source binding, context, mandatory output route, optional analysis nodes, context/media listeners, and final close.
3. The player application/controller owns the aggregate's lifetime and sequences product intent; React only constructs, subscribes, forwards commands, and requests disposal.
4. Visualization borrows immutable capability/signal views. It cannot resume, suspend, close, rewire, or recreate playback Web Audio resources.
5. A shared document `AudioContext` is not introduced until a second real audio subsystem needs one. If introduced later, a context host owns context policy while each playback aggregate still exclusively owns its media binding and graph branch; no child may close the shared context.

### Lifecycle and concurrency

1. Every desired transport change receives an operation revision. `load`, `unload`, and `dispose` also invalidate the source generation; `pause` must invalidate any pending activation for the same source.
2. Every asynchronous `play`, `resume`, and readiness outcome captures the relevant source and operation revisions. Stale fulfillment/rejection performs no state mutation, no pause, and no user-facing error.
3. At most one activation attempt is current. Duplicate play for the same source and desired-playing revision may share it; newer load, pause, unload, or disposal intent supersedes it.
4. Media events are reconciled against the current source and aggregate phase. Event arrival order is evidence, not the complete state machine.
5. Graph construction has an explicit commit point at successful media-source association. Before commit, analysis failure may fall back to ordinary element output. After commit, the same graph must maintain an audible route or playback fails explicitly.
6. Track changes reuse the element and binding. Recreating a source node per track is forbidden.
7. Disposal first marks the aggregate disposed and invalidates revisions, then stops event/state publication, pauses and clears the element, detaches consumers, disconnects nodes, removes listeners, closes the owned context, and reports finalization. It is idempotent.

### Timing

1. `media.currentTime` and media events are transport truth.
2. RAF timestamp is display time and is named as such.
3. `AudioContext.currentTime` is graph scheduling time and is not substituted for media time.
4. A signal frame may expose separately sampled display, transport, and (only if needed) context times. Their relationship is approximate unless a measured synchronization feature establishes otherwise.
5. Seeking immediately invalidates prior derived signal/transport correlation; the next frame samples the new media time.

### Capability

Use a discriminated capability state rather than one boolean. A minimal internal model is:

```text
not-requested
initializing
live { sampleRate, fftSize, channels/semantics, contextState }
degraded { reason, recoverable, playbackAudible }
blocked { reason: activation | interruption, contextState }
fatal { reason, diagnostics }
disposed
```

The external UI can continue mapping these states to its existing badge/messages. The richer state belongs in diagnostics and tests; it does not require a UI feature change.

### Failure

1. Separate product-facing messages from structured diagnostics.
2. Preserve operation (`load`, `play`, `resume-context`, `bind-source`, `connect-output`, `attach-analysis`, `dispose`), source revision/location, DOM exception name, `MediaError.code`, media ready/network state, context state, and recoverability where available.
3. Treat `AbortError` from a superseded load/play as cancellation, not a playback error.
4. Treat autoplay denial as recoverable only through a later trusted user command.
5. Treat analyser failure as degradation only when the mandatory output route is known valid.
6. Treat context closed unexpectedly or mandatory route failure as fatal for that aggregate.
7. Never infer that zero analyser samples prove CORS failure; current same-origin policy should be asserted independently.

### Disposal and energy

1. `close()` is final and belongs only to aggregate disposal, not pause, view hiding, track change, or temporary analysis inactivity.
2. Do not suspend the context merely because the visualization view is hidden; it carries audible output.
3. Optional idle suspension is viable only when the media element is paused/ended, all child use is idle, and the owner can serialize suspend/resume races. Howler demonstrates the practice, but Wave should add it only after measurement shows meaningful energy benefit.
4. Closing must be observable/awaitable by an outer disposal coordinator even if React's cleanup can only start it.

## Viable patterns and tradeoffs

### Pattern 1 — One deep playback aggregate per player session (recommended)

The aggregate owns media transport plus the irrevocably attached graph. It exposes a transport port, snapshots/diagnostics, and a read-only signal capability.

**Benefits:** strongest lifecycle locality; matches one current player; no shared-context coordination; easiest race and disposal tests; preserves current behavior.
**Costs:** playback adapter contains both media and Web Audio mechanics; future independent audio features may later require extracting a context host.
**Failure mode to avoid:** making the module shallow by leaking raw element/context/nodes to callers.

### Pattern 2 — Document-scoped context host plus per-player graph leases

A host owns one context, activation, interruption, idle suspension, and final close. Each player owns its media element and receives a graph lease but cannot close the context.

**Benefits:** appropriate when multiple concurrent players, metronome, preview bus, or effects need one context; follows the specification's single-context guidance and Howler practice.
**Costs:** more complex reference/intent accounting; context suspension affects every child; disposal becomes two-level; a shared context does not solve the irreversible element binding.
**Judgment:** premature for the current single player. Keep the aggregate's context creation injectable so this remains an evolution path, not current architecture.

### Pattern 3 — Playback owner plus separately attachable analysis plugin

An analysis service receives the element and calls `createMediaElementSource()`.

**Benefits:** superficially separates transport and visualization.
**Costs:** false optionality, split output ownership, no standard detach/rebind, dangerous close behavior, and hard failure ordering.
**Judgment:** reject. The analysis *consumer contract* should be separate; the source binding and audible graph must not be.

### Pattern 4 — `captureStream()` analysis tap

The media element remains on its ordinary output path and a captured media stream feeds Web Audio.

**Benefits:** conceptually avoids taking over the element's output route; the Web Audio specification itself points to capture streams where more flexibility is needed.
**Costs:** additional capability/interoperability surface, stream-track lifecycle, and different timing/behavior; not needed for same-origin local playback already proven through `MediaElementAudioSourceNode`.
**Judgment:** retain only as a precisely bounded experiment if post-binding failure behavior proves unacceptable in target Safari/Chromium/Firefox. Do not adopt speculatively.

### Pattern 5 — Decode to buffers and make Web Audio the transport

**Benefits:** sample-accurate scheduling and full graph control.
**Costs:** takes ownership of fetch, complete decode/memory, clock, seek, buffering, format behavior, and long-track lifecycle; contradicts the settled transport decision and prior project evidence.
**Judgment:** reject for normal playback. Deferred DSP/custom transport remains a constraint, not a reason to distort today's boundary.

## Project-specific recommendation

Keep `HTMLMediaElement` as the default transport and deepen the current runtime into a browser playback aggregate with this conceptual seam:

```text
Player application module
  -> BrowserPlaybackSession
       commands: load / play { activation provenance } / pause / seek / setVolume / dispose
       snapshot: transport + readiness + structured failure + diagnostics
       signal capability (read-only)
       owns:
         HTMLAudioElement
         source revision and activation operation
         lazy AudioContext
         one MediaElementAudioSourceNode
         mandatory output route
         optional analyser branch
         all media/context listeners

VisualizationSession
  -> borrows SignalCapability only
```

Recommended sequencing for the parent target-architecture plan:

1. **Specify behavior before refactoring.** Add deterministic race/failure/lifecycle tests around the existing runtime and controller. Preserve the public UI snapshot initially.
2. **Introduce operation revisions and structured diagnostics inside playback.** Make stale outcomes inert; distinguish cancellation, activation, media, graph, context, and analysis failures.
3. **Make graph construction explicitly commit-aware.** Construct optional downstream nodes first; create the media source once; establish the mandatory destination route immediately; attach optional analysis after audible routing. Define post-commit failure as playback-fatal unless the retained graph can be repaired.
4. **Observe context lifecycle.** Subscribe to `statechange`, feature-detect the Web Audio 1.1 `error` event, model interruption/suspension/closed/output-failure states, and reconcile the signal capability without giving visualization context control.
5. **Separate clocks in the signal contract.** Rename/display RAF time and optionally sample media time in the aggregate. Preserve stable buffers.
6. **Make disposal finalization trackable.** Keep idempotent synchronous quiescence, but expose or register the context-close promise with the application composition root.
7. **Only then deepen application orchestration.** Candidate 01 in `docs/architecture-review-20260725-224518.html` should own cross-command intent and runtime replacement, while the browser adapter retains browser-specific race correctness. Do not place browser policy in React.

This recommendation preserves selected track/volume/card-view persistence, current Play/Pause/seek/next/previous behavior, same-origin media URLs, and both visualization scenes. It does not require the WebGPU or scene candidates to change; they remain consumers constrained to the signal seam.

## Architecture-sensitive fitness checks

### Deterministic adapter tests

1. Start `play()` with deferred `resume()` and `media.play()`; call `load(B)`; reject/resolve A in every order. B remains current, is not paused, and receives no A error/status.
2. Start `play()` with deferred `resume()` and `media.play()`; call `pause()` before either settles. Late activation cannot restore `playing`, emit a user error, or undo the newer paused intent.
3. Start play, then dispose before promises settle. No listener notification or media/context call occurs after quiescence; close occurs exactly once.
4. Call rapid select A/B/C and next/previous with controlled completions. Final snapshot and audible source equal the latest accepted intent.
5. Make `load()` abort a pending play with `AbortError`. It is recorded as cancellation, not user-facing failure.
6. Inject failure at each graph step. Before source association, media playback remains usable with analysis degraded. After association, mandatory route failure is explicit and never reported as successful silent playback. Optional analyser failure preserves output.
7. Across many track changes, `createMediaElementSource` is called exactly once for the element.
8. Drive context states `suspended → running → interrupted → running → closed` and a feature-detected output `error`; capability and diagnostics follow each transition and stale resume results cannot overwrite them.
9. Verify mono, stereo, and intentionally silent-right fixtures. Channel semantics and left-only frequency policy are explicit.
10. Verify the signal provider returns the same frame/arrays on repeated reads and labels display versus transport timestamps correctly.
11. Repeated dispose calls remove every media/context listener, detach the provider, disconnect every owned node, clear the media source, and settle one close promise.

### Real-browser fitness checks

Run on current stable Safari/WebKit, Chromium, and Firefox on the primary macOS machine:

1. Fresh-profile trusted Play creates/resumes the graph and starts media. In a separate pristine document/origin with autoplay policy configured to block, scripted play must produce a recoverable activation result. If the test environment cannot force denial, mark this denial case unsupported/not run rather than accepting an allowed-play outcome as a pass.
2. Rapid track changes during initial load, pending play, buffering, and seek never play or report the stale track.
3. Same-origin WAV and MP3 remain audible and produce non-flat analyser data through Range responses.
4. Pause, ended auto-advance, seek, card-view switching, reload restoration, and React Strict Mode remount preserve current behavior.
5. Background/foreground, audio-device interruption if inducible, and sleep/wake report actual context state and recover on a defined user action without duplicate graph creation.
6. Disposal/remount repeated at least 100 times shows no monotonic growth in media/context listeners or simultaneously live contexts. No old analyser feeds a new visualization.
7. No console error/unhandled rejection occurs for expected cancellation or denied autoplay.

### Sustained-performance checks

1. Signal reads allocate no new frame or typed array per RAF frame.
2. Hiding visualization cancels rendering work but does not suspend audible playback or its graph.
3. A representative long track runs for at least 30 minutes with stable audible playback, analyser availability, and no monotonic heap/resource growth.
4. CPU/energy measurement compares the current always-running paused-context behavior with a serialized idle-suspend prototype before any idle policy is approved.

## Open uncertainties and required experiments

### Required experiment: interruption and post-binding failure matrix

One bounded browser experiment remains necessary before finalizing the migration plan because specifications define states but target-browser recovery details and failure inducibility vary:

- Browsers: latest stable Safari, Chromium, Firefox on macOS.
- One fresh media element per case; same-origin short WAV and MP3.
- Record media events/state (`paused`, `currentTime`, `readyState`, `networkState`, `error`), context `statechange` and feature-detected `error`, play/resume promise timing and exceptions, analyser non-zero status, and audible result.
- Cases: policy-forced denied first play then trusted retry; rapid `load(B)` or `pause()` while play/resume A is pending; background/foreground or available device interruption/output failure; close while paused and while playing; injected graph exception immediately before source association and at each connection immediately after association.
- Pass question: can every outcome be classified as cancellation, recoverable activation/interruption, analysis-only degradation with proven audible route, or aggregate-fatal without silent-success ambiguity?

This experiment should not mutate production code. A disposable page or browser-console harness is sufficient, with results attached to the later architecture proposal.

Other uncertainties:

- Web Audio 1.1 includes `interrupted`; deployed state exposure/recovery details still need confirmation in the exact target browser versions.
- The current mono-vs-silent-right heuristic is product behavior, not known channel metadata. Fixture review must decide whether to preserve it.
- There is no current requirement for multiple audio producers, so document-global context ownership is intentionally undecided until a real second owner exists.
- Precise acoustic/display synchronization has no current acceptance criterion. Latency compensation remains deferred until measured visual need exists.

## Sources

### Normative and explanatory primary sources

- [WHATWG HTML Standard — media elements](https://html.spec.whatwg.org/multipage/media.html)
- [Web Audio API 1.1](https://webaudio.github.io/web-audio-api/)
- [Web Audio — `AudioContext`](https://webaudio.github.io/web-audio-api/#AudioContext)
- [Web Audio — context lifetime and resources](https://webaudio.github.io/web-audio-api/#system-resources-associated-with-baseaudiocontext-subclasses)
- [Web Audio — `MediaElementAudioSourceNode`](https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceNode)
- [Web Audio — media-element source security](https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceOptions-security)
- [Web Audio — `AnalyserNode`](https://webaudio.github.io/web-audio-api/#AnalyserNode)
- [MDN — `HTMLMediaElement.play()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)
- [MDN — `HTMLMediaElement.load()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/load)
- [MDN — `AudioContext.resume()`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume)
- [MDN — `AudioContext.close()`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close)
- [MDN — `BaseAudioContext.state`](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)
- [MDN — autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [Chrome — autoplay policy](https://developer.chrome.com/blog/autoplay)
- [WebKit — autoplay policy changes](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)

### Mature implementation practice

- [Howler.js core source](https://github.com/goldfire/howler.js/blob/master/src/howler.core.js) — centralized context, unlock/resume, interruption, idle suspension, queues, and teardown practice.
- [wavesurfer.js Web Audio integration](https://wavesurfer.xyz/docs/web-audio/) — media-element default transport and one-time application graph wrapping.
- [wavesurfer.js Web Audio player source](https://github.com/katspaugh/wavesurfer.js/blob/main/src/webaudio.ts) — explicit ownership, stale-source guards, idempotent destroy, and context injection practice (its buffer transport is not recommended for Wave's normal playback).
- [Web Audio issue #1202](https://github.com/WebAudio/web-audio-api/issues/1202) — standards-repository evidence that media-element detachment is not exposed; informative, not normative.
