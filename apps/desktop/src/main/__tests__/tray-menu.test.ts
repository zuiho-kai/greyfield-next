import { describe, expect, it, vi } from "vitest";
import { buildTrayMenuTemplate, type TrayMenuActions } from "../tray-menu";

function createActions(): TrayMenuActions {
  return {
    showModel: vi.fn(),
    showSettings: vi.fn(),
    openChat: vi.fn(),
    showControls: vi.fn(),
    toggleModelPassThrough: vi.fn(),
    interrupt: vi.fn(),
    quit: vi.fn()
  };
}

describe("buildTrayMenuTemplate", () => {
  it("keeps a tray recovery action for the pet model after Hide Model", () => {
    const template = buildTrayMenuTemplate(createActions(), { modelPassThrough: false });

    expect(template.map((item) => item.label ?? item.type)).toEqual([
      "Show Model",
      "Show Settings",
      "Open Chat",
      "Show Controls",
      "Model Pass Through",
      "Interrupt",
      "separator",
      "Quit"
    ]);
  });

  it("reflects the current model pass-through state", () => {
    const passThroughItem = buildTrayMenuTemplate(createActions(), { modelPassThrough: true }).find(
      (item) => item.label === "Model Pass Through"
    );

    expect(passThroughItem).toMatchObject({ type: "checkbox", checked: true });
  });
});
