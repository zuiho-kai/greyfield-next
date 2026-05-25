export interface VoiceActivityOptions {
  threshold?: number;
}

export interface VoiceActivityResult {
  active: boolean;
  rms: number;
  peak: number;
}

export function detectVoiceActivity(samples: Float32Array, options: VoiceActivityOptions = {}): VoiceActivityResult {
  const threshold = options.threshold ?? 0.02;
  if (samples.length === 0) {
    return { active: false, rms: 0, peak: 0 };
  }

  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const value = Number.isFinite(sample) ? sample : 0;
    const magnitude = Math.abs(value);
    sumSquares += value * value;
    peak = Math.max(peak, magnitude);
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  return {
    active: rms >= threshold,
    rms,
    peak
  };
}
