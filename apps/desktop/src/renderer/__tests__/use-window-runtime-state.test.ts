import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeOutputEvent } from "@greyfield/core-runtime";
import { useWindowRuntimeState } from "../use-window-runtime-state";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWindowRuntimeState", () => {
  it("explicit user Stop closes continuous microphone while speech barge-in keeps it open", async () => {
    let cascadeState: ((state: { available: boolean; active: boolean; message: string }) => void) | undefined;
    const send = vi.fn();
    vi.stubGlobal("window", { greyfield: { send, on: (channel: string, handler: typeof cascadeState) => {
      if (channel === "cascade:state") cascadeState = handler;
      return () => undefined;
    } } });
    const runtime = useWindowRuntimeState({ isPetWindow: false, isChatWindow: false, isControlsWindow: false, queryModelPath: null });
    cascadeState!({ available: true, active: true, message: "" });
    await runtime.bridge.interrupt(); // Speech onset calls the bridge directly.
    expect(send).not.toHaveBeenCalledWith("cascade:command", { action: "stop" });
    await runtime.interrupt(); // The ordinary Stop button calls the window hook.
    expect(send).toHaveBeenCalledWith("cascade:command", { action: "stop" });
    runtime.dispose();
  });
  it("keeps repeated starts on NEKO through delayed host states and allows retry after error", async () => {
    const handlers: Array<(event: any) => void> = [];
    const send = vi.fn();
    vi.stubGlobal("window", { greyfield: { send, on: (channel: string, handler: (event: any) => void) => {
      if (channel === "neko:event") handlers.push(handler);
      return () => undefined;
    } } });
    const runtime = useWindowRuntimeState({ isPetWindow: false, isChatWindow: false, isControlsWindow: false, queryModelPath: null });
    const legacy = vi.spyOn(runtime.bridge, "startVoiceInput");
    const emit = (status: string) => handlers.forEach((handler) => handler({ type: "state", state: { status, message: status } }));
    emit("stopped");
    await runtime.startVoiceInput();
    await runtime.startVoiceInput();
    expect(runtime.state.value.nekoPlugin.status).toBe("starting");
    for (const status of ["starting", "connecting", "ready"]) {
      emit(status);
      await runtime.startVoiceInput();
      await runtime.startVoiceInput();
    }
    expect(send.mock.calls.filter(([channel, payload]) => channel === "neko:command" && payload.action === "start")).toHaveLength(1);
    expect(legacy).not.toHaveBeenCalled();
    await runtime.stopVoiceInput();
    expect(send).toHaveBeenCalledWith("neko:command", { action: "stop" });
    emit("error");
    await runtime.startVoiceInput();
    expect(runtime.state.value.nekoPlugin.status).toBe("starting");
    emit("not-installed");
    await runtime.startVoiceInput();
    expect(legacy).toHaveBeenCalledOnce();
    runtime.dispose();
  });
  it("does not clear local composer edits on unrelated async state changes", () => {
    const windowStateHandlers: Array<(state: { locked: boolean }) => void> = [];
    vi.stubGlobal("window", {
      greyfield: {
        send: () => undefined,
        on: (channel: string, handler: (event: unknown) => void) => {
          if (channel === "window:state") {
            windowStateHandlers.push(handler as (state: { locked: boolean }) => void);
          }
          return () => undefined;
        }
      }
    });

    const runtime = useWindowRuntimeState({
      isPetWindow: false,
      isChatWindow: false,
      isControlsWindow: false,
      queryModelPath: null
    });

    runtime.draft.value = "正在输入";
    for (const handler of windowStateHandlers) {
      handler({ locked: true });
    }

    expect(runtime.draft.value).toBe("正在输入");

    runtime.dispose();
  });

  it("syncs restored provider-failure drafts from async runtime events into the composer", async () => {
    let runtimeEvent: ((event: RuntimeOutputEvent) => void) | undefined;
    vi.stubGlobal("window", {
      greyfield: {
        send: () => undefined,
        on: (channel: string, handler: (event: RuntimeOutputEvent) => void) => {
          if (channel === "runtime:event") {
            runtimeEvent = handler;
          }
          return () => undefined;
        }
      }
    });

    const runtime = useWindowRuntimeState({
      isPetWindow: false,
      isChatWindow: false,
      isControlsWindow: false,
      queryModelPath: null
    });

    runtime.draft.value = "";
    await runtime.sendText("错误 key 重试");
    runtimeEvent?.({ type: "error", message: "OpenAI-compatible provider needs an API key before chatting." });

    expect(runtime.state.value).toMatchObject({
      status: "error",
      inputDraft: "错误 key 重试"
    });
    expect(runtime.draft.value).toBe("错误 key 重试");

    runtime.dispose();
  });
});
