export interface AudioLevel {
  rms: number;
  peak: number;
}

export interface MouthOpenMappingOptions {
  noiseGate?: number;
  gain?: number;
  curve?: number;
}

export function measureAudioLevel(samples: Uint8Array | Float32Array): AudioLevel {
  if (samples.length === 0) {
    return { rms: 0, peak: 0 };
  }

  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const normalized = normalizeSample(sample, samples);
    const magnitude = Math.abs(normalized);
    sumSquares += normalized * normalized;
    peak = Math.max(peak, magnitude);
  }

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak
  };
}

export function mapAudioLevelToMouthOpen(level: AudioLevel, options: MouthOpenMappingOptions = {}): number {
  const noiseGate = options.noiseGate ?? 0.08;
  const gain = options.gain ?? 1.35;
  const curve = options.curve ?? 0.65;

  if (!Number.isFinite(level.rms) || level.rms <= noiseGate) {
    return 0;
  }

  const normalized = clamp01((level.rms - noiseGate) / (1 - noiseGate));
  return clamp01(Math.pow(normalized, curve) * gain);
}

function normalizeSample(sample: number, source: Uint8Array | Float32Array): number {
  if (!Number.isFinite(sample)) {
    return 0;
  }
  if (source instanceof Uint8Array) {
    return (sample - 128) / 127;
  }
  return Math.max(-1, Math.min(1, sample));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
