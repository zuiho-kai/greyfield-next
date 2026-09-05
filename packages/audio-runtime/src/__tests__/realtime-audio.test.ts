import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeAudio } from "../realtime-audio";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("realtime audio lifecycle", () => {
  it("reports speech onset while research is silent without inventing a playback interruption", async () => {
    const fixture = contextFixture();
    const audio = new RealtimeAudio(vi.fn());
    const speechStart = vi.fn(); const barge = vi.fn();
    await audio.start(vi.fn(), barge, speechStart);
    const frame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.1) } };
    for (let index = 0; index < 8; index++) fixture.processor.onaudioprocess?.(frame);
    expect(speechStart).toHaveBeenCalledOnce();
    expect(barge).not.toHaveBeenCalled();
    audio.stop();
  });
  it("releases a late permission grant after the plugin was disabled", async () => {
    let grant!: (stream: MediaStream) => void;
    const track = { stop: vi.fn() };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) } });
    const audio = new RealtimeAudio(vi.fn());
    const opening = audio.start(vi.fn());
    audio.stop();
    grant({ getTracks: () => [track] } as unknown as MediaStream);
    await opening;
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("does not restart an interrupted chunk that finishes decoding late", async () => {
    const fixture = contextFixture();
    let decode!: (buffer: AudioBuffer) => void;
    fixture.context.decodeAudioData = () => new Promise((resolve) => { decode = resolve; });
    const audio = new RealtimeAudio(vi.fn());
    await audio.start(vi.fn());
    const playing = audio.play(new Uint8Array([79, 103, 103, 83, 0, 0]), .5);
    audio.interrupt();
    decode(fixture.buffer as unknown as AudioBuffer);
    await playing;
    expect(fixture.starts).not.toHaveBeenCalled();
    audio.stop();
    expect(fixture.track.stop).toHaveBeenCalledOnce();
  });

  it("keeps forwarding PCM while one local onset cancels existing playback", async () => {
    const fixture = contextFixture();
    const audio = new RealtimeAudio(vi.fn());
    const pcm = vi.fn(); const barge = vi.fn(() => audio.interrupt());
    await audio.start(pcm, barge);
    await audio.play(new Uint8Array([1, 0, 2, 0]), .5);
    const frame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.1) } };
    for (let index = 0; index < 10; index++) fixture.processor.onaudioprocess?.(frame);
    expect(barge).toHaveBeenCalledOnce();
    expect(fixture.stops).toHaveBeenCalledOnce();
    expect(pcm).toHaveBeenCalledTimes(10);
    audio.stop();
  });
});

function contextFixture() {
  const track = { stop: vi.fn() };
  const starts = vi.fn(); const stops = vi.fn();
  const processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined as undefined | ((event: any) => void) };
  const buffer = { duration: 1, getChannelData: () => new Float32Array(48000) };
  const context = {
    sampleRate: 48000, currentTime: 0, destination: {},
    createAnalyser: () => ({ fftSize: 256, connect: vi.fn(), getFloatTimeDomainData: vi.fn() }),
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createScriptProcessor: () => processor,
    createBuffer: (_channels: number, length: number) => ({ duration: length / 48000, getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ connect: vi.fn(), disconnect: vi.fn(), start: starts, stop: stops }),
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    decodeAudioData: () => Promise.resolve(buffer as unknown as AudioBuffer),
    resume: () => Promise.resolve(), close: () => Promise.resolve()
  };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  vi.stubGlobal("AudioContext", function () { return context; });
  return { context, processor, track, buffer, starts, stops };
}
