import type { SignalProvider } from "@/app/visualization/signal-provider";
import type {
  VisualizationRenderer,
  VisualizationRendererStatus,
} from "@/app/visualization/visualization-session";
import {
  type LightMachinePalette,
  type LightMachineSceneParameters,
  parseLightMachineSceneParameters,
} from "@/core/scene/light-machine-scene";
import type { SceneState } from "@/core/scene/scene-registry";

const FEEDBACK_FORMAT: GPUTextureFormat = "rgba8unorm";
const MAX_FEEDBACK_DIMENSION = 2_048;
const UNIFORM_FLOAT_COUNT = 20;

const SYNTHESIS_SHADER = /* wgsl */ `
struct FrameUniforms {
  resolution: vec2f,
  time: f32,
  feedback: f32,
  rotation: f32,
  zoom: f32,
  symmetry: f32,
  base_hue: f32,
  hue_spread: f32,
  saturation: f32,
  color_cycle: f32,
  audio_modulation: f32,
  intensity: f32,
  rms: f32,
  peak: f32,
  bass: f32,
  mid: f32,
  treble: f32,
  signal_available: f32,
  padding: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var previous_frame: texture_2d<f32>;
@group(0) @binding(1) var feedback_sampler: sampler;
@group(0) @binding(2) var<uniform> frame: FrameUniforms;

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let position = positions[vertex_index];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}

fn hue_color(hue: f32, saturation: f32, value: f32) -> vec3f {
  let phase = abs(
    fract(vec3f(hue) + vec3f(0.0, 0.6666667, 0.3333333)) * 6.0 - vec3f(3.0)
  );
  let rgb = clamp(phase - vec3f(1.0), vec3f(0.0), vec3f(1.0));
  return mix(vec3f(1.0), rgb, vec3f(saturation)) * value;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let tau = 6.28318530718;
  let aspect = frame.resolution.x / max(frame.resolution.y, 1.0);
  var point = input.uv * 2.0 - vec2f(1.0);
  point.x *= aspect;

  let audio_rotation = frame.peak * frame.audio_modulation * 0.12;
  let angle = frame.rotation + audio_rotation;
  let sine = sin(angle);
  let cosine = cos(angle);
  let transformed = vec2f(
    cosine * point.x - sine * point.y,
    sine * point.x + cosine * point.y,
  ) / max(frame.zoom, 0.001);
  let radius = length(transformed);
  let polar_angle = atan2(transformed.y, transformed.x);
  let sector = tau / max(frame.symmetry, 1.0);
  let mirror = abs(fract(polar_angle / sector + 0.5) * 2.0 - 1.0);
  let folded_angle = mirror * sector * 0.5;
  var feedback_point = vec2f(cos(folded_angle), sin(folded_angle)) * radius;
  feedback_point.x /= aspect;
  let feedback_uv = feedback_point * 0.5 + vec2f(0.5);
  let inside = step(
    max(abs(feedback_uv.x - 0.5), abs(feedback_uv.y - 0.5)),
    0.499,
  );
  let previous = textureSampleLevel(
    previous_frame,
    feedback_sampler,
    clamp(feedback_uv, vec2f(0.001), vec2f(0.999)),
    0.0,
  ).rgb * inside;

  let audible = mix(0.08, 1.0, frame.signal_available);
  let bass_ring = exp(-abs(radius - (0.18 + frame.bass * 0.34)) * 20.0);
  let radial_wave = 0.5 + 0.5 * cos(
    radius * (22.0 + frame.treble * 18.0) - frame.time * (1.2 + frame.mid * 2.6),
  );
  let spoke_wave = pow(
    max(0.0, cos(folded_angle * frame.symmetry * 2.0 + frame.time * 0.32)),
    9.0,
  );
  let center_flash = exp(-radius * (5.0 + frame.peak * 6.0));
  let audio_energy = (
    0.12 + frame.rms * 2.8 + frame.peak * 0.9 + frame.bass * 0.7
  ) * frame.audio_modulation;
  let injection = (
    bass_ring * (0.25 + frame.bass) +
    radial_wave * spoke_wave * (0.22 + frame.mid) +
    center_flash * (0.12 + frame.peak)
  ) * (0.3 + audio_energy) * audible;
  let hue = fract(
    frame.base_hue +
    frame.hue_spread * (radius + folded_angle / sector) +
    frame.time * frame.color_cycle * 0.035 +
    frame.mid * 0.08
  );
  let generated = hue_color(
    hue,
    frame.saturation,
    injection * frame.intensity,
  );
  let decay = frame.feedback * (0.992 - frame.peak * 0.025);
  let combined = previous * decay + generated;
  let mapped = vec3f(1.0) - exp(-combined);
  return vec4f(mapped, 1.0);
}
`;

