# WebGPU lifecycle architecture

> Research ticket: [Understand WebGPU lifecycle architecture](https://github.com/kalynbeach/wave-player-next/issues/4).
>
> Scope: browser WebGPU lifecycle only. This brief does not change the current playback/visualization boundary, scene model, or production code.

## Answer in brief

Wave Player Next should evolve from two self-contained WebGPU renderers into a **session-scoped WebGPU lifecycle module** owned by `BrowserVisualizationSession`. The module should own adapter/device acquisition with at most one current device, the shared canvas context/configuration, backing-size policy, one animation loop, error telemetry, device-loss recovery, and deterministic teardown; each scene should own only its scene-specific pipelines, buffers, textures, bind groups, update logic, and encoding.

This is an architectural judgment, not an API requirement. WebGPU permits either separate devices or a shared device, and canvas contexts are decoupled from devices. For this project, a session-scoped device removes adapter/device churn and duplicated lifecycle code while keeping the device-loss blast radius bounded to one visualization session. `BrowserVisualizationSession` must remain the shared-canvas serialization and generation authority: the lifecycle module is its subordinate resource owner, not a competing owner or app-global singleton.

## Evidence labels

- **Normative** means required or defined by the WebGPU specification.
- **Guidance/practice** means MDN, GPUWeb examples/design material, browser/vendor guidance, or established implementation technique; it is not a conformance rule.
- **Judgment** means the recommended Wave Player Next architecture inferred from the API and the repository's constraints.

## Subsystem mechanics

### Adapter and device

1. **Normative:** `navigator.gpu.requestAdapter()` selects an implementation at the user agent's discretion and can resolve to `null`. `powerPreference` is a hint, not a guarantee. `GPUAdapter.requestDevice()` rejects for an invalid request, while non-programming failures may yield an already-lost device. **Guidance/judgment:** register `device.lost` immediately for every acquired device so an already-lost result cannot escape observation. [WebGPU specification: `requestAdapter`](https://gpuweb.github.io/gpuweb/#dom-gpu-requestadapter), [WebGPU specification: `requestDevice`](https://gpuweb.github.io/gpuweb/#dom-gpuadapter-requestdevice), [MDN: `requestAdapter()`](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter), [MDN: `GPUDevice.lost`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)
2. **Normative:** features and limits are fixed when the device is requested, and operations are validated against the device's capabilities. **Judgment:** request only capabilities the renderer actually requires, after inspecting adapter capabilities. [WebGPU specification: adapters and devices](https://gpuweb.github.io/gpuweb/#adapters-devices)
3. **Guidance:** MDN warns that forcing `high-performance` can increase power use and device-loss incidence. The current renderers always request it, but Wave has no measurement showing that it is required. Default/no preference should be the target until a benchmark shows a visible regression. [MDN: `requestAdapter()` power preference](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter#powerpreference)
4. **Normative/design context:** the specification defines a device as the owner/root for its queue and created resources, with validation preventing incompatible cross-device use. The non-normative GPUWeb explainer adds the design context that canvas and device creation are decoupled and one device can support zero or more canvases. [WebGPU specification: devices](https://gpuweb.github.io/gpuweb/#devices), [WebGPU explainer: adapters and devices](https://gpuweb.github.io/gpuweb/explainer/#adapters-and-devices), [WebGPU explainer: canvas contexts](https://gpuweb.github.io/gpuweb/explainer/#canvas-contexts)

### Canvas context and configuration

1. **Normative:** obtain one `GPUCanvasContext` from the canvas, configure it with the chosen device and format, and call `getCurrentTexture()` only after configuration. Calling `getCurrentTexture()` while unconfigured throws `InvalidStateError`. [WebGPU specification: canvas context](https://gpuweb.github.io/gpuweb/#canvas-context), [MDN: `configure()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure), [MDN: `getCurrentTexture()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/getCurrentTexture)
2. **Guidance:** use `navigator.gpu.getPreferredCanvasFormat()` unless a measured requirement justifies another present format; MDN notes that another format may require an extra copy. Keep pipelines that target the canvas aligned with this format. [MDN: `configure()` format](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure#format)
3. **Normative:** `unconfigure()` removes the configuration and destroys textures previously returned by `getCurrentTexture()` for that configured context. Reconfiguration replaces presentation state. **Judgment:** no Wave scene may retain a current canvas texture/view across frames or across a handoff. [WebGPU specification: `unconfigure`](https://gpuweb.github.io/gpuweb/#dom-gpucanvascontext-unconfigure), [MDN: `unconfigure()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/unconfigure)
4. **Judgment:** exactly one module should configure/unconfigure Wave's shared canvas. Scene code should receive a current texture view (or an encoding callback that supplies it), never the context itself. This makes conflicting configuration impossible by construction.

### Resize

1. **Normative:** the canvas backing dimensions constrain the presentation texture and must fit the device's `maxTextureDimension2D`; invalid or excessive sizes produce WebGPU errors. A current canvas texture is transient and must not be retained through a backing-store replacement. [WebGPU specification: canvas context](https://gpuweb.github.io/gpuweb/#canvas-context), [WebGPU specification: supported limits](https://gpuweb.github.io/gpuweb/#supported-limits)
2. **Guidance/practice:** the official GPUWeb resize sample polls rendered CSS size, changes backing width/height only when needed, and obtains a fresh current texture per frame; it does not itself establish observer choice or device-limit clamping. For Wave, prefer `ResizeObserver` device-pixel content size when supported, with a CSS-size × DPR fallback, and clamp separately to device limits. [GPUWeb sample: Resize Canvas](https://webgpu.github.io/webgpu-samples/?sample=resizeCanvas), [GPUWeb samples source](https://github.com/webgpu/webgpu-samples), [MDN: `ResizeObserverEntry.devicePixelContentBoxSize`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/devicePixelContentBoxSize)
3. **Judgment:** Wave should keep its explicit pixel-ratio cap as a quality/performance policy, separately clamp to `maxTextureDimension2D`, and publish the effective backing size to the active scene. A zero-sized/hidden surface should pause drawing rather than allocate a nominal large resource; a 1×1 fallback is acceptable only where the browser requires nonzero configuration.
4. **Open implementation question:** the current code explicitly calls `configure()` again after a backing-size change, based on a real Safari failure recorded in `docs/phase-2b-implementation-report.md`. That is a defensible compatibility practice, but it should not be represented as a universal spec requirement. Retain it until a cross-browser experiment proves it unnecessary.

### Frame acquisition and submission

1. **Normative/guidance:** the specification says applications should acquire the current presentation texture in the same task that uses it; an expired texture becomes unusable. **Judgment:** Wave acquires and uses one current texture/view within each frame and never caches it across frames. [WebGPU specification: `getCurrentTexture`](https://gpuweb.github.io/gpuweb/#dom-gpucanvascontext-getcurrenttexture)
2. **Practice:** one `requestAnimationFrame` loop per visible surface is the simplest ownership rule. The official samples encode and submit one command buffer (or a bounded set) per display frame rather than creating independent loops for effects that share a surface. [GPUWeb samples](https://webgpu.github.io/webgpu-samples/)
3. **Judgment:** the lifecycle module should own the sole frame token. A scene implements `update(frameInput)` and `encode(frameContext)`; it does not schedule or cancel animation frames. `setActive(false)`, detach, terminal failure, device loss, and disposal must all make the loop unschedulable. Resume may create at most one frame token.

### Resources and disposal

1. **Normative/design rationale:** explicit `destroy()` exists for large GPU allocations because JavaScript garbage collection cannot see their GPU-process memory pressure. Using a destroyed buffer or texture is a validation error. [WebGPU explainer: early destruction](https://gpuweb.github.io/gpuweb/explainer/#early-destroy)
2. **Normative:** `GPUBuffer`, `GPUTexture`, and `GPUDevice` expose explicit destruction. Other handles such as pipelines, samplers, views, and bind groups are released by dropping references; destroying the device invalidates/releases its device-owned object graph. [WebGPU specification: `GPUDevice.destroy`](https://gpuweb.github.io/gpuweb/#dom-gpudevice-destroy), [MDN: `GPUDevice.destroy()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/destroy)
3. **Judgment:** every explicit allocation needs a named owner and an idempotent release path. Allocation should be transactional: build replacements in local variables, destroy the partial set on failure, then swap ownership and destroy the old set. Wave already follows this pattern for the feedback texture pair.
4. **Judgment:** normal scene switching should destroy scene buffers/textures but should not destroy the session device. Session detach/dispose must first mark the lifecycle terminal and invalidate its generation, then cancel frames, disconnect resize observation, dispose the active scene, unconfigure the context, remove error listeners, intentionally destroy the device, and clear references. Stale continuations lose authority before cleanup begins.

### Errors and device loss

1. **Normative:** many validation and allocation errors are asynchronous; a JavaScript `try/catch` around creation or frame encoding cannot capture all of them. Known fallible operations use `pushErrorScope()`/`popErrorScope()`. Errors not captured by a scope may surface through `uncapturederror`. [WebGPU specification: errors](https://gpuweb.github.io/gpuweb/#errors-and-debugging), [GPUWeb error-handling design](https://github.com/gpuweb/gpuweb/blob/main/design/ErrorHandling.md), [MDN: `uncapturederror`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/uncapturederror_event)
2. **Normative:** `device.lost` stays pending during the lifetime and resolves once loss occurs; it does not reject. Loss can happen at any time, including before `requestDevice()` returns. All resources from the old device must be recreated for a new device. Intentional `device.destroy()` resolves loss with reason `destroyed`. [WebGPU specification: device loss](https://gpuweb.github.io/gpuweb/#device-loss), [MDN: `GPUDevice.lost`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)
3. **Guidance:** transient loss should restart acquisition from `requestAdapter()`, not assume the old adapter remains valid. Do not retry intentional destruction, and avoid an unbounded rapid retry loop. [MDN: `GPUDevice.lost`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost), [WebGPU Device Loss best practices](https://toji.dev/webgpu-best-practices/device-loss.html)
4. **Judgment:** register `uncapturederror` for diagnostics and use scopes around shader/pipeline/resource construction when Wave must know whether activation succeeded. A `ready` status should mean required asynchronous scopes/pipeline creation have completed, not merely that synchronous handle creation returned.
5. **Judgment:** a device-loss callback captures the lifecycle generation. If still current and reason is not `destroyed`, it cancels the loop, releases scene resources/context ownership, reports `recovering` or a typed loss, and runs one serialized full reinitialization from adapter request. Failure becomes a stable error/unsupported snapshot with an explicit user retry path. A stale generation may only clean up its own resources; it must never change current status.

## Current Wave Player Next design

### Ownership and call path

- `createApplicationRuntime()` creates one long-lived `BrowserVisualizationSession`; React disposes it with the application runtime.
- `SceneVisualizer` attaches one canvas, forwards active/hidden state and semantic input, and renders session snapshots. React owns no GPU handles or frame loop.
- `BrowserVisualizationSession` owns scene state, surface attachment, renderer generation, and a serialized `#rendererWork` promise chain. It disposes the current renderer before queuing a replacement and rejects stale factories by generation/canvas identity.
- `VisualizationSceneRegistry` validates state and selects either `WebGpuSignalRenderer` or `WebGpuLightMachineRenderer`.
- Each renderer independently requests an adapter/device, obtains/configures the same canvas context, owns its own resize observer and animation loop, creates scene resources, handles `device.lost`, and unconfigures/destroys its context/resources/device.

### What is already strong

- The browser/session/app separation matches the architecture documents: playback is independent, React is thin, and visualization lifecycle is testable without catalog state.
- `BrowserVisualizationSession` correctly serializes asynchronous shared-canvas factory ownership. A stale renderer is disposed before the next renderer can configure the canvas; generation checks prevent stale status publication.
- Renderer disposal is idempotent and covers frame cancellation, observer disconnect, explicit buffer/texture destruction, context unconfiguration, and device destruction.
- Hidden views stop scheduling and resume with one loop.
- Feedback textures are capped by product policy and `maxTextureDimension2D`; pair replacement cleans up partial allocation and old ownership.
- Constructor/configuration failures and frame exceptions become contained renderer status rather than escaping the animation callback.
- Tests directly cover stale creation, shared-canvas ordering, activation recovery, initial configure failure, partial texture failure, resize replacement, device loss, one-loop behavior, and repeated disposal.

### Architectural debt and failure exposure

1. **Adapter/device churn:** every scene switch destroys a device and requests a new adapter/device even though the canvas/session is unchanged. This duplicates acquisition code and plausibly increases activation latency and resource churn, but the magnitude and any power/device-loss effect are unmeasured and require the stated benchmark.
2. **Duplicated surface lifecycle:** both renderers separately implement context acquisition/configuration, DPR resize, observer ownership, RAF scheduling, failure gates, loss handling, and teardown. The two implementations can drift.
3. **Insufficient asynchronous error visibility:** `try/catch` handles JavaScript exceptions but not the API's normal asynchronous validation/OOM channel. There are no error scopes or `uncapturederror` diagnostics. `ready` is emitted immediately after synchronous initialization.
4. **Terminal loss only:** device loss releases resources and reports an error, but the same attached session cannot recover without a renderer replacement triggered by another action.
5. **Coarse error taxonomy:** unsupported capability, invalid device request/programming error, validation, OOM, surface failure, device loss, and internal failure are compressed into a small string status. Diagnostics cannot reliably drive retry policy.
6. **Policy embedded in renderers:** high-performance preference, DPR cap, maximum feedback dimension, resize reconfiguration, and frame scheduling are lifecycle policies rather than scene behavior.
7. **Device ownership is too low:** destroying a scene destroys its device. This prevents reuse of pipelines/shared immutable assets and makes device-loss recovery a renderer concern instead of a session concern.

None of these findings conflicts with `BrowserVisualizationSession` as the serialization authority. They show that the session should delegate low-level mechanics to one owned module while retaining its existing authority.

## Lifecycle invariants for Wave

### Acquisition

- At most one acquisition/recovery transaction is current per session generation.
- `requestAdapter()` null is a supported/unsupported outcome, not an exception path to spin-retry.
- A device receives its `lost` and `uncapturederror` handlers before scene activation.
- Required features/limits are the union of the built-in scenes' proven needs; no optional feature is requested speculatively.
- `high-performance` is not requested without benchmark evidence.

### Context/configuration

- One attached canvas has one lifecycle owner and one active configuration.
- Only that owner calls `configure()`, `getCurrentTexture()`, or `unconfigure()`.
- Configuration device and canvas-target pipeline format always match.
- A current texture/view never escapes one frame.
- Scene replacement cannot overlap context configuration; the session generation remains the serialization token.

### Resize

- CSS/device-pixel size is sampled through one observer and converted by one policy.
- Dimensions are finite integers, at least the chosen nonzero minimum, capped by DPR policy and `maxTextureDimension2D` while preserving aspect ratio.
- No allocation occurs when effective dimensions are unchanged.
- Size-dependent scene resources are transactionally replaced; old resources stay owned until replacements succeed, then are destroyed exactly once.
- Resize and scene switch are serialized against disposal/device loss.

### Frame

- Zero or one RAF token exists per attached active session.
- The callback clears its token before doing work and checks generation, active, disposed/lost/failure, and usable size before reading signal data.
- One fresh current texture is acquired per rendered frame and not retained.
- Signal typed arrays are reused; per-frame GPU object/allocation churn is bounded.
- An exception or terminal asynchronous error stops rescheduling before status publication.

### Resource ownership

- Session resources: adapter reference, device, queue access, context/configuration, observer, RAF token, error handlers.
- Scene resources: pipelines, shader modules/references, buffers, textures, bind groups, samplers, CPU staging arrays, size-dependent targets.
- Explicitly destroy buffers/textures at replacement/disposal. Drop nondestroyable handles. Destroy the device only for session disposal, unrecoverable initialization rollback, or loss cleanup—not ordinary scene changes.
- Every disposal path is idempotent and safe after partial construction.

### Error and loss

- Known fallible activation/allocation is enclosed in balanced error scopes; unexpected errors are observable through `uncapturederror` diagnostics.
- Stale generations may not publish status or schedule recovery.
- Intentional `destroyed` loss does not recover.
- Nonintentional loss invalidates all scene resources, obtains a fresh adapter/device, reconfigures the existing context, and recreates the active scene from CPU-owned state.
- Recovery is bounded and cancellable; detach/dispose wins over pending recovery.
- Playback, signal provider identity, scene state, and preset state survive visualization device loss.

## Viable module patterns

| Pattern | Shape | Benefits | Costs/failure modes | Fit |
|---|---|---|---|---|
| Renderer-local lifecycle (current) | Each scene owns adapter through RAF | Simple standalone factories; failure isolation by device | repeated acquisition; duplicated code; scene switch destroys device; inconsistent policy; no shared recovery | Acceptable baseline, not target |
| Session-scoped lifecycle host | Session owns one `WebGpuLifecycle`; scenes are resource/encoding modules | one device/context/loop; bounded blast radius; fast switching; centralized errors, resize, loss and disposal | requires a scene contract redesign; one bad scene can lose the session device; replacement must be transactional | **Recommended** |
| App-global GPU service | One shared device and caches across sessions/canvases | maximum reuse; fewer devices; centralized capability negotiation | global loss blast radius; reference counting; cross-canvas scheduling; ownership leaks; premature for one canvas | Reject for now |
| Ref-counted device pool/leases | Service vends shared device leases, contexts remain local | future multi-surface reuse with explicit clients | complex lease invalidation and recovery; easy stale-resource bugs; little present value | Revisit only with a second real visualization surface |
| Keep devices local but extract helpers | Shared acquisition/resize/error utility used by current renderers | small migration and reduced duplication | still churns devices and splits loop/context authority; helper callbacks can obscure ownership | Useful intermediate step only |

A mature renderer often separates device/surface infrastructure from render-world resources, but the exact class graph is implementation practice. The normative API deliberately allows multiple components to own separate devices, and the GPUWeb explainer explicitly notes that possibility. Wave's single shared canvas and already-central session make the session-scoped choice project-specific rather than universal.

## Recommended target shape

```text
BrowserVisualizationSession                 existing authority
  ├─ renderer generation / serialized commands
  ├─ attached canvas, active scene/state, status
  └─ WebGpuLifecycle                        new subordinate owner
       ├─ adapter/device/error + loss recovery
       ├─ canvas context/configuration/size
       ├─ ResizeObserver + sole RAF token
       └─ ActiveSceneGpuResources           selected scene implementation
            ├─ initialize(device, format, size, state)
            ├─ resize(size)                 transactional
            ├─ setState(state)
            ├─ update(signalFrame, time)
            ├─ encode(encoder, targetView)
            └─ dispose()                    scene allocations only
```

Recommended sequencing for a future implementation ticket:

1. Define typed lifecycle status/diagnostics and a scene GPU-resource contract in the app/client boundary without changing playback or React ownership.
2. Extract resize computation and a single-loop scheduler with the existing environment injection style and tests.
3. Move adapter/device/context/error ownership into a client-only lifecycle host created and owned by `BrowserVisualizationSession`.
4. Adapt the signal scene, then the light-machine scene, keeping their shaders and visual behavior unchanged.
5. Add scoped async activation checks and uncaptured-error diagnostics.
6. Add bounded device-loss recovery that recreates the active scene from session-owned CPU state.
7. Remove renderer-owned adapter/device/context/observer/RAF only after the complete focused suite and real-browser checks pass.

Do not introduce an app-global GPU singleton, public plugin API, worker/offscreen rendering, Canvas2D fallback, or playback changes as part of that migration.

## Failure modes to design out

- **Two owners configure one canvas:** prevent by withholding `GPUCanvasContext` from scenes and retaining session serialization.
- **Stale async initialization wins:** generation-check before and after every await; stale work only disposes its local allocations.
- **False readiness:** await error scopes/async pipeline creation for required resources before publishing `ready`.
- **Unbounded loss loop:** classify `destroyed`, serialize recovery, cap automatic attempts, expose manual retry.
- **Old-device resource reuse:** recovery constructs a new scene resource graph; no GPU handle survives generation change.
- **OOM during resize:** clamp first, allocate replacements transactionally under an OOM scope, preserve or degrade from the last viable size, and report diagnostics.
- **Resize storm:** coalesce observations and apply the latest size at the frame/lifecycle boundary; do not allocate for every callback.
- **Hidden canvas burns GPU:** cancel RAF while inactive/zero-sized; do not destroy the session device merely because another card view is active.
- **Disposal races recovery:** disposal increments generation first, cancels frame/observer, then releases resources; every continuation checks generation.
- **Device sharing grows accidentally global:** keep lifecycle construction inside the visualization session until a second concurrent surface proves pooling is necessary.
- **Subscriber exception poisons lifecycle:** retain the session's current containment around status publication and keep cleanup independent of subscriber success.

## Architecture-sensitive fitness checks

### Unit/contract checks

1. Acquisition null/rejection/already-lost outcomes map to distinct typed statuses; no same-options retry loop.
2. One session requests one device across repeated signal/light-machine switches.
3. A scene never receives the canvas context and cannot configure/unconfigure it.
4. Rapid scene switches and detach during pending initialization leave exactly the latest generation active and dispose all stale local allocations.
5. One RAF token invariant holds across repeated active/inactive calls, resize, scene switches, failure, recovery, and disposal.
6. Backing-size calculation covers DPR, fractional CSS size, zero size, aspect-preserving device-limit clamps, no-op repeats, and resize storms.
7. Size-dependent replacement failure destroys only partial replacements and preserves a valid prior set or enters a defined degraded state.
8. Each buffer/texture is destroyed exactly once; context unconfigures once per session teardown/recovery; device destroy occurs on session teardown but not scene switch.
9. `destroyed` device loss does not recover; nonintentional loss requests a fresh adapter/device and rebuilds every active-scene resource.
10. Loss/recovery continuations after detach/dispose are silent and cannot publish status or schedule frames.
11. Scoped validation/OOM failures prevent `ready`; unexpected uncaptured errors enter diagnostics and follow the defined fatal/nonfatal policy.
12. Playback runtime, signal provider, active scene state, and preset state retain identity through scene switching and device recovery.

### Real-browser fitness checks

1. Chromium and Safari: initialize both scenes, switch repeatedly while audio plays, resize at all supported viewports, hide/show the visual card, detach/remount, and confirm one live loop with no console WebGPU errors.
2. Confirm whether explicit reconfiguration after canvas backing-size changes remains required on supported browser versions; retain the compatibility path unless all target browsers pass without it.
3. Trigger a real or browser-supported simulated device loss if available; otherwise instrument a development-only loss seam. Verify new adapter/device acquisition, complete scene-resource reconstruction, preserved playback/state, and no retry storm.
4. Run a 15–30 minute switch/resize stress test while recording activation latency, frame time, device-loss/error telemetry, and GPU memory if browser tools expose it. Compare the current per-scene-device baseline with the session-device target.
5. Verify default power preference versus `high-performance` on the primary macOS machine; retain the hint only if it provides a meaningful measured frame-time benefit without unacceptable power/loss cost.

## Precisely stated remaining experiment

The primary unresolved browser behavior is project-specific rather than normative:

> On the currently supported Chromium and Safari versions on the primary macOS machine, run each built-in scene for 120 seconds while changing the canvas CSS size and DPR-equivalent backing size at least 100 times, first with `context.configure()` only at initial device/context binding and then with reconfiguration after every backing-size change. Record `getCurrentTexture()` failures, uncaptured validation/OOM errors, visible blank frames, texture sizes, and frame-time percentiles. Keep resize reconfiguration if either browser shows any correctness failure without it; otherwise choose the lower-overhead path.

A second benchmark should compare default adapter selection with `powerPreference: "high-performance"` under the same scenes, but this is a performance/power decision and does not block the lifecycle boundary.

## Open uncertainties

- Browser support and implementation behavior continue to evolve; the primary source is an Editor's Draft. Pin the research date/target browser versions when turning this into implementation acceptance criteria.
- The best automatic recovery count and UI status vocabulary (`recovering`, `retryable-error`, diagnostics detail) are product choices not settled by WebGPU.
- Async pipeline creation and error-scope policy need a small implementation design: use async pipeline APIs where supported by the current TypeScript DOM types, and define which uncaptured errors are terminal versus telemetry-only.
- Actual GPU-memory and power savings from one session device are expected but unmeasured in Wave; the stress benchmark should quantify them.

## Sources

### Primary/normative

- [WebGPU specification](https://gpuweb.github.io/gpuweb/) — normative API algorithms, validity, errors, device loss, resources, limits, and canvas lifecycle.
- [WebGPU specification: adapters and devices](https://gpuweb.github.io/gpuweb/#adapters-devices) — adapter/device capabilities and ownership.
- [WebGPU specification: canvas context](https://gpuweb.github.io/gpuweb/#canvas-context) — configuration and current texture semantics.
- [WebGPU specification: errors and debugging](https://gpuweb.github.io/gpuweb/#errors-and-debugging) — asynchronous error model and scopes.
- [WebGPU specification: device loss](https://gpuweb.github.io/gpuweb/#device-loss) — loss semantics.

### Primary project/design practice

- [GPUWeb explainer](https://gpuweb.github.io/gpuweb/explainer/) — rationale for devices as resource roots, explicit destruction, canvas/device decoupling, and component-level device ownership.
- [GPUWeb error-handling design](https://github.com/gpuweb/gpuweb/blob/main/design/ErrorHandling.md) — design rationale and recovery/error-scope practice; useful context, not the normative source.
- [GPUWeb samples](https://webgpu.github.io/webgpu-samples/) and [source](https://github.com/webgpu/webgpu-samples) — official example practice, especially Resize Canvas.

### Browser documentation/guidance

- [MDN: `GPU.requestAdapter()`](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter) — adapter outcomes and power-preference caveats.
- [MDN: `GPUAdapter.requestDevice()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter/requestDevice) — device request behavior and capability negotiation.
- [MDN: `GPUDevice.lost`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost) — already-lost devices, transient recovery, and recreation requirement.
- [MDN: `GPUDevice.destroy()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/destroy) — intentional destruction.
- [MDN: `GPUCanvasContext.configure()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure) — configuration fields and preferred-format rationale.
- [MDN: `GPUCanvasContext.getCurrentTexture()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/getCurrentTexture) — configured-state requirement.
- [MDN: `GPUCanvasContext.unconfigure()`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/unconfigure) — configuration removal and texture destruction.
- [MDN: `GPUDevice` `uncapturederror`](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/uncapturederror_event) — unexpected error reporting.
- [WebGPU Device Loss best practices](https://toji.dev/webgpu-best-practices/device-loss.html) — browser implementer guidance on recovery architecture; practice, not normative behavior.

### Sources considered but not used as authority

- SEO tutorials and general WebGPU introductions were excluded because they add no authoritative lifecycle behavior.
- Historical GPUWeb swap-chain issues/design notes were excluded where the current specification now defines the behavior.
- Three.js/Babylon.js overview documentation was not used to infer normative behavior; their engine-scale global device/cache choices solve a larger problem than Wave's single canvas and are not direct evidence for this project's ownership boundary.
