import type {
  SignalFrame,
  SignalProvider,
} from "@/app/visualization/signal-provider";

export interface AnalyserReader {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  getByteFrequencyData(array: Uint8Array<ArrayBuffer>): void;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
}

export class WebAudioSignalProvider implements SignalProvider {
  readonly #frame: SignalFrame;
  #leftAnalyser: AnalyserReader | null = null;
  #rightAnalyser: AnalyserReader | null = null;

  constructor(fftSize = 2_048) {
    this.#frame = {
      timestampSeconds: 0,
      sampleRate: 0,
      left: new Float32Array(fftSize),
      right: new Float32Array(fftSize),
      mono: new Float32Array(fftSize),
      frequencyBins: new Uint8Array(fftSize / 2),
      rms: 0,
      peak: 0,
    };
  }

  attach(options: {
    left: AnalyserReader;
    right: AnalyserReader;
    sampleRate: number;
  }): void {
    if (
      options.left.fftSize !== this.#frame.left.length ||
      options.right.fftSize !== this.#frame.right.length ||
      options.left.frequencyBinCount !== this.#frame.frequencyBins.length
    ) {
      throw new Error(
        "The Web Audio analyser size does not match the signal frame.",
      );
    }

    this.#leftAnalyser = options.left;
    this.#rightAnalyser = options.right;
    this.#frame.sampleRate = options.sampleRate;
  }

  detach(): void {
    this.#leftAnalyser = null;
    this.#rightAnalyser = null;
    this.#frame.sampleRate = 0;
    this.#clear();
  }

  isAvailable(): boolean {
    return this.#leftAnalyser !== null && this.#rightAnalyser !== null;
  }

  readFrame(timestampSeconds: number): SignalFrame {
    this.#frame.timestampSeconds = timestampSeconds;

    if (!this.#leftAnalyser || !this.#rightAnalyser) {
      this.#clear();
      return this.#frame;
    }

    this.#leftAnalyser.getFloatTimeDomainData(this.#frame.left);
    this.#rightAnalyser.getFloatTimeDomainData(this.#frame.right);
    this.#leftAnalyser.getByteFrequencyData(this.#frame.frequencyBins);

    let rightHasSignal = false;
    for (const sample of this.#frame.right) {
      if (Math.abs(sample) > 0.000_001) {
        rightHasSignal = true;
        break;
      }
    }

    let sumOfSquares = 0;
    let peak = 0;
    for (let index = 0; index < this.#frame.mono.length; index += 1) {
      const left = this.#frame.left[index] ?? 0;
      const right = rightHasSignal ? (this.#frame.right[index] ?? 0) : left;
      const mono = (left + right) * 0.5;
      this.#frame.right[index] = right;
      this.#frame.mono[index] = mono;
      sumOfSquares += mono * mono;
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
    }

    this.#frame.rms = Math.sqrt(sumOfSquares / this.#frame.mono.length);
    this.#frame.peak = peak;
    return this.#frame;
  }

  #clear(): void {
    this.#frame.left.fill(0);
    this.#frame.right.fill(0);
    this.#frame.mono.fill(0);
    this.#frame.frequencyBins.fill(0);
    this.#frame.rms = 0;
    this.#frame.peak = 0;
  }
}
