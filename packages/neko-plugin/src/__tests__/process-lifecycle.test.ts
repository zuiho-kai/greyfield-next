import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { terminateChild } from "../process-lifecycle";
import { NekoPlugin } from "../index";

const platform = process.platform;
afterEach(() => { Object.defineProperty(process, "platform", { value: platform }); vi.useRealTimers(); });
function childProcess() {
  Object.defineProperty(process, "platform", { value: "linux" });
  return Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null, kill: vi.fn(() => true) });
}

it("waits for asynchronous POSIX exit before cleanup can finish", async () => {
  const child = childProcess();
  const stopped = vi.fn();
  const pending = terminateChild(child as unknown as ChildProcess).then(stopped);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  await Promise.resolve();
  expect(stopped).not.toHaveBeenCalled();
  child.emit("exit", null, "SIGTERM");
  await pending;
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(child.listenerCount("close")).toBe(0);
});

it("escalates a slow POSIX child and still waits for its close event", async () => {
  vi.useFakeTimers();
  const child = childProcess();
  const stopped = vi.fn();
  const pending = terminateChild(child as unknown as ChildProcess).then(stopped);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
  expect(stopped).not.toHaveBeenCalled();
  child.emit("close", null, "SIGKILL");
  await pending;
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("reports a bounded stop failure instead of claiming a still-running child stopped", async () => {
  vi.useFakeTimers();
  const child = childProcess();
  const pending = expect(terminateChild(child as unknown as ChildProcess)).rejects.toThrow("did not exit");
  await vi.advanceTimersByTimeAsync(7_000);
  await pending;
  expect(child.listenerCount("exit")).toBe(0);
});

it("keeps a child that failed to stop so the next cleanup still waits for it", async () => {
  vi.useFakeTimers();
  const child = childProcess();
  const plugin = new NekoPlugin({ root: "unused-process-lifecycle", emit: () => {} });
  const internals = plugin as unknown as { children: ChildProcess[] };
  internals.children.push(child as unknown as ChildProcess);
  const failedStop = plugin.stop();
  await vi.advanceTimersByTimeAsync(7_000);
  await failedStop;
  expect(plugin.getState().status).toBe("error");
  expect(internals.children).toContain(child);
  const retry = plugin.stop();
  await vi.advanceTimersByTimeAsync(0);
  child.emit("exit", null, "SIGTERM");
  await retry;
  expect(internals.children).toHaveLength(0);
  expect(plugin.getState().status).toBe("not-installed");
});
