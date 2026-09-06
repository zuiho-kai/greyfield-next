import { detectVoiceActivity } from "./vad";

/** Turns continuous mono PCM into complete WAV utterances without closing the mic. */
export class ContinuousUtterance {
  private frames: Uint8Array[] = [];
  private pendingMs = 0;
  private voiceMs = 0;
  private silenceMs = 0;
  private speaking = false;
  constructor(private readonly onStart: () => void, private readonly onEnd: (wav: Uint8Array) => void) {}

  push(pcm: Uint8Array, sampleRate: number): void {
    const samples = new Float32Array(pcm.length / 2);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const duration = samples.length / sampleRate * 1000;
    const active = detectVoiceActivity(samples).active;
    this.frames.push(pcm.slice());
    this.pendingMs += duration;
    this.voiceMs = active ? this.voiceMs + duration : 0;
    this.silenceMs = active ? 0 : this.silenceMs + duration;
    if (!this.speaking && this.voiceMs >= 90) {
      this.speaking = true;
      this.onStart();
    }
    if (!this.speaking) {
      while (this.pendingMs > 250 && this.frames.length > 1) {
        this.pendingMs -= this.frames.shift()!.length / 2 / sampleRate * 1000;
      }
    } else if (this.silenceMs >= 450 || this.pendingMs >= 20_000) {
      const wav = pcmWave(this.frames, sampleRate);
      this.reset();
      this.onEnd(wav);
    }
  }

  reset(): void {
    this.frames = []; this.pendingMs = 0; this.voiceMs = 0; this.silenceMs = 0; this.speaking = false;
  }
}

/** Merge only WAVs produced by this recorder, preserving not-yet-transcribed clauses. */
export function mergeUtteranceWaves(waves: Uint8Array[]): Uint8Array {
  return pcmWave(waves.map((wave) => wave.slice(44)), new DataView(waves[0]!.buffer, waves[0]!.byteOffset).getUint32(24, true));
}

function pcmWave(frames: Uint8Array[], sampleRate: number): Uint8Array {
  const size = frames.reduce((sum, frame) => sum + frame.length, 0);
  const result = new Uint8Array(44 + size);
  const view = new DataView(result.buffer);
  const tag = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, 36 + size, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, size, true);
  let offset = 44;
  for (const frame of frames) { result.set(frame, offset); offset += frame.length; }
  return result;
}
