import { describe, expect, it, vi } from "vitest";
import { createLive2DStageLoader } from "../live2d-stage-loader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeDriver() {
  return { loadModel: vi.fn(async (_path: string) => {}), destroy: vi.fn() };
}

describe("Live2D stage loading", () => {
  it("shares delayed initialization and loads the latest configured path", async () => {
    const driver = fakeDriver();
    const initialization = deferred<typeof driver>();
    const createDriver = vi.fn(() => initialization.promise);
    const loader = createLive2DStageLoader(createDriver);
    const mounted = loader.load("bundled.model3.json");
    await Promise.resolve();
    const hydrated = loader.load("file:///configured.model3.json");
    initialization.resolve(driver);

    expect(await mounted).toBeNull();
    expect(await hydrated).toBe(driver);
    expect(createDriver).toHaveBeenCalledTimes(1);
    expect(driver.loadModel.mock.calls).toEqual([["file:///configured.model3.json"]]);
  });

  it("finishes an in-flight load before loading the latest model, skipping superseded paths", async () => {
    const driver = fakeDriver();
    const firstLoad = deferred<void>();
    const started = deferred<void>();
    driver.loadModel.mockImplementationOnce(async () => { started.resolve(); await firstLoad.promise; });
    const loader = createLive2DStageLoader(async () => driver);
    const first = loader.load("first.model3.json");
    await started.promise;
    const skipped = loader.load("skipped.model3.json");
    const latest = loader.load("latest.model3.json");
    expect(driver.loadModel).toHaveBeenCalledTimes(1);
    firstLoad.resolve();

    expect(await first).toBeNull();
    expect(await skipped).toBeNull();
    expect(await latest).toBe(driver);
    expect(driver.loadModel.mock.calls).toEqual([["first.model3.json"], ["latest.model3.json"]]);
  });

  it("retries failed initialization and model loads without poisoning the queue", async () => {
    const driver = fakeDriver();
    const createDriver = vi.fn(async () => driver).mockRejectedValueOnce(new Error("core unavailable"));
    const loader = createLive2DStageLoader(createDriver);
    await expect(loader.load("first.model3.json")).rejects.toThrow("core unavailable");
    driver.loadModel.mockRejectedValueOnce(new Error("invalid model"));
    await expect(loader.load("broken.model3.json")).rejects.toThrow("invalid model");
    expect(await loader.load("valid.model3.json")).toBe(driver);
    expect(createDriver).toHaveBeenCalledTimes(2);
  });

  it("destroys a renderer that finishes initialization after unmount, without loading its model", async () => {
    const driver = fakeDriver();
    const initialization = deferred<typeof driver>();
    const loader = createLive2DStageLoader(() => initialization.promise);
    const load = loader.load("first.model3.json");
    await Promise.resolve();
    const disposed = loader.dispose();
    initialization.resolve(driver);
    await disposed;
    expect(await load).toBeNull();
    expect(driver.loadModel).not.toHaveBeenCalled();
    expect(driver.destroy).toHaveBeenCalledTimes(1);
    expect(await loader.load("after-unmount.model3.json")).toBeNull();
    await loader.dispose();
    expect(driver.destroy).toHaveBeenCalledTimes(1);
  });

  it("waits for a pending model before destroying and ignores its obsolete failure", async () => {
    const driver = fakeDriver();
    const started = deferred<void>();
    const pending = deferred<void>();
    driver.loadModel.mockImplementationOnce(async () => { started.resolve(); await pending.promise; });
    const loader = createLive2DStageLoader(async () => driver);
    const load = loader.load("pending.model3.json");
    await started.promise;
    const disposed = loader.dispose();
    expect(driver.destroy).not.toHaveBeenCalled();
    pending.reject(new Error("model load failed after unmount"));
    await disposed;
    expect(await load).toBeNull();
    expect(driver.destroy).toHaveBeenCalledTimes(1);
  });
});
