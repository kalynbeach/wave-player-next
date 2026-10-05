// Disposable issue #15 experiment. No production runtime is changed.
import type { SignalProvider } from "@/app/visualization/signal-provider";
import type { VisualizationRenderer } from "@/app/visualization/visualization-session";
import { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import { VisualizationSceneRegistry } from "@/client/visualization/visualization-scene-registry";
import { WebGpuLightMachineRenderer } from "@/client/visualization/webgpu-light-machine-renderer";
import { WebGpuSignalRenderer } from "@/client/visualization/webgpu-signal-renderer";
import {
  LIGHT_MACHINE_SCENE_DEFINITION,
  type SceneId,
  SIGNAL_SCENE_DEFINITION,
} from "@/core/scene/scene-registry";

function element<T extends Element>(
  selector: string,
  expectedType: new (...args: never[]) => T,
): T {
  const value = document.querySelector(selector);
  if (!(value instanceof expectedType)) throw new Error(`Missing ${selector}`);
  return value;
}

const canvas = element("canvas", HTMLCanvasElement);
const status = element("#status", HTMLDivElement);
const resultsElement = element("#results", HTMLPreElement);
const smokeButton = element("#smoke", HTMLButtonElement);
const fullButton = element("#full", HTMLButtonElement);
const stopButton = element("#stop", HTMLButtonElement);
const nativeGpu = navigator.gpu;
const context = canvas.getContext("webgpu");
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
let stopped = false;

type Policy = {
  ownership: "renderer-local" | "session-shared";
  power: "default" | "high-performance";
  configure: "after-resize" | "initial-only";
};
type Activation = {
  scene: SceneId;
  firstUseOfScene: boolean;
  requestedAtMs: number;
  factoryStartedMs: number;
  factoryReadyMs: number | null;
  firstSubmitMs: number | null;
  firstGpuCompleteMs: number | null;
  frames: number;
  disposed: boolean;
};
type PixelSample = {
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  min: number;
  max: number;
  varying: boolean;
};
type Evidence = {
  label: string;
  kind: "switches" | "resize";
  round: number;
  policy: Policy;
  initialScene: SceneId;
  startedAt: string;
  elapsedMs: number;
  adapterInfo: Record<string, string>[];
  adapterMs: number[];
  deviceMs: number[];
  activations: Activation[];
  frameIntervalsMs: number[];
  frameCpuMs: number[];
  pixels: PixelSample[];
  errors: string[];
  warnings: string[];
  losses: { reason: string; intentional: boolean }[];
  configured: number;
  configureSkipped: number;
  unconfigured: number;
  controlledResizes: number;
  resizeCallbacks: number;
  sizeMismatches: number;
  devicesCreated: number;
  devicesDestroyed: number;
  buffersCreated: number;
  buffersDestroyed: number;
  texturesCreated: number;
  texturesDestroyed: number;
  readbacksCreated: number;
  readbacksDestroyed: number;
  maxLiveDevices: number;
  maxLiveBuffers: number;
  maxLiveTextures: number;
  maxLiveRenderers: number;
  maxConcurrentFactories: number;
  maxRafTokens: number;
  hiddenDuringRun: boolean;
  cleanup: {
    devices: number;
    buffers: number;
    textures: number;
    readbacks: number;
    renderers: number;
    rafTokens: number;
    observers: number;
    factories: number;
    configured: boolean;
  } | null;
};

const signal: SignalProvider = (() => {
  const left = new Float32Array(2048);
  const right = new Float32Array(2048);
  const mono = new Float32Array(2048);
  const frequencyBins = new Uint8Array(1024);
  const frame = {
    timestampSeconds: 0,
    sampleRate: 48000,
    left,
    right,
    mono,
    frequencyBins,
    rms: 0.35,
    peak: 0.65,
  };
  return {
    isAvailable: () => true,
    readFrame(timestampSeconds) {
      frame.timestampSeconds = timestampSeconds;
      for (let i = 0; i < left.length; i += 1) {
        left[i] = Math.sin(i / 34 + timestampSeconds) * 0.65;
        right[i] = Math.cos(i / 43 + timestampSeconds * 0.7) * 0.55;
        mono[i] = ((left[i] ?? 0) + (right[i] ?? 0)) / 2;
      }
      for (let i = 0; i < frequencyBins.length; i += 1) {
        frequencyBins[i] = Math.round(
          80 + 60 * Math.sin(i / 37 + timestampSeconds),
        );
      }
      return frame;
    },
  };
})();

function percentile(values: number[], fraction: number): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
    null
  );
}

