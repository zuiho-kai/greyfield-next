import { FakeStageDriver } from "@greyfield/stage-live2d";
import { GreyfieldRuntime, InMemorySessionStore, type RuntimeOutputEvent } from "@greyfield/core-runtime";
import { FakeASRProvider, FakeLLMProvider, FakeMemoryStore, FakeTTSProvider } from "./fake-providers";

const tts = new FakeTTSProvider();
const asr = new FakeASRProvider();
const stage = new FakeStageDriver();
const runtime = new GreyfieldRuntime({
  llm: new FakeLLMProvider(),
  asr,
  tts,
  memoryStore: new FakeMemoryStore(),
  sessionStore: new InMemorySessionStore("acceptance-session"),
  persona: {
    name: "Greyfield",
    tone: "warm and direct",
    boundaries: ["No desktop control in V1"],
    expressionMap: {
      neutral: "default",
      speaking: "smile"
    }
  },
  voice: "fake-default",
  stage
});

const events: RuntimeOutputEvent[] = [];
await runtime.handle({ type: "text.input", text: "醒了吗？" }, (event) => {
  events.push(event);
});
await runtime.handle({ type: "audio.chunk", data: new Uint8Array([1, 2, 3]) }, (event) => {
  events.push(event);
});
await runtime.handle({ type: "audio.end" }, (event) => {
  events.push(event);
});

const hasTextDelta = events.some((event) => event.type === "assistant.text.delta");
const hasAudio = events.some((event) => event.type === "assistant.audio.chunk");
const hasFinal = events.some((event) => event.type === "assistant.text.final");
const hasTranscript = events.some((event) => event.type === "transcript.final");

if (!hasTextDelta || !hasAudio || !hasFinal || !hasTranscript || tts.synthesized.length === 0 || asr.transcribed.length === 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        hasTextDelta,
        hasAudio,
        hasFinal,
        hasTranscript,
        synthesized: tts.synthesized.length,
        transcribed: asr.transcribed.length
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        events: events.map((event) => event.type),
        synthesized: tts.synthesized,
        transcribed: asr.transcribed
      },
      null,
      2
    )
  );
}
