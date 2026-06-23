import { describe, expect, it, vi } from "vitest";
import { getUsableWindow, hideWindowIfUsable, showWindowIfUsable } from "../window-lifecycle";

describe("window lifecycle helpers", () => {
  it("returns only non-destroyed windows", () => {
    const liveWindow = { isDestroyed: () => false };
    const destroyedWindow = { isDestroyed: () => true };

    expect(getUsableWindow(liveWindow)).toBe(liveWindow);
    expect(getUsableWindow(destroyedWindow)).toBeUndefined();
    expect(getUsableWindow(undefined)).toBeUndefined();
  });

  it("does not call show or hide on destroyed windows", () => {
    const liveWindow = { isDestroyed: () => false, show: vi.fn(), hide: vi.fn() };
    const destroyedWindow = { isDestroyed: () => true, show: vi.fn(), hide: vi.fn() };

    showWindowIfUsable(liveWindow);
    hideWindowIfUsable(liveWindow);
    showWindowIfUsable(destroyedWindow);
    hideWindowIfUsable(destroyedWindow);

    expect(liveWindow.show).toHaveBeenCalledOnce();
    expect(liveWindow.hide).toHaveBeenCalledOnce();
    expect(destroyedWindow.show).not.toHaveBeenCalled();
    expect(destroyedWindow.hide).not.toHaveBeenCalled();
  });
});