function summarize(record: Evidence) {
  const repeats = record.activations.filter((item) => !item.firstUseOfScene);
  const latencies = repeats.flatMap((item) =>
    item.firstGpuCompleteMs === null
      ? []
      : [item.firstGpuCompleteMs - item.requestedAtMs],
  );
  return {
    label: record.label,
    policy: record.policy,
    kind: record.kind,
    round: record.round,
    elapsedMs: record.elapsedMs,
    activationCount: record.activations.length,
    repeatedSwitchMedianMs: percentile(latencies, 0.5),
    repeatedSwitchP95Ms: percentile(latencies, 0.95),
    frameMedianMs: percentile(record.frameIntervalsMs, 0.5),
    frameP95Ms: percentile(record.frameIntervalsMs, 0.95),
    cpuP95Ms: percentile(record.frameCpuMs, 0.95),
    pixelSamples: record.pixels.length,
    nonvaryingSamples: record.pixels.filter((pixel) => !pixel.varying).length,
    errors: record.errors,
    sizeMismatches: record.sizeMismatches,
    devicesCreated: record.devicesCreated,
    maxRafTokens: record.maxRafTokens,
    maxConcurrentFactories: record.maxConcurrentFactories,
    hiddenDuringRun: record.hiddenDuringRun,
    cleanup: record.cleanup,
  };
}

