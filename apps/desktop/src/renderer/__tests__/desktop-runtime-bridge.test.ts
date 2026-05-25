import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopRuntimeBridge } from "../desktop-runtime-bridge";
import { API_KEY_MASK } from "../../shared/secrets";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDesktopRuntimeBridge", () => {
  it("sends text through fake runtime and reduces output into renderer state", async () => {
    const bridge = createDesktopRuntimeBridge();

    const state = await bridge.sendText("醒了吗？");

    expect(state.status).toBe("idle");
    expect(state.inputDraft).toBe("");
    expect(state.messages).toEqual([
      { role: "user", text: "醒了吗？" },
      { role: "assistant", text: "你好，我醒着。现在可以继续做桌宠了。" }
    ]);
    expect(state.audioQueue).toEqual(["你好，我醒着。", "现在可以继续做桌宠了。"]);
    expect(state.stage.mouthOpen).toBe(0);
    expect(state.stage.expression).toBe("smile");
    expect(state.stage.motion).toEqual({ group: "Use", index: 0 });
  });

  it("keeps model pass-through and lock state separate from runtime messages", () => {
    const bridge = createDesktopRuntimeBridge();

    bridge.setWindowState({ modelPassThrough: true, locked: true });

    expect(bridge.getState()).toMatchObject({
      window: {
        modelPassThrough: true,
        locked: true
      },
      messages: []
    });
  });

  it("updates settings without mutating conversation history", async () => {
    const bridge = createDesktopRuntimeBridge();
    await bridge.sendText("先记一轮");

    const state = bridge.updateSettings({
      providerModel: "local-model-a",
      providerLLM: "fake",
      providerBaseUrl: "https://llm.local/v1",
      providerApiKey: "local-key",
      voiceId: "voice-greyfield",
      microphoneId: "mic-array",
      characterFile: "characters/night.yaml",
      modelPath: "assets/live2d/night/night.model3.json",
      modelScale: 1.2,
      modelX: 12,
      modelY: -8,
      speechBubbleEnabled: false
    });

    expect(state.settings).toMatchObject({
      providerModel: "local-model-a",
      providerLLM: "fake",
      providerBaseUrl: "https://llm.local/v1",
      providerApiKey: "local-key",
      voiceId: "voice-greyfield",
      microphoneId: "mic-array",
      characterFile: "characters/night.yaml",
      modelPath: "assets/live2d/night/night.model3.json",
      modelScale: 1.2,
      modelX: 12,
      modelY: -8,
      speechBubbleEnabled: false
    });
    expect(state.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("forwards settings updates to the Electron preload API when available", () => {
    const sent: Array<[string, unknown]> = [];
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: () => () => undefined
    });

    bridge.updateSettings({
      providerModel: "local-model-b",
      providerLLM: "openai-compatible",
      providerBaseUrl: "https://llm.example/v1",
      providerApiKey: "secret",
      microphoneId: "mic-front",
      modelPath: "assets/live2d/front/front.model3.json",
      modelScale: 1.4,
      modelX: 20,
      modelY: -10,
      speechBubbleEnabled: false
    });

    expect(sent).toEqual([
      [
        "settings:update",
        {
          provider: {
            llm: "openai-compatible",
            model: "local-model-b",
            baseUrl: "https://llm.example/v1",
            apiKey: "secret"
          },
          audio: { microphoneId: "mic-front" },
          live2d: {
            modelPath: "assets/live2d/front/front.model3.json",
            scale: 1.4,
            x: 20,
            y: -10
          },
          ui: { speechBubbleEnabled: false }
        }
      ]
    ]);
  });

  it("does not persist a masked API key placeholder back to Electron main", () => {
    const sent: Array<[string, unknown]> = [];
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: () => () => undefined
    });

    bridge.updateSettings({ providerApiKey: API_KEY_MASK, providerModel: "next-model" });

    expect(sent).toEqual([
      [
        "settings:update",
        {
          provider: {
            model: "next-model"
          }
        }
      ]
    ]);
  });

  it("sends runtime input to Electron main when a host API is available", async () => {
    const sent: Array<[string, unknown]> = [];
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "runtime:event") {
          runtimeEvent = handler as typeof runtimeEvent;
        }
        return () => undefined;
      }
    });
    const states: Array<ReturnType<typeof bridge.getState>> = [];
    const detach = bridge.onStateChange((state) => states.push(state));

    const initial = await bridge.sendText("主进程来接管");
    runtimeEvent?.({ type: "runtime.status", status: "thinking" });
    runtimeEvent?.({ type: "assistant.text.delta", text: "远程" });
    runtimeEvent?.({ type: "assistant.text.final", text: "远程回复" });
    runtimeEvent?.({ type: "runtime.status", status: "idle" });

    expect(sent).toContainEqual(["runtime:input", { type: "text.input", text: "主进程来接管" }]);
    expect(initial.messages).toEqual([{ role: "user", text: "主进程来接管" }]);
    expect(bridge.getState().messages).toEqual([
      { role: "user", text: "主进程来接管" },
      { role: "assistant", text: "远程回复" }
    ]);
    expect(bridge.getState().status).toBe("idle");
    expect(states.at(-1)?.messages.at(-1)).toEqual({ role: "assistant", text: "远程回复" });
    detach();
  });

  it("reduces runtime errors into visible chat state", () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "runtime:event") {
          runtimeEvent = handler as typeof runtimeEvent;
        }
        return () => undefined;
      }
    });

    runtimeEvent?.({ type: "assistant.text.delta", text: "partial" });
    runtimeEvent?.({ type: "error", message: "provider timed out" });

    expect(bridge.getState()).toMatchObject({
      status: "error",
      errorMessage: "provider timed out",
      assistantDraft: "",
      audioQueue: []
    });
  });

  it("clears a visible runtime error when sending the next message", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const sent: Array<[string, unknown]> = [];
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "runtime:event") {
          runtimeEvent = handler as typeof runtimeEvent;
        }
        return () => undefined;
      }
    });

    runtimeEvent?.({ type: "error", message: "provider timed out" });
    const state = await bridge.sendText("重试一下");

    expect(state.errorMessage).toBe("");
    expect(sent).toContainEqual(["runtime:input", { type: "text.input", text: "重试一下" }]);
  });

  it("keeps renderer preview fake-only even when OpenAI-compatible settings are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"远程"}}]}\n\n'));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        });
        return new Response(body, { status: 200 });
      })
    );
    const bridge = createDesktopRuntimeBridge();
    bridge.updateSettings({
      providerLLM: "openai-compatible",
      providerBaseUrl: "https://llm.example/v1",
      providerApiKey: "secret",
      providerModel: "remote-model"
    });

    const state = await bridge.sendText("走真实 provider");

    expect(state.messages.at(-1)).toEqual({ role: "assistant", text: "你好，我醒着。现在可以继续做桌宠了。" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reduces settings:changed events from Electron into renderer state", () => {
    let settingsChanged: ((config: import("../../shared/renderer-config").RendererGreyfieldConfig) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "settings:changed") {
          settingsChanged = handler as typeof settingsChanged;
        }
        return () => undefined;
      }
    });

    settingsChanged?.({
      ...bridge.getConfigSnapshot(),
      provider: { ...bridge.getConfigSnapshot().provider, apiKey: "", model: "main-process-model", hasApiKey: false }
    });

    expect(bridge.getState().settings.providerModel).toBe("main-process-model");
  });

  it("stores only API-key presence, not the masked key, from renderer-safe settings events", () => {
    let settingsChanged: ((config: import("../../shared/renderer-config").RendererGreyfieldConfig) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "settings:changed") {
          settingsChanged = handler as typeof settingsChanged;
        }
        return () => undefined;
      }
    });

    settingsChanged?.({
      ...bridge.getConfigSnapshot(),
      provider: { ...bridge.getConfigSnapshot().provider, apiKey: API_KEY_MASK, hasApiKey: true }
    });

    expect(bridge.getState().settings.providerApiKey).toBe("");
    expect(bridge.getState().settings.providerHasApiKey).toBe(true);
    expect(bridge.getConfigSnapshot().provider.apiKey).toBe("");
  });

  it("reduces window:state events from Electron into renderer interaction state", () => {
    let windowStateChanged: ((state: { modelPassThrough: boolean; locked: boolean }) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "window:state") {
          windowStateChanged = handler as typeof windowStateChanged;
        }
        return () => undefined;
      }
    });

    windowStateChanged?.({ modelPassThrough: true, locked: true });

    expect(bridge.getState().window).toEqual({ modelPassThrough: true, locked: true });
  });

  it("clears pending assistant and audio state on interrupt", async () => {
    const bridge = createDesktopRuntimeBridge();
    await bridge.sendText("开始说话");

    const state = await bridge.interrupt();

    expect(state.status).toBe("interrupted");
    expect(state.assistantDraft).toBe("");
    expect(state.audioQueue).toEqual([]);
    expect(state.stage.mouthOpen).toBe(0);
  });
});
