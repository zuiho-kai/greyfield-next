import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { describeScreenAwarenessNotice } from "../chat-screen-awareness-notice";

const rawRuntimeVisionMessage =
  "Screen awareness needs a ready Vision model before Greyfield can use visual context. Greyfield kept the screenshot temporary and did not send it to the Chat model.";

describe("describeScreenAwarenessNotice", () => {
  it("maps the raw runtime Vision-model error state to a localized user notice", () => {
    const state = {
      ...createInitialDesktopRendererState(),
      screenAwarenessNotice: rawRuntimeVisionMessage
    };

    expect(describeScreenAwarenessNotice(state, "zh-CN")).toBe(
      "屏幕感知需要可用的 Vision model。本次截图保持临时，没有发送给 Chat model。"
    );
    expect(describeScreenAwarenessNotice(state, "en-US")).toBe(
      "Screen awareness needs a ready Vision model. This screenshot stayed temporary and was not sent to the Chat model."
    );
    expect(describeScreenAwarenessNotice(state, "zh-CN")).not.toBe(rawRuntimeVisionMessage);
  });

  it("does not create a notice when the reducer left the screen-awareness notice state empty", () => {
    const state = {
      ...createInitialDesktopRendererState(),
      errorMessage: "provider timed out",
      screenAwarenessNotice: ""
    };

    expect(describeScreenAwarenessNotice(state, "zh-CN")).toBe("");
  });
});
