import { FakeStageDriver } from "@greyfield/stage-live2d";
import { GreyfieldRuntime, InMemorySessionStore, type RuntimeOutputEvent } from "@greyfield/core-runtime";
import { FakeLLMProvider, FakeMemoryStore, FakeTTSProvider } from "./fake-providers";

const tts = new FakeTTSProvider();
const stage = new FakeStageDriver();
const runtime = new GreyfieldRuntime({
  llm: new FakeLLMProvider(),
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

const hasTextDelta = events.some((event) => event.type === "assistant.text.delta");
const hasAudio = events.some((event) => event.type === "assistant.audio.chunk");
const hasFinal = events.some((event) => event.type === "assistant.text.final");
const hasMouthEvents = stage.events.some((event) => event.type === "setMouthOpen");

if (!hasTextDelta || !hasAudio || !hasFinal || !hasMouthEvents || tts.synthesized.length === 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        hasTextDelta,
        hasAudio,
        hasFinal,
        hasMouthEvents,
        synthesized: tts.synthesized.length
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
        synthesized: tts.synthesized
      },
      null,
      2
    )
  );
}