async function runCase(options: {
  label: string;
  kind: Evidence["kind"];
  round: number;
  policy: Policy;
  initialScene: SceneId;
  switches: number;
  holdFrames: number;
  resizeDurationMs: number;
  resizeCount: number;
}): Promise<Evidence> {
  if (!nativeGpu || !context)
    throw new Error("WebGPU is unavailable in this browser.");
  const record: Evidence = {
    label: options.label,
    kind: options.kind,
    round: options.round,
    policy: options.policy,
    initialScene: options.initialScene,
    startedAt: new Date().toISOString(),
    elapsedMs: 0,
    adapterInfo: [],
    adapterMs: [],
    deviceMs: [],
    activations: [],
    frameIntervalsMs: [],
    frameCpuMs: [],
    pixels: [],
    errors: [],
    warnings: [],
    losses: [],
    configured: 0,
    configureSkipped: 0,
    unconfigured: 0,
    controlledResizes: 0,
    resizeCallbacks: 0,
    sizeMismatches: 0,
    devicesCreated: 0,
    devicesDestroyed: 0,
    buffersCreated: 0,
    buffersDestroyed: 0,
    texturesCreated: 0,
    texturesDestroyed: 0,
    readbacksCreated: 0,
    readbacksDestroyed: 0,
    maxLiveDevices: 0,
    maxLiveBuffers: 0,
    maxLiveTextures: 0,
    maxLiveRenderers: 0,
    maxConcurrentFactories: 0,
    maxRafTokens: 0,
    hiddenDuringRun: document.hidden,
    cleanup: null,
  };
  const started = performance.now();
  let requestedAt = started;
  let active: Activation | null = null;
  let configured = false;
  let configuredDevice: GPUDevice | null = null;
  let lastTexture: GPUTexture | null = null;
  let captureNext = true;
  let pixelRatio = 1;
  let liveRenderers = 0;
  let liveObservers = 0;
  let factories = 0;
  let previousFrame: number | null = null;
  const rafTokens = new Set<number>();
  const pending = new Set<Promise<unknown>>();
  const deviceLosses: Promise<void>[] = [];
  const releases: (() => void)[] = [];
  let deviceForFactory: GPUDevice | null = null;
  const seenScenes = new Set<SceneId>();
  const originalConfigure = context.configure.bind(context);
  const originalUnconfigure = context.unconfigure.bind(context);
  const originalGetTexture = context.getCurrentTexture.bind(context);
  const onVisibility = () => {
    if (document.hidden) record.hiddenDuringRun = true;
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.style.width = "520px";
  canvas.style.height = "400px";

  function track(work: Promise<unknown>): void {
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }

  context.configure = (configuration) => {
    if (configured && options.policy.configure === "initial-only") {
      record.configureSkipped += 1;
      return;
    }
    originalConfigure({
      ...configuration,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    configured = true;
    configuredDevice = configuration.device;
    record.configured += 1;
  };
  context.unconfigure = () => {
    originalUnconfigure();
    configured = false;
    configuredDevice = null;
    lastTexture = null;
    record.unconfigured += 1;
  };
  context.getCurrentTexture = () => {
    const texture = originalGetTexture();
    if (texture.width !== canvas.width || texture.height !== canvas.height)
      record.sizeMismatches += 1;
    lastTexture = texture;
    return texture;
  };

  function instrumentDevice(device: GPUDevice): GPUDevice {
    record.devicesCreated += 1;
    record.maxLiveDevices = Math.max(
      record.maxLiveDevices,
      record.devicesCreated - record.devicesDestroyed,
    );
    const originalDestroy = device.destroy.bind(device);
    const createBuffer = device.createBuffer.bind(device);
    const createTexture = device.createTexture.bind(device);
    const submit = device.queue.submit.bind(device.queue);
    let destroyed = false;
    const release = () => {
      if (destroyed) return;
      destroyed = true;
      record.devicesDestroyed += 1;
      originalDestroy();
    };
    releases.push(release);
    device.destroy = () => {
      if (options.policy.ownership === "renderer-local") release();
    };
    device.addEventListener("uncapturederror", (event) =>
      record.errors.push(`GPU: ${event.error.message}`),
    );
    deviceLosses.push(
      device.lost.then((info) => {
        record.losses.push({ reason: info.reason, intentional: destroyed });
      }),
    );
    device.createBuffer = (descriptor) => {
      const buffer = createBuffer(descriptor);
      record.buffersCreated += 1;
      record.maxLiveBuffers = Math.max(
        record.maxLiveBuffers,
        record.buffersCreated - record.buffersDestroyed,
      );
      const destroy = buffer.destroy.bind(buffer);
      let released = false;
      buffer.destroy = () => {
        if (!released) {
          released = true;
          record.buffersDestroyed += 1;
          destroy();
        }
      };
      return buffer;
    };
    device.createTexture = (descriptor) => {
      const texture = createTexture(descriptor);
      record.texturesCreated += 1;
      record.maxLiveTextures = Math.max(
        record.maxLiveTextures,
        record.texturesCreated - record.texturesDestroyed,
      );
      const destroy = texture.destroy.bind(texture);
      let released = false;
      texture.destroy = () => {
        if (!released) {
          released = true;
          record.texturesDestroyed += 1;
          destroy();
        }
      };
      return texture;
    };
    device.queue.submit = (commands) => {
      submit(commands);
      const activation = active;
      if (activation && activation.firstSubmitMs === null) {
        activation.firstSubmitMs = performance.now();
        track(
          device.queue
            .onSubmittedWorkDone()
            .then(() => {
              activation.firstGpuCompleteMs = performance.now();
            })
            .catch((cause: unknown) => record.errors.push(String(cause))),
        );
      }
      if (captureNext && lastTexture && configuredDevice === device) {
        captureNext = false;
        const texture = lastTexture;
        const width = texture.width;
        const height = texture.height;
        const expectedWidth = canvas.width;
        const expectedHeight = canvas.height;
        const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
        const buffer = createBuffer({
          size: bytesPerRow * height,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        record.readbacksCreated += 1;
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer(
          { texture },
          { buffer, bytesPerRow },
          { width, height, depthOrArrayLayers: 1 },
        );
        submit([encoder.finish()]);
        track(
          buffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
              const bytes = new Uint8Array(buffer.getMappedRange());
              let min = 255;
              let max = 0;
              for (let y = 0; y < height; y += 3) {
                for (let x = 0; x < width; x += 3) {
                  const offset = y * bytesPerRow + x * 4;
                  for (let channel = 0; channel < 3; channel += 1) {
                    const value = bytes[offset + channel] ?? 0;
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                  }
                }
              }
              record.pixels.push({
                width,
                height,
                expectedWidth,
                expectedHeight,
                min,
                max,
                varying: max - min >= 8,
              });
              buffer.unmap();
            })
            .catch((cause: unknown) =>
              record.errors.push(`readback: ${String(cause)}`),
            )
            .finally(() => {
              buffer.destroy();
              record.readbacksDestroyed += 1;
            }),
        );
      }
    };
    return device;
  }

  let sharedAdapter: Promise<GPUAdapter | null> | null = null;
  let sharedDevice: Promise<GPUDevice> | null = null;
  async function acquireAdapter(): Promise<GPUAdapter | null> {
    const start = performance.now();
    const adapter = await nativeGpu.requestAdapter(
      options.policy.power === "default"
        ? {}
        : { powerPreference: "high-performance" },
    );
    record.adapterMs.push(performance.now() - start);
    if (!adapter) return null;
    record.adapterInfo.push({
      vendor: adapter.info.vendor,
      architecture: adapter.info.architecture,
      device: adapter.info.device,
      description: adapter.info.description,
    });
    return new Proxy(adapter, {
      get(target, property) {
        if (property === "requestDevice")
          return async () => {
            const acquire = async () => {
              const begin = performance.now();
              const device = await target.requestDevice();
              record.deviceMs.push(performance.now() - begin);
              return instrumentDevice(device);
            };
            let device: GPUDevice;
            if (options.policy.ownership === "renderer-local") {
              device = await acquire();
            } else {
              sharedDevice ??= acquire();
              device = await sharedDevice;
            }
            deviceForFactory = device;
            device.pushErrorScope("validation");
            device.pushErrorScope("out-of-memory");
            return device;
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  const gpu = new Proxy(nativeGpu, {
    get(target, property) {
      if (property === "requestAdapter")
        return () => {
          if (options.policy.ownership === "renderer-local")
            return acquireAdapter();
          sharedAdapter ??= acquireAdapter();
          return sharedAdapter;
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const environment = {
    gpu,
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = requestAnimationFrame((time) => {
        rafTokens.delete(id);
        if (previousFrame !== null)
          record.frameIntervalsMs.push(time - previousFrame);
        previousFrame = time;
        const begin = performance.now();
        callback(time);
        record.frameCpuMs.push(performance.now() - begin);
        if (active) active.frames += 1;
      });
      rafTokens.add(id);
      record.maxRafTokens = Math.max(record.maxRafTokens, rafTokens.size);
      return id;
    },
    cancelAnimationFrame(id: number) {
      cancelAnimationFrame(id);
      rafTokens.delete(id);
    },
    createResizeObserver(callback: ResizeObserverCallback) {
      liveObservers += 1;
      let disconnected = false;
      const observer = new ResizeObserver((entries, self) => {
        callback(entries, self);
        record.resizeCallbacks += 1;
        captureNext = true;
      });
      return {
        observe: observer.observe.bind(observer),
        disconnect() {
          if (!disconnected) {
            disconnected = true;
            liveObservers -= 1;
            observer.disconnect();
          }
        },
      };
    },
    devicePixelRatio: () => pixelRatio,
  };

  const registry = new VisualizationSceneRegistry(
    [SIGNAL_SCENE_DEFINITION, LIGHT_MACHINE_SCENE_DEFINITION].map(
      (definition) => ({
        scene: definition,
        async createRenderer(input) {
          factories += 1;
          record.maxConcurrentFactories = Math.max(
            record.maxConcurrentFactories,
            factories,
          );
          const activation: Activation = {
            scene: input.state.sceneId,
            firstUseOfScene: !seenScenes.has(input.state.sceneId),
            requestedAtMs: requestedAt,
            factoryStartedMs: performance.now(),
            factoryReadyMs: null,
            firstSubmitMs: null,
            firstGpuCompleteMs: null,
            frames: 0,
            disposed: false,
          };
          seenScenes.add(input.state.sceneId);
          record.activations.push(activation);
          active = activation;
          previousFrame = null;
          captureNext = true;
          try {
            const onStatus = (value: Parameters<typeof input.onStatus>[0]) => {
              if (value.state !== "ready")
                record.errors.push(`${value.state}: ${value.message}`);
              input.onStatus(value);
            };
            const renderer =
              input.state.sceneId === "signal"
                ? await WebGpuSignalRenderer.create({
                    ...input,
                    parameters: input.state.parameters,
                    onStatus,
                    environment: {
                      ...environment,
                      vertexBufferUsage:
                        GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
                    },
                  })
                : await WebGpuLightMachineRenderer.create({
                    ...input,
                    parameters: input.state.parameters,
                    onStatus,
                    environment: {
                      ...environment,
                      uniformBufferUsage:
                        GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
                      feedbackTextureUsage:
                        GPUTextureUsage.RENDER_ATTACHMENT |
                        GPUTextureUsage.TEXTURE_BINDING,
                    },
                  });
            activation.factoryReadyMs = performance.now();
            if (!renderer) return null;
            liveRenderers += 1;
            record.maxLiveRenderers = Math.max(
              record.maxLiveRenderers,
              liveRenderers,
            );
            const wrapped: VisualizationRenderer = {
              setState: (state) => renderer.setState(state),
              setActive: (value) => renderer.setActive(value),
              dispose() {
                if (activation.disposed) return;
                activation.disposed = true;
                liveRenderers -= 1;
                renderer.dispose();
              },
            };
            return wrapped;
          } finally {
            if (deviceForFactory) {
              const device = deviceForFactory;
              deviceForFactory = null;
              for (let i = 0; i < 2; i += 1) {
                track(
                  device
                    .popErrorScope()
                    .then((error) => {
                      if (error)
                        record.errors.push(
                          `initialization scope: ${error.message}`,
                        );
                    })
                    .catch((cause: unknown) =>
                      record.errors.push(`error scope: ${String(cause)}`),
                    ),
                );
              }
            }
            factories -= 1;
          }
        },
      }),
    ),
  );
  const session = new BrowserVisualizationSession({
    registry,
    signalProvider: signal,
    initialSceneId: options.initialScene,
  });

  async function waitForFrames(minimum: number): Promise<void> {
    const deadline = performance.now() + 10_000;
    while (
      !active ||
      active.frames < minimum ||
      active.firstGpuCompleteMs === null
    ) {
      if (stopped) throw new Error("Stopped by user.");
      if (record.errors.length) throw new Error(record.errors.at(-1));
      if (performance.now() > deadline)
        throw new Error("Renderer did not produce frames within ten seconds.");
      await sleep(10);
    }
  }

  try {
    session.attachSurface(canvas);
    await waitForFrames(options.holdFrames);
    if (options.kind === "switches") {
      for (let i = 0; i < options.switches; i += 1) {
        const previous: Activation | null = active;
        requestedAt = performance.now();
        session.selectScene(
          session.getSnapshot().scene.sceneId === "signal"
            ? "light-machine"
            : "signal",
        );
        const deadline = performance.now() + 10_000;
        while (active === previous) {
          if (performance.now() > deadline || stopped)
            throw new Error("Scene switch did not start.");
          await sleep(5);
        }
        await waitForFrames(options.holdFrames);
      }
    } else {
      const dimensions = [
        [420, 330],
        [640, 360],
        [288, 420],
        [800, 420],
        [520, 520],
      ];
      const ratios = [1, 1.25, 2, 1.5];
      const begin = performance.now();
      for (let i = 0; i < options.resizeCount; i += 1) {
        if (stopped) throw new Error("Stopped by user.");
        if (record.errors.length) throw new Error(record.errors.at(-1));
        const dimensionsAt = dimensions[i % dimensions.length];
        if (!dimensionsAt) throw new Error("Missing test dimensions.");
        pixelRatio = ratios[i % ratios.length] ?? 1;
        canvas.style.width = `${dimensionsAt[0]}px`;
        canvas.style.height = `${dimensionsAt[1]}px`;
        record.controlledResizes += 1;
        status.textContent = `${record.label}\nResize ${i + 1}/${options.resizeCount}. ${record.errors.length} errors. ${record.pixels.length} pixel samples.`;
        await sleep(
          Math.max(
            0,
            begin +
              ((i + 1) * options.resizeDurationMs) / options.resizeCount -
              performance.now(),
          ),
        );
      }
    }
    session.setActive(false);
    await Promise.allSettled([...pending]);
  } catch (cause) {
    record.errors.push(cause instanceof Error ? cause.message : String(cause));
  } finally {
    session.dispose();
    for (const release of releases) release();
    await Promise.race([
      Promise.allSettled([...pending, ...deviceLosses]),
      sleep(5000),
    ]);
    record.elapsedMs = performance.now() - started;
    record.cleanup = {
      devices: record.devicesCreated - record.devicesDestroyed,
      buffers: record.buffersCreated - record.buffersDestroyed,
      textures: record.texturesCreated - record.texturesDestroyed,
      readbacks: record.readbacksCreated - record.readbacksDestroyed,
      renderers: liveRenderers,
      rafTokens: rafTokens.size,
      observers: liveObservers,
      factories,
      configured,
    };
    context.configure = originalConfigure;
    context.unconfigure = originalUnconfigure;
    context.getCurrentTexture = originalGetTexture;
    document.removeEventListener("visibilitychange", onVisibility);
  }
  return record;
}

async function run(full: boolean): Promise<void> {
  stopped = false;
  smokeButton.disabled = true;
  fullButton.disabled = true;
  stopButton.disabled = false;
  const run = {
    protocol: "wave-gpu-lifecycle-v1",
    runId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    screen: {
      width: screen.width,
      height: screen.height,
      devicePixelRatio: window.devicePixelRatio,
    },
    cachePolicy:
      "No browser/driver cache reset. Per-case first scene uses are separated from repeated switches.",
    full,
    complete: false,
    records: [] as Evidence[],
    summary: [] as ReturnType<typeof summarize>[],
  };
  const policies: Policy[] = [
    {
      ownership: "renderer-local",
      power: "default",
      configure: "after-resize",
    },
    {
      ownership: "session-shared",
      power: "default",
      configure: "after-resize",
    },
    {
      ownership: "renderer-local",
      power: "high-performance",
      configure: "after-resize",
    },
    {
      ownership: "session-shared",
      power: "high-performance",
      configure: "after-resize",
    },
  ];
  async function save() {
    run.summary = run.records.map(summarize);
    resultsElement.textContent = JSON.stringify(
      { ...run, records: undefined },
      null,
      2,
    );
    const response = await fetch("/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(run),
    });
    if (!response.ok)
      throw new Error(
        "Evidence could not be saved by the local experiment server.",
      );
  }
  try {
    for (let round = 0; round < (full ? 3 : 1); round += 1) {
      const order = round % 2 === 0 ? policies : policies.toReversed();
      for (const policy of order) {
        if (stopped) break;
        const label = `Round ${round + 1}: ${policy.ownership}, ${policy.power}`;
        status.textContent = label;
        run.records.push(
          await runCase({
            label,
            kind: "switches",
            round,
            policy,
            initialScene: round % 2 === 0 ? "signal" : "light-machine",
            switches: full ? 20 : 2,
            holdFrames: full ? 30 : 5,
            resizeDurationMs: 0,
            resizeCount: 0,
          }),
        );
        await save();
      }
    }
    for (const scene of ["signal", "light-machine"] as const) {
      for (const configure of ["initial-only", "after-resize"] as const) {
        if (stopped) break;
        const label = `Resize: ${scene}, ${configure}`;
        status.textContent = label;
        run.records.push(
          await runCase({
            label,
            kind: "resize",
            round: 0,
            policy: {
              ownership: "renderer-local",
              power: "default",
              configure,
            },
            initialScene: scene,
            switches: 0,
            holdFrames: 10,
            resizeDurationMs: full ? 120_000 : 3000,
            resizeCount: full ? 100 : 5,
          }),
        );
        await save();
      }
    }
    run.complete = !stopped;
    await save();
    const errors = run.records.reduce(
      (sum, record) => sum + record.errors.length,
      0,
    );
    status.textContent = `${run.complete ? "Complete" : "Stopped"}. ${run.records.length} cases. ${errors} recorded errors. Evidence saved as wave-gpu-${run.runId}.json. All owned resources have been released; inspect cleanup counts below.`;
  } catch (cause) {
    status.textContent = `Experiment failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  } finally {
    smokeButton.disabled = false;
    fullButton.disabled = false;
    stopButton.disabled = true;
  }
}

smokeButton.addEventListener("click", () => void run(false));
fullButton.addEventListener("click", () => void run(true));
stopButton.addEventListener("click", () => {
  stopped = true;
  status.textContent = "Stopping and releasing resources…";
});
