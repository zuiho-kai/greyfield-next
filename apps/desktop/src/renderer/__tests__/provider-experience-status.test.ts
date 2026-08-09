import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState, type DesktopRendererState } from "../desktop-runtime-bridge";
import { describeProviderExperience, describeVoiceInputExperience } from "../provider-experience-status";

function createCompleteProviderState(): DesktopRendererState {
  const state = createInitialDesktopRendererState();
  state.settings.providerLLM = "openai-compatible";
  state.settings.providerBaseUrl = "https://llm.example/v1";
  state.settings.providerApiKey = "";
  state.settings.providerHasApiKey = true;
  state.settings.providerModel = "chat-model";
  return state;
}

describe("provider experience status", () => {
  it("labels fake LLM and ASR as explicit previews with a real-chat next step", () => {
    const state = createInitialDesktopRendererState();

    expect(describeProviderExperience(state, "zh-CN")).toMatchObject({
      tone: "preview",
      label: "试玩模式",
      actionLabel: "配置真实聊天"
    });
    expect(describeVoiceInputExperience(state, "zh-CN")).toEqual({
      isPreview: true,
      label: "固定转写试玩",
      shortLabel: "固定转写"
    });
  });

  it("keeps incomplete real-provider settings blocked even after a stale successful test", () => {
    const state = createCompleteProviderState();
    state.settings.providerModel = "";
    state.providerTest = { status: "success", message: "old success", firstToken: "pong" };

    expect(describeProviderExperience(state, "zh-CN")).toMatchObject({
      tone: "blocked",
      label: "配置未完成",
      actionLabel: "完成配置"
    });
  });

  it("requires a Test LLM success after complete settings are saved", () => {
    const state = createCompleteProviderState();

    expect(describeProviderExperience(state, "zh-CN")).toMatchObject({
      tone: "blocked",
      label: "配置已保存，待测试",
      actionLabel: "测试连接"
    });
  });

  it("shows a readable failed-test detail and retest action", () => {
    const state = createCompleteProviderState();
    state.providerTest = { status: "error", message: "401 Unauthorized. Check API key." };

    expect(describeProviderExperience(state, "zh-CN")).toEqual({
      tone: "blocked",
      label: "连接测试失败",
      detail: "401 Unauthorized. Check API key.",
      actionLabel: "重新测试"
    });
  });

  it("marks only complete settings with a successful current test as ready", () => {
    const state = createCompleteProviderState();
    state.providerTest = { status: "success", message: "LLM test succeeded: pong", firstToken: "pong" };

    expect(describeProviderExperience(state, "zh-CN")).toMatchObject({
      tone: "configured",
      label: "真实聊天已就绪",
      actionLabel: ""
    });
  });
});
