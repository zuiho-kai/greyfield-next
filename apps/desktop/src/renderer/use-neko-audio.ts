import { RealtimeAudio } from "@greyfield/audio-runtime";

export function useNekoAudio(isPetWindow: boolean, onMouth: (value: number) => void, volume: () => number): () => void {
  const host = window.greyfield;
  const audio = isPetWindow ? new RealtimeAudio(onMouth) : undefined;
  let capturing = false;
  let epoch = 0;
  let currentSpeechId = "";
  const interruptedSpeech = new Set<string>();
  const detach = host?.on("neko:event", (event) => {
    if (!audio) return;
    if (event.type === "state") {
      if (event.state.status === "ready" && !capturing) {
        capturing = true;
        const current = ++epoch;
        void audio.start((data, sampleRate) => host.send("neko:audio", { data, sampleRate }), () => {
          interruptedSpeech.add(currentSpeechId);
          audio.interrupt();
        }, () => host.send("neko:command", { action: "user-activity" })).catch((error) => {
          if (current !== epoch) return;
          host.send("neko:command", { action: "stop", message: `麦克风无法开启：${error instanceof Error ? error.message : String(error)}` });
        });
      } else if (event.state.status !== "ready") {
        ++epoch; capturing = false; audio.stop(); interruptedSpeech.clear(); currentSpeechId = "";
      }
    }
    if (event.type === "audio" && !interruptedSpeech.has(event.speechId)) {
      currentSpeechId = event.speechId;
      void audio.play(event.data, volume()).catch((error) => {
      host.send("neko:command", { action: "stop", message: `语音播放失败：${error instanceof Error ? error.message : String(error)}` });
      });
    }
    if (event.type === "interrupt") audio.interrupt();
  });
  host?.send("neko:command", { action: "status" });
  return () => {
    ++epoch; audio?.stop(); detach?.();
    if (capturing) host?.send("neko:command", { action: "stop" });
  };
}
