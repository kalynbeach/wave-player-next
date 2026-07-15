import type { SignalProvider } from "@/app/visualization/signal-provider";
import { SignalGeometry } from "@/client/visualization/signal-geometry";
import type { SignalSceneParameters } from "@/core/scene/signal-scene";

const SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
}

@vertex
fn vertex_main(
  @location(0) position: vec2f,
  @location(1) alpha: f32,
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.alpha = alpha;
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(0.48, 0.88, 0.98, input.alpha);
}
`;

export type SignalRendererStatus =
  | { state: "ready" }
  | { state: "unsupported"; message: string }
  | { state: "error"; message: string };

export type SignalRendererEnvironment = {
  gpu: GPU;
  vertexBufferUsage: number;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  createResizeObserver: (
    callback: ResizeObserverCallback,
  ) => Pick<ResizeObserver, "disconnect" | "observe">;
  devicePixelRatio: () => number;
};

function browserEnvironment(): SignalRendererEnvironment | null {
  if (!navigator.gpu) return null;

  return {
    gpu: navigator.gpu,
    vertexBufferUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
    createResizeObserver: (callback) => new ResizeObserver(callback),
    devicePixelRatio: () => window.devicePixelRatio || 1,
  };
}

export class WebGpuSignalRenderer {
  static async create(options: {
    canvas: HTMLCanvasElement;
    signalProvider: SignalProvider;
    parameters: SignalSceneParameters;
    onStatus: (status: SignalRendererStatus) => void;
    environment?: SignalRendererEnvironment;
  }): Promise<WebGpuSignalRenderer | null> {
    const environment = options.environment ?? browserEnvironment();

    if (!environment) {
      options.onStatus({
        state: "unsupported",
        message: "WebGPU is unavailable in this browser.",
      });
      return null;
    }

    const adapter = await environment.gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      options.onStatus({
        state: "unsupported",
        message: "No compatible WebGPU adapter was found.",
      });
      return null;
    }

    const context = options.canvas.getContext("webgpu");

    if (!context) {
      options.onStatus({
        state: "unsupported",
        message: "The visual surface cannot create a WebGPU context.",
      });
      return null;
    }

    let device: GPUDevice | null = null;

    try {
      device = await adapter.requestDevice();
      return new WebGpuSignalRenderer({
        ...options,
        context,
        device,
        environment,
      });
    } catch {
      device?.destroy();
      options.onStatus({
        state: "error",
        message: "The WebGPU device could not be initialized.",
      });
      return null;
    }
  }

  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #device: GPUDevice;
  readonly #environment: SignalRendererEnvironment;
  readonly #format: GPUTextureFormat;
  readonly #geometry = new SignalGeometry();
  readonly #onStatus: (status: SignalRendererStatus) => void;
  readonly #pipeline: GPURenderPipeline;
  readonly #resizeObserver: Pick<ResizeObserver, "disconnect" | "observe">;
  readonly #signalProvider: SignalProvider;
  readonly #vertexBuffer: GPUBuffer;
  #active = true;
  #animationFrame: number | null = null;
  #deviceLost = false;
  #disposed = false;
  #parameters: SignalSceneParameters;

  private constructor(options: {
    canvas: HTMLCanvasElement;
    context: GPUCanvasContext;
    device: GPUDevice;
    signalProvider: SignalProvider;
    parameters: SignalSceneParameters;
    onStatus: (status: SignalRendererStatus) => void;
    environment: SignalRendererEnvironment;
  }) {
    this.#canvas = options.canvas;
    this.#context = options.context;
    this.#device = options.device;
    this.#environment = options.environment;
    this.#signalProvider = options.signalProvider;
    this.#parameters = options.parameters;
    this.#onStatus = options.onStatus;
    this.#format = this.#environment.gpu.getPreferredCanvasFormat();
    this.#context.configure({
      device: this.#device,
      format: this.#format,
      alphaMode: "opaque",
    });
    const shader = this.#device.createShaderModule({ code: SHADER });
    this.#pipeline = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32" },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: "fragment_main",
        targets: [
          {
            format: this.#format,
            blend: {
              color: {
                operation: "add",
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
              },
              alpha: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    this.#vertexBuffer = this.#device.createBuffer({
      size: this.#geometry.vertices.byteLength,
      usage: this.#environment.vertexBufferUsage,
    });
    this.#resizeObserver = this.#environment.createResizeObserver(() =>
      this.#resize(),
    );
    this.#resizeObserver.observe(this.#canvas);
    this.#resize();
    this.#onStatus({ state: "ready" });
    void this.#device.lost.then((information) => {
      if (!this.#disposed) {
        this.#deviceLost = true;
        this.#cancelFrame();
        this.#onStatus({
          state: "error",
          message: information.message || "The WebGPU device was lost.",
        });
      }
    });
    this.#scheduleFrame();
  }

  setParameters(parameters: SignalSceneParameters): void {
    this.#parameters = parameters;
  }

  setActive(active: boolean): void {
    this.#active = active;
    if (active) this.#scheduleFrame();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelFrame();
    this.#resizeObserver.disconnect();
    this.#vertexBuffer.destroy();
    this.#context.unconfigure();
    this.#device.destroy();
  }

  #scheduleFrame(): void {
    if (
      this.#disposed ||
      this.#deviceLost ||
      !this.#active ||
      this.#animationFrame !== null
    )
      return;
    this.#animationFrame = this.#environment.requestAnimationFrame(
      this.#render,
    );
  }

  #cancelFrame(): void {
    if (this.#animationFrame === null) return;
    this.#environment.cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
  }

  readonly #render = (timestamp: number): void => {
    this.#animationFrame = null;
    if (this.#disposed || this.#deviceLost || !this.#active) return;

    const frame = this.#signalProvider.readFrame(timestamp / 1_000);
    const aspectRatio = this.#canvas.width / Math.max(this.#canvas.height, 1);
    this.#geometry.update(frame, this.#parameters, aspectRatio);
    const byteLength = this.#geometry.vertexCount * 12;
    this.#device.queue.writeBuffer(
      this.#vertexBuffer,
      0,
      this.#geometry.vertices.buffer,
      0,
      byteLength,
    );
    const encoder = this.#device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: { r: 0.018, g: 0.026, b: 0.03, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.#pipeline);
    pass.setVertexBuffer(0, this.#vertexBuffer);
    pass.draw(this.#geometry.vertexCount);
    pass.end();
    this.#device.queue.submit([encoder.finish()]);
    this.#scheduleFrame();
  };

  #resize(): void {
    const pixelRatio = Math.min(this.#environment.devicePixelRatio(), 2);
    const width = Math.max(
      1,
      Math.round(this.#canvas.clientWidth * pixelRatio),
    );
    const height = Math.max(
      1,
      Math.round(this.#canvas.clientHeight * pixelRatio),
    );

    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
  }
}
