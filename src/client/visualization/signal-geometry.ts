import type { SignalFrame } from "@/app/visualization/signal-provider";
import type { SignalSceneParameters } from "@/core/scene/signal-scene";

const MAX_TRAILS = 10;
const SAMPLE_COUNT = 256;
const POSITION_STRIDE = SAMPLE_COUNT * 2;
const FLOATS_PER_VERTEX = 3;
const VERTICES_PER_SEGMENT = 6;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export class SignalGeometry {
  readonly vertices = new Float32Array(
    MAX_TRAILS * (SAMPLE_COUNT - 1) * VERTICES_PER_SEGMENT * FLOATS_PER_VERTEX,
  );
  readonly #positions = new Float32Array(MAX_TRAILS * POSITION_STRIDE);
  #framesWritten = 0;
  vertexCount = 0;

  update(
    frame: SignalFrame,
    parameters: SignalSceneParameters,
    aspectRatio: number,
  ): void {
    this.#positions.copyWithin(POSITION_STRIDE, 0, -POSITION_STRIDE);
    const sourceLength = frame.mono.length;

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const normalizedIndex = index / (SAMPLE_COUNT - 1);
      const sourceIndex = Math.floor(normalizedIndex * (sourceLength - 1));
      const positionIndex = index * 2;

      if (parameters.mode === "oscilloscope") {
        this.#positions[positionIndex] = normalizedIndex * 2 - 1;
        this.#positions[positionIndex + 1] = clamp(
          (frame.mono[sourceIndex] ?? 0) * parameters.gain,
          -1,
          1,
        );
      } else {
        const leftIndex =
          (sourceIndex * Math.round(parameters.xFrequency)) % sourceLength;
        const rightIndex =
          (sourceIndex * Math.round(parameters.yFrequency)) % sourceLength;
        this.#positions[positionIndex] = clamp(
          (frame.left[leftIndex] ?? 0) * parameters.gain,
          -1,
          1,
        );
        this.#positions[positionIndex + 1] = clamp(
          (frame.right[rightIndex] ?? 0) * parameters.gain,
          -1,
          1,
        );
      }
    }

    this.#framesWritten = Math.min(this.#framesWritten + 1, MAX_TRAILS);
    const requestedTrails = 1 + Math.round(parameters.persistence * 9);
    const trailCount = Math.min(requestedTrails, this.#framesWritten);
    const safeAspectRatio = Math.max(aspectRatio, 0.1);
    const thickness = parameters.lineWidth * 0.0022;
    const signalIntensity = clamp(0.42 + frame.rms * 2.4, 0.42, 1);
    let vertexIndex = 0;

    for (let trail = trailCount - 1; trail >= 0; trail -= 1) {
      const trailOffset = trail * POSITION_STRIDE;
      const alpha =
        signalIntensity * Math.max(0.08, parameters.persistence ** trail);

      for (let point = 0; point < SAMPLE_COUNT - 1; point += 1) {
        const start = trailOffset + point * 2;
        const end = start + 2;
        const x1 = this.#positions[start] ?? 0;
        const y1 = this.#positions[start + 1] ?? 0;
        const x2 = this.#positions[end] ?? 0;
        const y2 = this.#positions[end + 1] ?? 0;
        const deltaX = (x2 - x1) * safeAspectRatio;
        const deltaY = y2 - y1;
        const length = Math.max(Math.hypot(deltaX, deltaY), 0.000_01);
        const normalX = (-deltaY / length) * (thickness / safeAspectRatio);
        const normalY = (deltaX / length) * thickness;

        vertexIndex = this.#quad(
          vertexIndex,
          x1,
          y1,
          x2,
          y2,
          normalX,
          normalY,
          alpha,
        );
      }
    }

    this.vertexCount = vertexIndex / FLOATS_PER_VERTEX;
  }

  #quad(
    offset: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    normalX: number,
    normalY: number,
    alpha: number,
  ): number {
    let next = this.#vertex(offset, x1 - normalX, y1 - normalY, alpha);
    next = this.#vertex(next, x1 + normalX, y1 + normalY, alpha);
    next = this.#vertex(next, x2 + normalX, y2 + normalY, alpha);
    next = this.#vertex(next, x1 - normalX, y1 - normalY, alpha);
    next = this.#vertex(next, x2 + normalX, y2 + normalY, alpha);
    return this.#vertex(next, x2 - normalX, y2 - normalY, alpha);
  }

  #vertex(offset: number, x: number, y: number, alpha: number): number {
    this.vertices[offset] = x;
    this.vertices[offset + 1] = y;
    this.vertices[offset + 2] = alpha;
    return offset + FLOATS_PER_VERTEX;
  }
}
