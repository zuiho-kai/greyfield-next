/** Browser PCM transport only; turn detection and interruption stay in N.E.K.O. */
export class RealtimeAudio {
  private epoch = 0;
  private playbackEpoch = 0;
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private playback = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private mouthTimer?: ReturnType<typeof setInterval>;
  private analyser?: AnalyserNode;

  constructor(private readonly onMouth: (value: number) => void) {}

  async start(onPcm: (data: Uint8Array, sampleRate: number) => void): Promise<void> {
    this.stop();
    const epoch = this.epoch;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (epoch !== this.epoch) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    try {
      const context = this.context = new AudioContext({ sampleRate: 48000 });
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(context.destination);
      this.source = context.createMediaStreamSource(stream);
      this.processor = context.createScriptProcessor(2048, 1, 1);
      this.processor.onaudioprocess = (event) => {
        if (epoch !== this.epoch) return;
        const samples = event.inputBuffer.getChannelData(0);
        // 2048 frames at 48k are below the official 120ms packet limit.
        const pcm = new Uint8Array(samples.length * 2);
        const view = new DataView(pcm.buffer);
        for (let index = 0; index < samples.length; index++) view.setInt16(index * 2, Math.max(-1, Math.min(1, samples[index])) * 32767, true);
        onPcm(pcm, context.sampleRate);
      };
      this.source.connect(this.processor); this.processor.connect(context.destination);
      const samples = new Float32Array(this.analyser.fftSize);
      this.mouthTimer = setInterval(() => {
        this.analyser?.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        this.onMouth(Math.min(1, rms * 6));
      }, 40);
      await context.resume();
    } catch (error) { this.stop(); throw error; }
  }

  async play(bytes: Uint8Array, volume: number): Promise<void> {
    const context = this.context;
    if (!context || !this.analyser || bytes.length < 2) return;
    const epoch = this.epoch;
    const playbackEpoch = this.playbackEpoch;
    let buffer: AudioBuffer;
    if (String.fromCharCode(...bytes.slice(0, 4)) === "OggS") {
      buffer = await context.decodeAudioData(bytes.slice().buffer);
    } else {
      buffer = context.createBuffer(1, Math.floor(bytes.length / 2), 48000);
      const output = buffer.getChannelData(0);
      const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < output.length; index++) output[index] = input.getInt16(index * 2, true) / 32768;
    }
    if (epoch !== this.epoch || playbackEpoch !== this.playbackEpoch || context !== this.context) return;
    const source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain(); gain.gain.value = volume;
    source.connect(gain); gain.connect(this.analyser);
    source.onended = () => { this.playback.delete(source); source.disconnect(); gain.disconnect(); };
    this.playback.add(source);
    const when = Math.max(context.currentTime + 0.015, this.nextStart);
    source.start(when); this.nextStart = when + buffer.duration;
  }

  interrupt(): void {
    this.playbackEpoch += 1;
    for (const source of this.playback) { source.stop(); source.disconnect(); }
    this.playback.clear(); this.nextStart = 0; this.onMouth(0);
  }

  stop(): void {
    this.epoch += 1;
    this.interrupt();
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect(); this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    clearInterval(this.mouthTimer);
    void this.context?.close().catch(() => undefined);
    this.context = undefined; this.stream = undefined; this.processor = undefined;
    this.source = undefined; this.analyser = undefined;
  }
}
