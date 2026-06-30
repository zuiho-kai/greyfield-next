import { describe, expect, it } from "vitest";
import { resolveActiveSettingsSection } from "../settings-nav";

describe("settings nav", () => {
  it("chooses the section closest to the control surface top", () => {
    expect(
      resolveActiveSettingsSection(
        [
          { id: "model", top: -120 },
          { id: "voice", top: 44 },
          { id: "window", top: 360 }
        ],
        40
      )
    ).toBe("voice");
  });

  it("returns null before section refs are registered", () => {
    expect(resolveActiveSettingsSection([], 0)).toBeNull();
  });
});
