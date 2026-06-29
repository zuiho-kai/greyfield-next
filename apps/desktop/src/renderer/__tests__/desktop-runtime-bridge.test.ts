import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpeechOutputOptions } from "@greyfield/audio-runtime";
import { createDesktopRuntimeBridge, createDesktopRuntimeBridgeWithSpeech } from "../desktop-runtime-bridge";
import { API_KEY_MASK } from "../../shared/secrets";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function flushSpeechPlaybackQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
      providerTTS: "openai-compatible",
      providerTTSModel: "FunAudioLLM/CosyVoice2-0.5B",
      voiceId: "voice-greyfield",
      voiceVolume: 0.45,
      voiceSpeechEnabled: true,
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
      providerTTS: "openai-compatible",
      providerTTSModel: "FunAudioLLM/CosyVoice2-0.5B",
      voiceId: "voice-greyfield",
      voiceVolume: 0.45,
      voiceSpeechEnabled: true,
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
      providerASR: "openai-compatible",
      providerASRModel: "whisper-1",
      providerBaseUrl: "https://llm.example/v1",
      providerApiKey: "secret",
      providerTTS: "openai-compatible",
      providerTTSModel: "FunAudioLLM/CosyVoice2-0.5B",
      voiceSpeechEnabled: true,
      voiceVolume: 0.5,
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
            asr: "openai-compatible",
            asrModel: "whisper-1",
            model: "local-model-b",
            tts: "openai-compatible",
            ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
            baseUrl: "https://llm.example/v1",
            apiKey: "secret"
          },
          voice: { speechEnabled: true, volume: 0.5 },
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

  it("persists the Settings language through the existing settings IPC path", () => {
    const sent: Array<[string, unknown]> = [];
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: () => () => undefined
    });

    const state = bridge.updateSettings({ settingsLocale: "zh-CN" });

    expect(state.settings.settingsLocale).toBe("zh-CN");
    expect(sent).toContainEqual(["settings:update", { ui: { locale: "zh-CN" } }]);
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

  it("forwards the better memory toggle and reduces extraction status events", () => {
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

    const state = bridge.updateSettings({ llmAtomExtractionEnabled: true });
    runtimeEvent?.({
      type: "memory.atom.extraction.status",
      status: {
        status: "fallback",
        reason: "provider-unavailable",
        message: "Better memory needs a ready chat provider, so Greyfield used standard local memory for this message.",
        savedAtomCount: 1,
        llmAttempted: false,
        fallbackUsed: true
      }
    });

    expect(state.settings.llmAtomExtractionEnabled).toBe(true);
    expect(sent).toContainEqual(["settings:update", { memory: { llmAtomExtractionEnabled: true } }]);
    expect(bridge.getState().memoryExtraction).toEqual({
      status: "fallback",
      reason: "provider-unavailable",
      message: "Better memory needs a ready chat provider, so Greyfield used standard local memory for this message.",
      savedAtomCount: 1,
      llmAttempted: false,
      fallbackUsed: true
    });
  });

  it("renders proactive pet messages outside chat history and clears them when disabled", () => {
    const sent: Array<[string, unknown]> = [];
    let proactiveMessage:
      | ((event: import("../../shared/ipc").DesktopProactiveMessage) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "proactive:message") {
          proactiveMessage = handler as typeof proactiveMessage;
        }
        return () => undefined;
      }
    });

    proactiveMessage?.({
      text: "It's raining again. I remembered our hotpot night at home.",
      createdAt: "2026-06-28T00:00:00.000Z"
    });

    expect(bridge.getState().proactiveMessage).toEqual({
      text: "It's raining again. I remembered our hotpot night at home.",
      createdAt: "2026-06-28T00:00:00.000Z"
    });
    expect(bridge.getState().messages).toEqual([]);

    bridge.updateSettings({ proactiveMemoryEnabled: false });

    expect(bridge.getState().proactiveMessage).toBeNull();
    expect(sent).toContainEqual(["settings:update", { ui: { proactiveMemoryEnabled: false } }]);
  });

  it("sends an LLM provider test request and reduces the result", () => {
    const sent: Array<[string, unknown]> = [];
    let providerTestResult:
      | ((event: { ok: boolean; message: string; firstToken?: string }) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "provider:test-llm-result") {
          providerTestResult = handler as typeof providerTestResult;
        }
        return () => undefined;
      }
    });

    const testing = bridge.testLLMProvider();
    providerTestResult?.({ ok: true, message: "LLM test succeeded: pong", firstToken: "pong" });

    expect(testing.providerTest).toEqual({ status: "testing", message: "Testing LLM provider..." });
    expect(sent).toContainEqual(["provider:test-llm", {}]);
    expect(bridge.getState().providerTest).toEqual({
      status: "success",
      message: "LLM test succeeded: pong",
      firstToken: "pong"
    });
  });

  it("sends a voice test request and plays returned audio even when reply speech is disabled", async () => {
    const sent: Array<[string, unknown]> = [];
    let voiceTestResult:
      | ((event: import("../../shared/ipc").DesktopVoiceTestResult) => void)
      | undefined;
    const speechOutput = {
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: (channel, payload) => sent.push([channel, payload]),
        on: (channel, handler) => {
          if (channel === "provider:test-voice-result") {
            voiceTestResult = handler as typeof voiceTestResult;
          }
          return () => undefined;
        }
      },
      speechOutput
    );
    bridge.updateSettings({ voiceSpeechEnabled: false, voiceId: "voice-greyfield", voiceVolume: 0.5 });

    const testing = bridge.testVoiceProvider();
    voiceTestResult?.({
      ok: true,
      message: "Voice test succeeded.",
      text: "Test voice.",
      data: new Uint8Array([0x49, 0x44, 0x33, 0x03])
    });
    await flushSpeechPlaybackQueue();

    expect(testing.voiceTest).toEqual({ status: "testing", message: "Testing voice playback..." });
    expect(sent).toContainEqual(["provider:test-voice", {}]);
    expect(speechOutput.speak).toHaveBeenCalledWith("Test voice.", expect.objectContaining({
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x03]),
      voiceId: "voice-greyfield",
      volume: 0.5
    }));
    expect(bridge.getState().voiceTest).toEqual({
      status: "success",
      message: "Voice test succeeded."
    });
  });

  it("shows voice test errors with retry guidance", () => {
    let voiceTestResult:
      | ((event: import("../../shared/ipc").DesktopVoiceTestResult) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "provider:test-voice-result") {
          voiceTestResult = handler as typeof voiceTestResult;
        }
        return () => undefined;
      }
    });

    voiceTestResult?.({ ok: false, message: "OpenAI-compatible TTS request failed: 401 Unauthorized" });

    expect(bridge.getState().voiceTest).toEqual({
      status: "error",
      message:
        "OpenAI-compatible TTS request failed: 401 Unauthorized. Check API key, Base URL, TTS model, and Voice, then retry."
    });
  });

  it("does not enqueue voice test audio when speech playback is unavailable", () => {
    let voiceTestResult:
      | ((event: import("../../shared/ipc").DesktopVoiceTestResult) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "provider:test-voice-result") {
          voiceTestResult = handler as typeof voiceTestResult;
        }
        return () => undefined;
      }
    });

    voiceTestResult?.({
      ok: true,
      message: "Voice test succeeded.",
      text: "No speaker.",
      data: new Uint8Array([0x49, 0x44, 0x33, 0x03])
    });

    expect(bridge.getState().voiceTest).toEqual({
      status: "success",
      message: "Voice test succeeded."
    });
    expect(bridge.getState().audioQueue).toEqual([]);
  });

  it("shows provider test errors in renderer state", () => {
    let providerTestResult:
      | ((event: { ok: boolean; message: string; firstToken?: string }) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "provider:test-llm-result") {
          providerTestResult = handler as typeof providerTestResult;
        }
        return () => undefined;
      }
    });

    providerTestResult?.({ ok: false, message: "provider failed" });

    expect(bridge.getState().providerTest).toEqual({
      status: "error",
      message: "provider failed"
    });
  });

  it("plays assistant audio chunks through the configured speech output when enabled", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const speechOutput = {
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      speechOutput
    );
    bridge.updateSettings({ voiceSpeechEnabled: true, voiceId: "voice-greyfield", voiceVolume: 0.5 });

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Speak this.", data: new Uint8Array([1]) });
    await flushSpeechPlaybackQueue();

    expect(speechOutput.speak).toHaveBeenCalledWith("Speak this.", expect.objectContaining({
      audio: new Uint8Array([1]),
      voiceId: "voice-greyfield",
      volume: 0.5
    }));
  });

  it("serializes assistant audio chunks so replies cannot overlap", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const finishSpeech: Array<() => void> = [];
    const speechOutput = {
      speak: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishSpeech.push(resolve);
          })
      ),
      cancel: vi.fn()
    };
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      speechOutput
    );
    bridge.updateSettings({ voiceSpeechEnabled: true });

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "First sentence.", data: new Uint8Array([1]) });
    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Second sentence.", data: new Uint8Array([2]) });
    await flushSpeechPlaybackQueue();

    expect(speechOutput.speak).toHaveBeenCalledTimes(1);
    expect(speechOutput.speak).toHaveBeenNthCalledWith(1, "First sentence.", expect.any(Object));
    expect(bridge.getState().audioQueue).toEqual(["First sentence.", "Second sentence."]);

    finishSpeech[0]?.();
    await flushSpeechPlaybackQueue();
    await flushSpeechPlaybackQueue();

    expect(speechOutput.speak).toHaveBeenCalledTimes(2);
    expect(speechOutput.speak).toHaveBeenNthCalledWith(2, "Second sentence.", expect.any(Object));
  });

  it("sends microphone audio to Electron main and renders the transcript as user text", () => {
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

    const listening = bridge.startVoiceInput();
    const transcribing = bridge.finishVoiceInput(new Uint8Array([1, 2, 3]));
    runtimeEvent?.({ type: "transcript.final", text: "语音消息" });

    expect(listening.voiceInput).toEqual({ status: "listening", message: "Listening..." });
    expect(transcribing.voiceInput).toEqual({ status: "transcribing", message: "Transcribing voice..." });
    expect(sent).toContainEqual(["runtime:input", { type: "audio.chunk", data: new Uint8Array() }]);
    expect(sent).toContainEqual(["runtime:input", { type: "audio.chunk", data: new Uint8Array([1, 2, 3]) }]);
    expect(sent).toContainEqual(["runtime:input", { type: "audio.end" }]);
    expect(bridge.getState().messages).toContainEqual({ role: "user", text: "语音消息" });
    expect(bridge.getState().voiceInput).toEqual({ status: "idle", message: "" });
  });

  it("drives mouth-open while real audio playback reports decoded levels", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    let capturedOptions: SpeechOutputOptions | undefined;
    const mouthOpenValues: number[] = [];
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      {
        speak: vi.fn(async (_text, options) => {
          capturedOptions = options;
          options?.onMouthOpen?.(0.73);
        }),
        cancel: vi.fn()
      }
    );
    bridge.updateSettings({ voiceSpeechEnabled: true });
    bridge.onStateChange((state) => mouthOpenValues.push(state.stage.mouthOpen));

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Speak this.", data: new Uint8Array([1]) });
    await flushSpeechPlaybackQueue();

    expect(capturedOptions?.onMouthOpen).toBeTypeOf("function");
    expect(mouthOpenValues).toContain(0.73);
    expect(bridge.getState().stage.mouthOpen).toBe(0);
  });

  it("removes speech items from the queue after playback finishes", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    let finishSpeech: (() => void) | undefined;
    const sent: Array<[string, unknown]> = [];
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: (channel, payload) => sent.push([channel, payload]),
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      {
        speak: vi.fn(() => new Promise<void>((resolve) => (finishSpeech = resolve))),
        cancel: vi.fn()
      }
    );
    bridge.updateSettings({ voiceSpeechEnabled: true });

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Speak this.", data: new Uint8Array([1]) });
    expect(bridge.getState().audioQueue).toEqual(["Speak this."]);
    await flushSpeechPlaybackQueue();

    finishSpeech?.();
    await flushSpeechPlaybackQueue();
    await flushSpeechPlaybackQueue();

    expect(bridge.getState().audioQueue).toEqual([]);
    expect(sent).toContainEqual(["runtime:speech-playback", { type: "finished", text: "Speak this." }]);
  });

  it("removes speech items when another window reports playback finished", () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    let playbackEvent: ((event: import("../../shared/ipc").DesktopSpeechPlaybackEvent) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "runtime:event") {
          runtimeEvent = handler as typeof runtimeEvent;
        }
        if (channel === "runtime:speech-playback") {
          playbackEvent = handler as typeof playbackEvent;
        }
        return () => undefined;
      }
    });

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Shared speech.", data: new Uint8Array([1]) });
    expect(bridge.getState().audioQueue).toEqual(["Shared speech."]);

    playbackEvent?.({ type: "finished", text: "Shared speech." });

    expect(bridge.getState().audioQueue).toEqual([]);
  });

  it("keeps text state and shows a voice-only error when speech output fails", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      {
        speak: vi.fn(async () => {
          throw new Error("speaker blocked");
        }),
        cancel: vi.fn()
      }
    );
    bridge.updateSettings({ voiceSpeechEnabled: true });

    runtimeEvent?.({ type: "assistant.text.final", text: "Text stays visible." });
    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Text stays visible.", data: new Uint8Array([1]) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridge.getState().messages.at(-1)).toEqual({ role: "assistant", text: "Text stays visible." });
    expect(bridge.getState().voiceErrorMessage).toBe("Voice playback failed: speaker blocked");
    expect(bridge.getState().audioQueue).toEqual([]);
  });

  it("ignores late speech playback failures after interrupt", async () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    let failSpeech: ((error: Error) => void) | undefined;
    const speechOutput = {
      speak: vi.fn(() => new Promise<void>((_resolve, reject) => (failSpeech = reject))),
      cancel: vi.fn()
    };
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      speechOutput
    );
    bridge.updateSettings({ voiceSpeechEnabled: true });

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Queued speech.", data: new Uint8Array([1]) });
    await bridge.interrupt();
    failSpeech?.(new Error("late speaker failure"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(speechOutput.cancel).toHaveBeenCalledOnce();
    expect(bridge.getState()).toMatchObject({
      status: "interrupted",
      voiceErrorMessage: "",
      audioQueue: []
    });
  });

  it("does not speak assistant audio chunks when voice output is disabled", () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const speechOutput = {
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      speechOutput
    );

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Stay quiet.", data: new Uint8Array([1]) });

    expect(speechOutput.speak).not.toHaveBeenCalled();
  });

  it("cancels speech output and clears audio queue when the runtime is interrupted elsewhere", () => {
    let runtimeEvent: ((event: import("@greyfield/core-runtime").RuntimeOutputEvent) => void) | undefined;
    const speechOutput = {
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    const bridge = createDesktopRuntimeBridgeWithSpeech(
      {
        send: () => undefined,
        on: (channel, handler) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler as typeof runtimeEvent;
          }
          return () => undefined;
        }
      },
      speechOutput
    );

    runtimeEvent?.({ type: "assistant.audio.chunk", text: "Queued speech.", data: new Uint8Array([1]) });
    runtimeEvent?.({ type: "runtime.status", status: "interrupted" });

    expect(speechOutput.cancel).toHaveBeenCalledOnce();
    expect(bridge.getState()).toMatchObject({
      status: "interrupted",
      assistantDraft: "",
      audioQueue: [],
      stage: { mouthOpen: 0 }
    });
  });

  it("adds retry guidance to provider configuration test failures", () => {
    let providerTestResult:
      | ((event: { ok: boolean; message: string; firstToken?: string }) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "provider:test-llm-result") {
          providerTestResult = handler as typeof providerTestResult;
        }
        return () => undefined;
      }
    });

    providerTestResult?.({ ok: false, message: "OpenAI-compatible LLM request failed: 401 Unauthorized" });

    expect(bridge.getState().providerTest).toEqual({
      status: "error",
      message: "OpenAI-compatible LLM request failed: 401 Unauthorized. Check API key, Base URL, and Model, then retry."
    });
  });

  it("adds retry guidance to main-process provider readiness test failures", () => {
    let providerTestResult:
      | ((event: { ok: boolean; message: string; firstToken?: string }) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "provider:test-llm-result") {
          providerTestResult = handler as typeof providerTestResult;
        }
        return () => undefined;
      }
    });

    providerTestResult?.({ ok: false, message: "OpenAI-compatible provider needs a Base URL before testing." });
    expect(bridge.getState().providerTest.message).toBe(
      "OpenAI-compatible provider needs a Base URL before testing. Check API key, Base URL, and Model, then retry."
    );

    providerTestResult?.({ ok: false, message: "OpenAI-compatible provider needs a model before testing." });
    expect(bridge.getState().providerTest.message).toBe(
      "OpenAI-compatible provider needs a model before testing. Check API key, Base URL, and Model, then retry."
    );
  });

  it("adds active-chat guidance when provider testing is rejected during a response", () => {
    let providerTestResult:
      | ((event: { ok: boolean; message: string; firstToken?: string }) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: () => undefined,
      on: (channel, handler) => {
        if (channel === "provider:test-llm-result") {
          providerTestResult = handler as typeof providerTestResult;
        }
        return () => undefined;
      }
    });

    providerTestResult?.({ ok: false, message: "LLM test is unavailable while a chat response is running." });

    expect(bridge.getState().providerTest).toEqual({
      status: "error",
      message: "LLM test is unavailable while a chat response is running. Stop the current reply or wait for it to finish, then retry."
    });
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
    expect(initial.status).toBe("thinking");
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

  it("restores the failed user text as draft when a runtime error happens", async () => {
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

    await bridge.sendText("帮我继续");
    runtimeEvent?.({ type: "error", message: "provider timed out" });

    expect(bridge.getState()).toMatchObject({
      errorMessage: "provider timed out",
      inputDraft: "帮我继续"
    });
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

  it("keeps the in-progress API key draft when Electron echoes masked saved settings", () => {
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

    bridge.updateSettings({ providerApiKey: "typed-secret" });
    settingsChanged?.({
      ...bridge.getConfigSnapshot(),
      provider: { ...bridge.getConfigSnapshot().provider, apiKey: API_KEY_MASK, hasApiKey: true }
    });

    expect(bridge.getState().settings.providerApiKey).toBe("typed-secret");
    expect(bridge.getState().settings.providerHasApiKey).toBe(true);
  });

  it("keeps a new API key draft when a stale empty settings echo arrives after clearing", () => {
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

    bridge.updateSettings({ providerApiKey: "" });
    bridge.updateSettings({ providerApiKey: "new-secret" });
    settingsChanged?.({
      ...bridge.getConfigSnapshot(),
      provider: { ...bridge.getConfigSnapshot().provider, apiKey: "", hasApiKey: false }
    });

    expect(bridge.getState().settings.providerApiKey).toBe("new-secret");
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

  it("shows stopped immediately and ignores late assistant events after interrupt", async () => {
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

    await bridge.sendText("停一下");
    runtimeEvent?.({ type: "runtime.status", status: "speaking" });
    runtimeEvent?.({ type: "assistant.text.delta", text: "旧回复" });
    const stopped = await bridge.interrupt();
    runtimeEvent?.({ type: "assistant.text.delta", text: "不该出现" });
    runtimeEvent?.({ type: "assistant.text.final", text: "旧回复不该入历史" });
    runtimeEvent?.({ type: "assistant.audio.chunk", text: "旧语音不该排队", data: new Uint8Array([1]) });

    expect(stopped.status).toBe("interrupted");
    expect(bridge.getState()).toMatchObject({
      status: "interrupted",
      assistantDraft: "",
      audioQueue: [],
      messages: [{ role: "user", text: "停一下" }]
    });
  });

  it("requests and stores memory debug snapshots from Electron main", () => {
    const sent: Array<[string, unknown]> = [];
    let memorySnapshot: ((snapshot: import("../../shared/ipc").DesktopMemoryDebugSnapshot) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "memory:debug-snapshot") {
          memorySnapshot = handler as typeof memorySnapshot;
        }
        return () => undefined;
      }
    });

    const loading = bridge.requestMemoryDebugSnapshot();
    memorySnapshot?.({
      threadId: "thread-a",
      sessionId: "session-a",
      recentTurns: [
        {
          id: "session-a-1",
          role: "user",
          content: "I like Hiyori.",
          createdAt: "2026-06-26T00:00:00.000Z"
        }
      ],
      summarySegments: [
        {
          id: "summary-1",
          threadId: "thread-a",
          sessionId: "session-a",
          summary: "User prefers Hiyori.",
          recallCues: ["hiyori"],
          sourceTurns: [
            {
              sessionId: "session-a",
              turnId: "session-a-1",
              role: "user",
              createdAt: "2026-06-26T00:00:00.000Z"
            }
          ],
          createdAt: "2026-06-26T00:00:01.000Z"
        }
      ],
      memoryAtoms: [
        {
          id: "atom-preference-hiyori",
          threadId: "thread-a",
          type: "preference",
          text: "User prefers Hiyori.",
          sourceTurnIds: ["session-a-1"],
          createdAt: "2026-06-26T00:00:01.000Z",
          importance: 0.8,
          triggerKeys: ["hiyori"],
          triggers: {
            exact: ["Hiyori"],
            aliases: [],
            secondary: []
          },
          metadata: {}
        }
      ],
      lastRecallContext: {
        items: [
          {
            kind: "summary-segment",
            id: "summary-1",
            summary: "User prefers Hiyori.",
            recallCues: ["hiyori"],
            sourceTurnIds: ["session-a-1"],
            reason: "cue:hiyori",
            score: 5
          }
        ],
        skipped: [],
        budget: {
          itemCount: { used: 1, limit: 3, skipped: 0 },
          characters: { used: 0, limit: 1200, skipped: 0 },
          sourcePassages: { usedCharacters: 0, limitCharacters: 0, usedCount: 0, limitCount: 0, skippedCount: 0 }
        }
      },
      updatedAt: "2026-06-26T00:00:02.000Z"
    });

    expect(loading.memoryDebug.status).toBe("loading");
    expect(sent).toContainEqual(["memory:debug-request", {}]);
    expect(bridge.getState().memoryDebug).toMatchObject({
      status: "ready",
      snapshot: {
        threadId: "thread-a",
        summarySegments: [expect.objectContaining({ id: "summary-1" })],
        memoryAtoms: [expect.objectContaining({ id: "atom-preference-hiyori" })],
        lastRecallContext: {
          items: [expect.objectContaining({ reason: "cue:hiyori" })]
        }
      }
    });
  });

  it("sends memory atom control commands and records action results", () => {
    const sent: Array<[string, unknown]> = [];
    let memoryActionResult: ((result: import("../../shared/ipc").DesktopMemoryActionResult) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "memory:action-result") {
          memoryActionResult = handler as typeof memoryActionResult;
        }
        return () => undefined;
      }
    });

    const saving = bridge.updateMemoryAtom({
      id: "atom-preference-hiyori",
      text: "Edited atom memory."
    });
    memoryActionResult?.({ ok: true, message: "Atom memory atom-preference-hiyori saved." });
    bridge.updateMemoryAtom({ id: "atom-preference-hiyori", disabled: true });
    bridge.exportMemoryAtom("atom-preference-hiyori");
    bridge.deleteMemoryAtom("atom-preference-hiyori");
    bridge.clearCurrentRoleMemoryAtoms();

    expect(saving.memoryDebug).toMatchObject({
      actionStatus: "working",
      actionMessage: "Saving atom memory..."
    });
    expect(sent).toContainEqual([
      "memory:atom-update",
      { id: "atom-preference-hiyori", text: "Edited atom memory." }
    ]);
    expect(sent).toContainEqual(["memory:atom-update", { id: "atom-preference-hiyori", disabled: true }]);
    expect(sent).toContainEqual(["memory:atom-export", { id: "atom-preference-hiyori" }]);
    expect(sent).toContainEqual(["memory:atom-delete", { id: "atom-preference-hiyori" }]);
    expect(sent).toContainEqual(["memory:atom-clear-current-role", {}]);
    expect(bridge.getState().memoryDebug).toMatchObject({
      actionStatus: "working",
      actionMessage: "Clearing current role atom memory..."
    });
  });

  it("sends memory summary control commands and records action results", () => {
    const sent: Array<[string, unknown]> = [];
    let memoryActionResult: ((result: import("../../shared/ipc").DesktopMemoryActionResult) => void) | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "memory:action-result") {
          memoryActionResult = handler as typeof memoryActionResult;
        }
        return () => undefined;
      }
    });

    const saving = bridge.updateMemorySummary({
      id: "summary-1",
      summary: "Edited memory.",
      recallCues: ["edited"]
    });
    memoryActionResult?.({ ok: true, message: "Memory summary-1 saved." });
    bridge.updateMemorySummary({ id: "summary-1", disabled: true });
    bridge.deleteMemorySummary("summary-1");
    bridge.clearMemorySummaries();

    expect(saving.memoryDebug).toMatchObject({
      actionStatus: "working",
      actionMessage: "Saving memory..."
    });
    expect(sent).toContainEqual([
      "memory:summary-update",
      { id: "summary-1", summary: "Edited memory.", recallCues: ["edited"] }
    ]);
    expect(sent).toContainEqual(["memory:summary-update", { id: "summary-1", disabled: true }]);
    expect(sent).toContainEqual(["memory:summary-delete", { id: "summary-1" }]);
    expect(sent).toContainEqual(["memory:summary-clear", {}]);
    expect(bridge.getState().memoryDebug).toMatchObject({
      actionStatus: "working",
      actionMessage: "Clearing summary memory..."
    });
  });

  it("formats memory export results as copyable JSON", () => {
    const sent: Array<[string, unknown]> = [];
    let memoryExportResult:
      | ((result: import("../../shared/ipc").DesktopIpcEventMap["memory:export-result"]) => void)
      | undefined;
    const bridge = createDesktopRuntimeBridge({
      send: (channel, payload) => sent.push([channel, payload]),
      on: (channel, handler) => {
        if (channel === "memory:export-result") {
          memoryExportResult = handler as typeof memoryExportResult;
        }
        return () => undefined;
      }
    });

    const exporting = bridge.exportMemory();
    memoryExportResult?.({
      ok: true,
      message: "Memory export is ready.",
      export: {
        threadId: "thread-a",
        sessionId: "session-a",
        recentTurns: [],
        summarySegments: [],
        memoryAtoms: [
          {
            id: "atom-preference-hiyori",
            threadId: "thread-a",
            type: "preference",
            text: "User prefers Hiyori.",
            sourceTurnIds: ["session-a-1"],
            createdAt: "2026-06-26T00:00:01.000Z",
            importance: 0.8,
            triggerKeys: ["hiyori"],
            triggers: {
              exact: ["Hiyori"],
              aliases: [],
              secondary: []
            },
            metadata: {}
          }
        ],
        exportedAt: "2026-06-26T00:00:00.000Z"
      }
    });

    expect(exporting.memoryDebug).toMatchObject({
      actionStatus: "working",
      actionMessage: "Preparing memory export..."
    });
    expect(sent).toContainEqual(["memory:export-request", {}]);
    expect(bridge.getState().memoryDebug).toMatchObject({
      actionStatus: "success",
      actionMessage: "Memory export is ready."
    });
    expect(bridge.getState().memoryDebug.exportText).toContain('"threadId": "thread-a"');
    expect(bridge.getState().memoryDebug.exportText).toContain('"atom-preference-hiyori"');
  });
});
