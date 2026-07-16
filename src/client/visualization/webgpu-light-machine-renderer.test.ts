import { expect, test } from "bun:test";

import type {
  SignalFrame,
  SignalProvider,
} from "@/app/visualization/signal-provider";
import type { VisualizationRendererStatus } from "@/app/visualization/visualization-session";
import {
  type LightMachineRendererEnvironment,
  WebGpuLightMachineRenderer,
} from "@/client/visualization/webgpu-light-machine-renderer";
import { DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS } from "@/core/scene/light-machine-scene";

function createHarness(options: { width?: number; height?: number } = {}) {
  const counts = {
    bufferDestroy: 0,
    cancelFrame: 0,
    deviceDestroy: 0,
    disconnectObserver: 0,
    frameRequests: 0,
    readFrame: 0,
    renderPasses: 0,
    submit: 0,
    textureCreate: 0,
    textureDestroy: 0,
    unconfigure: 0,
  };
  const textureSizes: Array<{ width: number; height: number }> = [];
  const uniformWrites: Float32Array[] = [];
  let frameCallback: FrameRequestCallback | null = null;
  let resizeCallback: ResizeObserverCallback | null = null;
  let resolveLost: (information: GPUDeviceLostInfo) => void = () => undefined;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    resolveLost = resolve;
  });
  const uniformBuffer = {
    destroy: () => {
      counts.bufferDestroy += 1;
    },
  } as unknown as GPUBuffer;
  const pipeline = {
    getBindGroupLayout: () => ({}) as GPUBindGroupLayout,
  } as unknown as GPURenderPipeline;
  const pass = {
    setPipeline: () => undefined,
    setBindGroup: () => undefined,
    draw: () => undefined,
    end: () => undefined,
  } as unknown as GPURenderPassEncoder;
  const device = {
    limits: { maxTextureDimension2D: 4_096 },
    lost,
    queue: {
      writeBuffer: (_buffer: GPUBuffer, _offset: number, data: Float32Array) =>
        uniformWrites.push(new Float32Array(data)),
      submit: () => {
        counts.submit += 1;
      },
    },
    createShaderModule: () => ({}) as GPUShaderModule,
    createRenderPipeline: () => pipeline,
    createSampler: () => ({}) as GPUSampler,
    createBuffer: () => uniformBuffer,
    createTexture: (descriptor: GPUTextureDescriptor) => {
      counts.textureCreate += 1;
      const size = descriptor.size as GPUExtent3DDict;
      textureSizes.push({
        width: size.width ?? 1,
        height: size.height ?? 1,
      });
      return {
        createView: () => ({}) as GPUTextureView,
        destroy: () => {
          counts.textureDestroy += 1;
        },
      } as unknown as GPUTexture;
    },
    createBindGroup: () => ({}) as GPUBindGroup,
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
    configure: () => undefined,
    unconfigure: () => {
      counts.unconfigure += 1;
    },
    getCurrentTexture: () => ({
      createView: () => ({}) as GPUTextureView,
    }),
  } as unknown as GPUCanvasContext;
  const canvas = {
    clientWidth: options.width ?? 5_000,
    clientHeight: options.height ?? 2_500,
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === "webgpu" ? context : null),
  } as unknown as HTMLCanvasElement;
  const bins = new Uint8Array(1_024);
  bins.fill(128);
  const empty = new Float32Array(2_048);
  const signalFrame: SignalFrame = {
    timestampSeconds: 0,
    sampleRate: 48_000,
    left: empty,
    right: empty,
    mono: empty,
    frequencyBins: bins,
    rms: 0.25,
    peak: 0.8,
  };
  const signalProvider: SignalProvider = {
    isAvailable: () => true,
    readFrame: () => {
      counts.readFrame += 1;
      return signalFrame;
    },
  };
  const environment: LightMachineRendererEnvironment = {
    gpu,
    uniformBufferUsage: 3,
    feedbackTextureUsage: 5,
    requestAnimationFrame: (callback) => {
      counts.frameRequests += 1;
      frameCallback = callback;
      return counts.frameRequests;
    },
    cancelAnimationFrame: () => {
      counts.cancelFrame += 1;
    },
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe: () => undefined,
        disconnect: () => {
          counts.disconnectObserver += 1;
        },
      };
    },
    devicePixelRatio: () => 2,
    maxFeedbackDimension: 1_024,
  };

  return {
    canvas,
    counts,
    environment,
    getFrame: () => frameCallback,
    resize: () => resizeCallback?.([], {} as ResizeObserver),
    resolveLost,
    signalProvider,
    textureSizes,
    uniformWrites,
  };
}

