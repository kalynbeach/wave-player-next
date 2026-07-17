import { expect, test } from "bun:test";

import type {
  SignalFrame,
  SignalProvider,
} from "@/app/visualization/signal-provider";
import {
  type SignalRendererEnvironment,
  type SignalRendererStatus,
  WebGpuSignalRenderer,
} from "@/client/visualization/webgpu-signal-renderer";
import { DEFAULT_SIGNAL_SCENE_PARAMETERS } from "@/core/scene/signal-scene";

function createHarness(options: { configureFailure?: boolean } = {}) {
  const counts = {
    bufferDestroy: 0,
    cancelFrame: 0,
    configure: 0,
    deviceDestroy: 0,
    disconnectObserver: 0,
    frameRequests: 0,
    observe: 0,
    readFrame: 0,
    renderPasses: 0,
    submit: 0,
    unconfigure: 0,
  };
  let canvasConfigured = false;
  let failNextFrame = false;
  let frame: FrameRequestCallback | null = null;
  let resolveLost: (information: GPUDeviceLostInfo) => void = () => undefined;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    resolveLost = resolve;
  });
  const buffer = {
    destroy: () => {
      counts.bufferDestroy += 1;
    },
  } as unknown as GPUBuffer;
  const pass = {
    setPipeline: () => undefined,
    setVertexBuffer: () => undefined,
    draw: () => undefined,
    end: () => undefined,
  } as unknown as GPURenderPassEncoder;
  const device = {
    lost,
    queue: {
      writeBuffer: () => undefined,
      submit: () => {
        counts.submit += 1;
      },
    },
    createShaderModule: () => ({}) as GPUShaderModule,
    createRenderPipeline: () => ({}) as GPURenderPipeline,
    createBuffer: () => buffer,
    createCommandEncoder: () => ({
      beginRenderPass: () => {
        counts.renderPasses += 1;
        return pass;
      },
      finish: () => ({}) as GPUCommandBuffer,
    }),
    destroy: () => {
      counts.deviceDestroy += 1;
    },
  } as unknown as GPUDevice;
  const adapter = {
    requestDevice: async () => device,
  } as unknown as GPUAdapter;
  const gpu = {
    requestAdapter: async () => adapter,
    getPreferredCanvasFormat: () => "bgra8unorm" as GPUTextureFormat,
  } as unknown as GPU;
  const context = {
    configure: () => {
      counts.configure += 1;
      if (options.configureFailure) {
        throw new Error("test configure failure");
      }
      canvasConfigured = true;
    },
    unconfigure: () => {
      counts.unconfigure += 1;
      canvasConfigured = false;
    },
    getCurrentTexture: () => {
      if (failNextFrame || !canvasConfigured) {
        failNextFrame = false;
        throw new Error("canvas is not configured");
      }
      return { createView: () => ({}) as GPUTextureView } as GPUTexture;
    },
  } as unknown as GPUCanvasContext;
  let canvasWidth = 0;
  let canvasHeight = 0;
  const canvas = {
    clientWidth: 400,
    clientHeight: 560,
    get width() {
      return canvasWidth;
    },
    set width(value: number) {
      canvasWidth = value;
      canvasConfigured = false;
    },
    get height() {
      return canvasHeight;
    },
    set height(value: number) {
      canvasHeight = value;
      canvasConfigured = false;
    },
    getContext: (kind: string) => (kind === "webgpu" ? context : null),
  } as unknown as HTMLCanvasElement;
  const empty = new Float32Array(2_048);
  const signalFrame: SignalFrame = {
    timestampSeconds: 0,
    sampleRate: 48_000,
    left: empty,
    right: empty,
    mono: empty,
    frequencyBins: new Uint8Array(1_024),
    rms: 0,
    peak: 0,
  };
  const signalProvider: SignalProvider = {
    isAvailable: () => true,
    readFrame: () => {
      counts.readFrame += 1;
      return signalFrame;
    },
  };
  const environment: SignalRendererEnvironment = {
    gpu,
    vertexBufferUsage: 3,
    requestAnimationFrame: (callback) => {
      counts.frameRequests += 1;
      frame = callback;
      return counts.frameRequests;
    },
    cancelAnimationFrame: () => {
      counts.cancelFrame += 1;
    },
    createResizeObserver: () => ({
      observe: () => {
        counts.observe += 1;
      },
      disconnect: () => {
        counts.disconnectObserver += 1;
      },
    }),
    devicePixelRatio: () => 2,
  };

  return {
    canvas,
    counts,
    environment,
    failNextRender: () => {
      failNextFrame = true;
    },
    getFrame: () => frame,
    resolveLost,
    signalProvider,
  };
}

