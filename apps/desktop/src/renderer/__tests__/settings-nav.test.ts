import { describe, expect, it } from "vitest";
import { resolveActiveSettingsSection, settingsNavSectionIds } from "../settings-nav";

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

  it("includes the provider model-service section in navigation", () => {
    expect(settingsNavSectionIds).toContain("provider");
    expect(
      resolveActiveSettingsSection(
        [
          { id: "persona", top: -180 },
          { id: "provider", top: 16 },
          { id: "memory", top: 520 }
        ],
        24
      )
    ).toBe("provider");
  });

  it("returns null before section refs are registered", () => {
    expect(resolveActiveSettingsSection([], 0)).toBeNull();
  });
});
