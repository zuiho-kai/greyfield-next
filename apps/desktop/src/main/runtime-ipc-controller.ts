import type { RuntimeEventHandler, RuntimeInputEvent, RuntimeOutputEvent } from "@greyfield/core-runtime";

export interface RuntimeServiceLike {
  handle(input: RuntimeInputEvent, emit: RuntimeEventHandler): Promise<void>;
}

export interface RuntimeIpcControllerOptions {
  service: RuntimeServiceLike;
  broadcast(event: RuntimeOutputEvent): void;
}

export class RuntimeIpcController {
  constructor(private readonly options: RuntimeIpcControllerOptions) {}

  async handleRuntimeInput(input: RuntimeInputEvent): Promise<void> {
    try {
      await this.options.service.handle(input, async (event) => {
        this.options.broadcast(event);
      });
    } catch (error) {
      this.options.broadcast({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }
}
