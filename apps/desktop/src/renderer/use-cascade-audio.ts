import { ContinuousUtterance, RealtimeAudio, mergeUtteranceWaves } from "@greyfield/audio-runtime";
import type { DesktopRuntimeBridge } from "./desktop-runtime-bridge";

/** The pet owns the sole microphone so closing controls cannot end the conversation. */
export function useCascadeAudio(isPetWindow: boolean, bridge: DesktopRuntimeBridge): () => void {
  if (!isPetWindow || !window.greyfield) return () => {};
  const host = window.greyfield;
  const audio = new RealtimeAudio(() => {});
  let capturing = false;
  let epoch = 0;
  let pendingAudio: Uint8Array[] = [];
  const utterances = new ContinuousUtterance(() => {
    // Playback is in this same renderer: silence it before waiting for main IPC.
    void bridge.interrupt();
  }, (data) => {
    pendingAudio.push(data);
    host.send("runtime:input", { type: "audio.input", data: mergeUtteranceWaves(pendingAudio) });
  });
  const detachTranscript = host.on("runtime:event", (event) => {
    if (event.type === "transcript.final" || event.type === "error") pendingAudio = [];
  });
  const detach = host.on("cascade:state", (state) => {
    if (state.active && !capturing) {
      capturing = true;
      const current = ++epoch;
      void audio.start((data, sampleRate) => utterances.push(data, sampleRate)).catch((error) => {
        if (current !== epoch) return;
        host.send("cascade:command", { action: "error", message: `麦克风无法开启：${String(error)}` });
      });
    } else if (!state.active) {
      ++epoch; capturing = false; audio.stop(); utterances.reset(); pendingAudio = [];
    }
  });
  return () => { ++epoch; audio.stop(); utterances.reset(); detach(); detachTranscript(); };
}
