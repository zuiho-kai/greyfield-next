import { describe, expect, it } from "vitest";
import { createDefaultInteractionProfile } from "@greyfield/stage-live2d";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { reduceRuntimeEvent } from "../runtime-event-reducer";

const interactionProfile = createDefaultInteractionProfile();
const visionMissingMessage =
  "Screen awareness needs a ready Vision model before Greyfield can use visual context. Greyfield kept the screenshot temporary and did not send it to the Chat model.";

describe("reduceRuntimeEvent", () => {
  it("resets only the current assistant draft between tool rounds", () => {
    const state = { ...createInitialDesktopRendererState(), assistantDraft: "我再查一下", messages: [{ role: "user" as const, text: "帮我查" }, { role: "assistant" as const, text: "Previous answer [source](https://nodejs.org)" }] };
    const reset = reduceRuntimeEvent(state, { type: "assistant.text.reset" }, interactionProfile);
    expect(reset.assistantDraft).toBe("");
    expect(reset.messages).toBe(state.messages);
  });

  it("shows a user message from the other window and clears stale tool progress on Stop", () => {
    const initial = createInitialDesktopRendererState();
    const accepted = reduceRuntimeEvent(initial, { type: "user.text.accepted", text: "查一下报错" }, interactionProfile);
    expect(accepted.messages).toEqual([{ role: "user", text: "查一下报错" }]);
    const running = reduceRuntimeEvent(accepted, { type: "assistant.tool.status", name: "web_search", status: "running" }, interactionProfile);
    expect(running.toolStatus?.status).toBe("running");
    const stopped = reduceRuntimeEvent(running, { type: "runtime.status", status: "interrupted" }, interactionProfile);
    expect(stopped.toolStatus).toBeUndefined();
    expect(reduceRuntimeEvent(stopped, { type: "assistant.tool.status", name: "web_search", status: "completed" }, interactionProfile)).toBe(stopped);
  });

  it("keeps screen-awareness Vision model errors out of the global chat error bar", () => {
    const state = {
      ...createInitialDesktopRendererState(),
      status: "thinking",
      messages: [{ role: "user" as const, text: "看一下屏幕" }],
      assistantDraft: "partial reply",
      audioQueue: ["partial audio"]
    };

    const reduced = reduceRuntimeEvent(state, { type: "error", message: visionMissingMessage }, interactionProfile);

    expect(reduced).toMatchObject({
      status: "error",
      errorMessage: "",
      screenAwarenessNotice: visionMissingMessage,
      inputDraft: "看一下屏幕",
      assistantDraft: "",
      audioQueue: []
    });
    expect(reduced.voiceInput.status).toBe("idle");
  });

  it("keeps ordinary runtime errors on the visible global error path", () => {
    const state = {
      ...createInitialDesktopRendererState(),
      screenAwarenessNotice: visionMissingMessage,
      messages: [{ role: "user" as const, text: "继续" }]
    };

    const reduced = reduceRuntimeEvent(state, { type: "error", message: "provider timed out" }, interactionProfile);

    expect(reduced).toMatchObject({
      status: "error",
      errorMessage: "provider timed out",
      screenAwarenessNotice: "",
      inputDraft: "继续",
      assistantDraft: "",
      audioQueue: []
    });
    expect(reduced.voiceInput).toEqual({
      status: "error",
      message: "provider timed out"
    });
  });
});
