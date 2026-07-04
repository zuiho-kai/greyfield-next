import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeOutputEvent } from "@greyfield/core-runtime";
import { useWindowRuntimeState } from "../use-window-runtime-state";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWindowRuntimeState", () => {
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
