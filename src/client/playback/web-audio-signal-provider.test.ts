import { expect, test } from "bun:test";

import {
  type AnalyserReader,
  WebAudioSignalProvider,
} from "@/client/playback/web-audio-signal-provider";

class FixtureAnalyser implements AnalyserReader {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  readonly #frequency: Uint8Array<ArrayBuffer>;
  readonly #time: Float32Array<ArrayBuffer>;

  constructor(time: number[], frequency: number[] = []) {
    this.#time = new Float32Array(time);
    this.#frequency = new Uint8Array(time.length / 2);
    this.#frequency.set(frequency);
    this.fftSize = this.#time.length;
    this.frequencyBinCount = this.#frequency.length;
  }

  getByteFrequencyData(array: Uint8Array<ArrayBuffer>): void {
    array.set(this.#frequency);
  }

  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void {
    array.set(this.#time);
  }
}

test("reuses signal buffers and derives mono, RMS, and peak values", () => {
  const provider = new WebAudioSignalProvider(4);
  provider.attach({
    left: new FixtureAnalyser([0.5, -0.5, 1, -1], [12, 24]),
    right: new FixtureAnalyser([0, 0, 0, 0]),
    sampleRate: 48_000,
  });

  const first = provider.readFrame(1.25);
  const second = provider.readFrame(1.5);

  expect(second).toBe(first);
  expect(second.timestampSeconds).toBe(1.5);
  expect(second.sampleRate).toBe(48_000);
  expect([...second.right]).toEqual([0.5, -0.5, 1, -1]);
  expect([...second.mono]).toEqual([0.5, -0.5, 1, -1]);
  expect([...second.frequencyBins]).toEqual([12, 24]);
  expect(second.rms).toBeCloseTo(Math.sqrt(0.625));
  expect(second.peak).toBe(1);
});

test("returns cleared stable buffers while analysis is unavailable", () => {
  const provider = new WebAudioSignalProvider(4);
  const frame = provider.readFrame(2);

  expect(provider.isAvailable()).toBe(false);
  expect([...frame.mono]).toEqual([0, 0, 0, 0]);
  provider.attach({
    left: new FixtureAnalyser([1, 1, 1, 1]),
    right: new FixtureAnalyser([1, 1, 1, 1]),
    sampleRate: 44_100,
  });
  provider.readFrame(3);
  provider.detach();
  expect([...provider.readFrame(4).mono]).toEqual([0, 0, 0, 0]);
});
