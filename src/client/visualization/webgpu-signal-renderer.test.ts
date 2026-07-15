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

function createHarness() {
  const counts = {
    bufferDestroy: 0,
    cancelFrame: 0,
    deviceDestroy: 0,
    disconnectObserver: 0,
    frameRequests: 0,
    readFrame: 0,
    unconfigure: 0,
  };
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
  const device = {
    lost,
    queue: {
      writeBuffer: () => undefined,
      submit: () => undefined,
    },
    createShaderModule: () => ({}) as GPUShaderModule,
    createRenderPipeline: () => ({}) as GPURenderPipeline,
    createBuffer: () => buffer,
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
    configure: () => undefined,
    unconfigure: () => {
      counts.unconfigure += 1;
    },
  } as unknown as GPUCanvasContext;
  const canvas = {
    clientWidth: 400,
    clientHeight: 560,
    width: 0,
    height: 0,
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
      observe: () => undefined,
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
    getFrame: () => frame,
    resolveLost,
    signalProvider,
  };
}

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

  renderer?.dispose();
  expect(harness.counts.deviceDestroy).toBe(1);
});