test("atomically cleans up when initial canvas configuration fails", async () => {
  const harness = createHarness({ configureFailure: true });
  const statuses: SignalRendererStatus[] = [];
  const renderer = await WebGpuSignalRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });

  expect(renderer).toBeNull();
  expect(statuses).toEqual([
    {
      state: "error",
      message: "The WebGPU device could not be initialized.",
    },
  ]);
  expect(harness.counts).toMatchObject({
    bufferDestroy: 1,
    configure: 1,
    deviceDestroy: 1,
    disconnectObserver: 1,
    observe: 0,
    unconfigure: 1,
  });
});

test("configures after backing-size changes before rendering a frame", async () => {
  const harness = createHarness();
  const statuses: SignalRendererStatus[] = [];
  const renderer = await WebGpuSignalRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });

  expect(harness.counts.configure).toBe(1);
  harness.getFrame()?.(16);
  expect(statuses).toEqual([{ state: "ready" }]);
  expect(harness.counts).toMatchObject({
    frameRequests: 2,
    readFrame: 1,
    renderPasses: 1,
    submit: 1,
  });

  renderer?.dispose();
});

test("reports a frame failure once and permanently stops scheduling", async () => {
  const harness = createHarness();
  const statuses: SignalRendererStatus[] = [];
  const renderer = await WebGpuSignalRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });

  harness.failNextRender();
  harness.getFrame()?.(16);
  renderer?.setActive(true);

  expect(statuses.at(-1)).toEqual({
    state: "error",
    message: "The WebGPU signal surface could not render a frame.",
  });
  expect(harness.counts.frameRequests).toBe(1);

  renderer?.dispose();
});

test("disposes every owned WebGPU lifecycle resource exactly once", async () => {
  const harness = createHarness();
  const statuses: SignalRendererStatus[] = [];
  const renderer = await WebGpuSignalRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });

  expect(renderer).not.toBeNull();
  expect(statuses).toEqual([{ state: "ready" }]);
  expect(harness.counts.frameRequests).toBe(1);

  renderer?.dispose();
  renderer?.dispose();

  expect(harness.counts).toMatchObject({
    bufferDestroy: 1,
    cancelFrame: 1,
    deviceDestroy: 1,
    disconnectObserver: 1,
    unconfigure: 1,
  });
});

test("cancels and permanently gates rendering when the device is lost", async () => {
  const harness = createHarness();
  const statuses: SignalRendererStatus[] = [];
  const renderer = await WebGpuSignalRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });
  const scheduledFrame = harness.getFrame();

  harness.resolveLost({
    message: "test device loss",
    reason: "unknown",
  } as GPUDeviceLostInfo);
  await Promise.resolve();
  scheduledFrame?.(16);
  renderer?.setActive(true);

  expect(statuses.at(-1)).toEqual({
    state: "error",
    message: "test device loss",
  });
  expect(harness.counts.cancelFrame).toBe(1);
  expect(harness.counts.frameRequests).toBe(1);
  expect(harness.counts.readFrame).toBe(0);
  expect(harness.counts).toMatchObject({
    bufferDestroy: 1,
    deviceDestroy: 1,
    disconnectObserver: 1,
    unconfigure: 1,
  });
  const countsAfterLoss = { ...harness.counts };

  renderer?.dispose();
  renderer?.dispose();
  expect(harness.counts).toEqual(countsAfterLoss);
});

test("cancels hidden-view frames and resumes with one scheduled frame", async () => {
  const harness = createHarness();
  const renderer = await WebGpuSignalRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_SIGNAL_SCENE_PARAMETERS,
    onStatus: () => undefined,
    environment: harness.environment,
  });
  const hiddenFrame = harness.getFrame();

  renderer?.setActive(false);
  hiddenFrame?.(16);

  expect(harness.counts.cancelFrame).toBe(1);
  expect(harness.counts.readFrame).toBe(0);
  expect(harness.counts.frameRequests).toBe(1);

  renderer?.setActive(true);
  expect(harness.counts.frameRequests).toBe(2);

  renderer?.setActive(false);
  renderer?.dispose();
  expect(harness.counts.cancelFrame).toBe(2);
});
