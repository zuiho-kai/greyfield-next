import { describe, expect, it, vi } from "vitest";
import type { RuntimeInputEvent, RuntimeOutputEvent } from "@greyfield/core-runtime";
import { RuntimeIpcController } from "../runtime-ipc-controller";

describe("RuntimeIpcController", () => {
  it("broadcasts runtime events emitted by the runtime service", async () => {
    const emitted: RuntimeOutputEvent[] = [];
    const service = {
      handle: vi.fn(async (_input: RuntimeInputEvent, emit: (event: RuntimeOutputEvent) => Promise<void>) => {
        await emit({ type: "runtime.status", status: "thinking" });
        await emit({ type: "assistant.text.final", text: "pong" });
      })
    };
    const controller = new RuntimeIpcController({
      service,
      broadcast: (event) => emitted.push(event)
    });

    await controller.handleRuntimeInput({ type: "text.input", text: "ping" });

    expect(service.handle).toHaveBeenCalledWith({ type: "text.input", text: "ping" }, expect.any(Function));
    expect(emitted).toEqual([
      { type: "runtime.status", status: "thinking" },
      { type: "assistant.text.final", text: "pong" }
    ]);
  });

  it("broadcasts an error event when the runtime service rejects", async () => {
    const emitted: RuntimeOutputEvent[] = [];
    const controller = new RuntimeIpcController({
      service: {
        handle: vi.fn(async () => {
          throw new Error("provider failed");
        })
      },
      broadcast: (event) => emitted.push(event)
    });

    await controller.handleRuntimeInput({ type: "text.input", text: "ping" });

    expect(emitted).toEqual([{ type: "error", message: "provider failed" }]);
  });
});