const DISPLAY_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var synthesized_frame: texture_2d<f32>;
@group(0) @binding(1) var frame_sampler: sampler;

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let position = positions[vertex_index];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSampleLevel(
    synthesized_frame,
    frame_sampler,
    input.uv,
    0.0,
  ).rgb;
  return vec4f(pow(color, vec3f(0.92)), 1.0);
}
`;

type PaletteValues = {
  baseHue: number;
  hueSpread: number;
  saturation: number;
};

const PALETTES: Record<LightMachinePalette, PaletteValues> = {
  electric: { baseHue: 0.53, hueSpread: 0.18, saturation: 0.86 },
  ember: { baseHue: 0.04, hueSpread: 0.12, saturation: 0.9 },
  ultraviolet: { baseHue: 0.78, hueSpread: 0.22, saturation: 0.82 },
};

export type LightMachineRendererEnvironment = {
  gpu: GPU;
  uniformBufferUsage: number;
  feedbackTextureUsage: number;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  createResizeObserver: (
    callback: ResizeObserverCallback,
  ) => Pick<ResizeObserver, "disconnect" | "observe">;
  devicePixelRatio: () => number;
  maxFeedbackDimension?: number;
};

function browserEnvironment(): LightMachineRendererEnvironment | null {
  if (!navigator.gpu) return null;

  return {
    gpu: navigator.gpu,
    uniformBufferUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    feedbackTextureUsage:
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
    createResizeObserver: (callback) => new ResizeObserver(callback),
    devicePixelRatio: () => window.devicePixelRatio || 1,
  };
}

export class WebGpuLightMachineRenderer implements VisualizationRenderer {
  static async create(options: {
    canvas: HTMLCanvasElement;
    signalProvider: SignalProvider;
    parameters: LightMachineSceneParameters;
    onStatus: (status: VisualizationRendererStatus) => void;
    environment?: LightMachineRendererEnvironment;
  }): Promise<WebGpuLightMachineRenderer | null> {
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
        message: "The light-machine surface cannot create a WebGPU context.",
      });
      return null;
    }

    let device: GPUDevice | null = null;

    try {
      device = await adapter.requestDevice();
      return new WebGpuLightMachineRenderer({
        ...options,
        context,
        device,
        environment,
      });
    } catch {
      device?.destroy();
      options.onStatus({
        state: "error",
        message: "The light-machine WebGPU renderer could not be initialized.",
      });
      return null;
    }
  }

  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #device: GPUDevice;
  readonly #displayPipeline: GPURenderPipeline;
  readonly #environment: LightMachineRendererEnvironment;
  readonly #format: GPUTextureFormat;
  readonly #onStatus: (status: VisualizationRendererStatus) => void;
  readonly #resizeObserver: Pick<ResizeObserver, "disconnect" | "observe">;
  readonly #sampler: GPUSampler;
  readonly #signalProvider: SignalProvider;
  readonly #synthesisPipeline: GPURenderPipeline;
  readonly #uniformBuffer: GPUBuffer;
  readonly #uniforms = new Float32Array(UNIFORM_FLOAT_COUNT);
  #active = true;
  #animationFrame: number | null = null;
  #deviceLost = false;
  #displayBindGroups: GPUBindGroup[] = [];
  #disposed = false;
  #feedbackBindGroups: GPUBindGroup[] = [];
  #feedbackTextures: GPUTexture[] = [];
  #parameters: LightMachineSceneParameters;
  #readTextureIndex = 0;

  private constructor(options: {
    canvas: HTMLCanvasElement;
    context: GPUCanvasContext;
    device: GPUDevice;
    signalProvider: SignalProvider;
    parameters: LightMachineSceneParameters;
    onStatus: (status: VisualizationRendererStatus) => void;
    environment: LightMachineRendererEnvironment;
  }) {
    this.#canvas = options.canvas;
    this.#context = options.context;
    this.#device = options.device;
    this.#environment = options.environment;
    this.#signalProvider = options.signalProvider;
    this.#parameters = parseLightMachineSceneParameters(options.parameters);
    this.#onStatus = options.onStatus;
    this.#format = this.#environment.gpu.getPreferredCanvasFormat();
    this.#context.configure({
      device: this.#device,
      format: this.#format,
      alphaMode: "opaque",
    });
    const synthesisShader = this.#device.createShaderModule({
      code: SYNTHESIS_SHADER,
    });
    const displayShader = this.#device.createShaderModule({
      code: DISPLAY_SHADER,
    });
    this.#synthesisPipeline = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: { module: synthesisShader, entryPoint: "vertex_main" },
      fragment: {
        module: synthesisShader,
        entryPoint: "fragment_main",
        targets: [{ format: FEEDBACK_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.#displayPipeline = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: { module: displayShader, entryPoint: "vertex_main" },
      fragment: {
        module: displayShader,
        entryPoint: "fragment_main",
        targets: [{ format: this.#format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.#sampler = this.#device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    this.#uniformBuffer = this.#device.createBuffer({
      size: this.#uniforms.byteLength,
      usage: this.#environment.uniformBufferUsage,
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

  setState(state: SceneState): void {
    if (state.sceneId !== "light-machine") {
      throw new Error(
        "The light-machine renderer received another scene state.",
      );
    }
    this.#parameters = parseLightMachineSceneParameters(state.parameters);
  }

  setActive(active: boolean): void {
    this.#active = active;
    if (active) {
      this.#scheduleFrame();
    } else {
      this.#cancelFrame();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelFrame();
    this.#resizeObserver.disconnect();
    this.#destroyFeedbackTextures();
    this.#uniformBuffer.destroy();
    this.#context.unconfigure();
    this.#device.destroy();
  }

  #scheduleFrame(): void {
    if (
      this.#disposed ||
      this.#deviceLost ||
      !this.#active ||
      this.#animationFrame !== null
    ) {
      return;
    }
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
    if (
      this.#disposed ||
      this.#deviceLost ||
      !this.#active ||
      this.#feedbackTextures.length !== 2
    ) {
      return;
    }

    const frame = this.#signalProvider.readFrame(timestamp / 1_000);
    this.#writeUniforms(timestamp / 1_000, frame);
    const writeTextureIndex = this.#readTextureIndex === 0 ? 1 : 0;
    const writeTexture = this.#feedbackTextures[writeTextureIndex];
    const feedbackBindGroup = this.#feedbackBindGroups[this.#readTextureIndex];
    const displayBindGroup = this.#displayBindGroups[writeTextureIndex];

    if (!writeTexture || !feedbackBindGroup || !displayBindGroup) {
      this.#scheduleFrame();
      return;
    }

    const encoder = this.#device.createCommandEncoder();
    const synthesisPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: writeTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    synthesisPass.setPipeline(this.#synthesisPipeline);
    synthesisPass.setBindGroup(0, feedbackBindGroup);
    synthesisPass.draw(3);
    synthesisPass.end();

    const displayPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: { r: 0.008, g: 0.008, b: 0.012, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    displayPass.setPipeline(this.#displayPipeline);
    displayPass.setBindGroup(0, displayBindGroup);
    displayPass.draw(3);
    displayPass.end();
    this.#device.queue.submit([encoder.finish()]);
    this.#readTextureIndex = writeTextureIndex;
    this.#scheduleFrame();
  };

  #writeUniforms(
    timestampSeconds: number,
    frame: ReturnType<SignalProvider["readFrame"]>,
  ): void {
    const palette = PALETTES[this.#parameters.palette];
    this.#uniforms[0] = this.#canvas.width;
    this.#uniforms[1] = this.#canvas.height;
    this.#uniforms[2] = timestampSeconds;
    this.#uniforms[3] = this.#parameters.feedback;
    this.#uniforms[4] = (this.#parameters.rotation * Math.PI) / 180;
    this.#uniforms[5] = this.#parameters.zoom;
    this.#uniforms[6] = this.#parameters.symmetry;
    this.#uniforms[7] = palette.baseHue;
    this.#uniforms[8] = palette.hueSpread;
    this.#uniforms[9] = palette.saturation;
    this.#uniforms[10] = this.#parameters.colorCycle;
    this.#uniforms[11] = this.#parameters.audioModulation;
    this.#uniforms[12] = this.#parameters.intensity;
    this.#uniforms[13] = frame.rms;
    this.#uniforms[14] = frame.peak;
    this.#uniforms[15] = this.#averageBins(frame.frequencyBins, 0, 0.08);
    this.#uniforms[16] = this.#averageBins(frame.frequencyBins, 0.08, 0.35);
    this.#uniforms[17] = this.#averageBins(frame.frequencyBins, 0.35, 0.8);
    this.#uniforms[18] = this.#signalProvider.isAvailable() ? 1 : 0;
    this.#uniforms[19] = 0;
    this.#device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniforms);
  }

  #averageBins(
    bins: Uint8Array<ArrayBuffer>,
    startRatio: number,
    endRatio: number,
  ): number {
    const start = Math.floor(bins.length * startRatio);
    const end = Math.max(start + 1, Math.floor(bins.length * endRatio));
    let total = 0;

    for (let index = start; index < end; index += 1) {
      total += bins[index] ?? 0;
    }

    return total / (end - start) / 255;
  }

  #resize(): void {
    const pixelRatio = Math.min(this.#environment.devicePixelRatio(), 2);
    const rawWidth = Math.max(1, this.#canvas.clientWidth * pixelRatio);
    const rawHeight = Math.max(1, this.#canvas.clientHeight * pixelRatio);
    const maximum = Math.min(
      this.#environment.maxFeedbackDimension ?? MAX_FEEDBACK_DIMENSION,
      this.#device.limits.maxTextureDimension2D,
    );
    const scale = Math.min(1, maximum / rawWidth, maximum / rawHeight);
    const width = Math.max(1, Math.round(rawWidth * scale));
    const height = Math.max(1, Math.round(rawHeight * scale));

    if (
      this.#canvas.width === width &&
      this.#canvas.height === height &&
      this.#feedbackTextures.length === 2
    ) {
      return;
    }
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    this.#createFeedbackTextures(width, height);
  }

  #createFeedbackTextures(width: number, height: number): void {
    this.#destroyFeedbackTextures();
    this.#feedbackTextures = [0, 1].map(() =>
      this.#device.createTexture({
        label: "light-machine-feedback",
        size: { width, height, depthOrArrayLayers: 1 },
        format: FEEDBACK_FORMAT,
        usage: this.#environment.feedbackTextureUsage,
      }),
    );
    const synthesisLayout = this.#synthesisPipeline.getBindGroupLayout(0);
    const displayLayout = this.#displayPipeline.getBindGroupLayout(0);
    this.#feedbackBindGroups = this.#feedbackTextures.map((texture) =>
      this.#device.createBindGroup({
        layout: synthesisLayout,
        entries: [
          { binding: 0, resource: texture.createView() },
          { binding: 1, resource: this.#sampler },
          { binding: 2, resource: { buffer: this.#uniformBuffer } },
        ],
      }),
    );
    this.#displayBindGroups = this.#feedbackTextures.map((texture) =>
      this.#device.createBindGroup({
        layout: displayLayout,
        entries: [
          { binding: 0, resource: texture.createView() },
          { binding: 1, resource: this.#sampler },
        ],
      }),
    );
    this.#readTextureIndex = 0;
  }

  #destroyFeedbackTextures(): void {
    for (const texture of this.#feedbackTextures) texture.destroy();
    this.#feedbackTextures = [];
    this.#feedbackBindGroups = [];
    this.#displayBindGroups = [];
  }
}