test("uses one loop and a capped two-texture feedback pair", async () => {
  const harness = createHarness();
  const statuses: VisualizationRendererStatus[] = [];
  const renderer = await WebGpuLightMachineRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });

  expect(renderer).not.toBeNull();
  expect(statuses).toEqual([{ state: "ready" }]);
  expect(harness.counts.textureCreate).toBe(2);
  expect(harness.textureSizes).toEqual([
    { width: 1_024, height: 512 },
    { width: 1_024, height: 512 },
  ]);
  expect(harness.counts.frameRequests).toBe(1);

  harness.getFrame()?.(1_000);
  expect(harness.counts).toMatchObject({
    readFrame: 1,
    renderPasses: 2,
    submit: 1,
    textureCreate: 2,
    frameRequests: 2,
  });
  expect(harness.uniformWrites[0]?.[13]).toBeCloseTo(0.25);
  expect(harness.uniformWrites[0]?.[14]).toBeCloseTo(0.8);
  expect(harness.uniformWrites[0]?.[15]).toBeGreaterThan(0.49);

  renderer?.setActive(false);
  expect(harness.counts.cancelFrame).toBe(1);
  renderer?.setActive(true);
  renderer?.setActive(true);
  expect(harness.counts.frameRequests).toBe(3);

  renderer?.dispose();
  renderer?.dispose();
  expect(harness.counts).toMatchObject({
    bufferDestroy: 1,
    cancelFrame: 2,
    deviceDestroy: 1,
    disconnectObserver: 1,
    textureDestroy: 2,
    unconfigure: 1,
  });
});

test("recreates and destroys one feedback pair when bounded size changes", async () => {
  const harness = createHarness({ width: 320, height: 480 });
  const renderer = await WebGpuLightMachineRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
    onStatus: () => undefined,
    environment: harness.environment,
  });

  expect(harness.counts.textureCreate).toBe(2);
  Object.assign(harness.canvas, { clientWidth: 800, clientHeight: 400 });
  harness.resize();
  expect(harness.counts.textureCreate).toBe(4);
  expect(harness.counts.textureDestroy).toBe(2);
  expect(harness.textureSizes.slice(-2)).toEqual([
    { width: 1_024, height: 512 },
    { width: 1_024, height: 512 },
  ]);
  harness.resize();
  expect(harness.counts.textureCreate).toBe(4);

  renderer?.dispose();
  expect(harness.counts.textureDestroy).toBe(4);
});

test("creates and renders the feedback pair when backing size already matches", async () => {
  const harness = createHarness({ width: 320, height: 480 });
  Object.assign(harness.canvas, { width: 640, height: 960 });
  const renderer = await WebGpuLightMachineRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
    onStatus: () => undefined,
    environment: harness.environment,
  });

  expect(harness.counts.textureCreate).toBe(2);
  expect(harness.counts.frameRequests).toBe(1);
  harness.getFrame()?.(16);
  expect(harness.counts).toMatchObject({
    readFrame: 1,
    renderPasses: 2,
    submit: 1,
  });
  renderer?.dispose();
});

test("stops scheduling on device loss and disposes resources once", async () => {
  const harness = createHarness({ width: 400, height: 560 });
  const statuses: VisualizationRendererStatus[] = [];
  const renderer = await WebGpuLightMachineRenderer.create({
    canvas: harness.canvas,
    signalProvider: harness.signalProvider,
    parameters: DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
    onStatus: (status) => statuses.push(status),
    environment: harness.environment,
  });
  const scheduledFrame = harness.getFrame();

  harness.resolveLost({
    message: "test light-machine device loss",
    reason: "unknown",
  } as GPUDeviceLostInfo);
  await Promise.resolve();
  scheduledFrame?.(16);
  renderer?.setActive(true);

  expect(statuses.at(-1)).toEqual({
    state: "error",
    message: "test light-machine device loss",
  });
  expect(harness.counts.cancelFrame).toBe(1);
  expect(harness.counts.frameRequests).toBe(1);
  expect(harness.counts.readFrame).toBe(0);

  renderer?.dispose();
  renderer?.dispose();
  expect(harness.counts).toMatchObject({
    bufferDestroy: 1,
    deviceDestroy: 1,
    textureDestroy: 2,
  });
});
