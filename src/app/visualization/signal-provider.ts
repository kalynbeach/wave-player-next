export type SignalFrame = {
  timestampSeconds: number;
  sampleRate: number;
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  mono: Float32Array<ArrayBuffer>;
  frequencyBins: Uint8Array<ArrayBuffer>;
  rms: number;
  peak: number;
};

export interface SignalProvider {
  isAvailable(): boolean;
  readFrame(timestampSeconds: number): SignalFrame;
}
