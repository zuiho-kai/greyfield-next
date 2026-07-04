import { describe, expect, it, vi } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { createDefaultRuntimePersona, loadRuntimePersona } from "../runtime-persona";

describe("runtime persona helpers", () => {
  it("builds the default Greyfield persona from the interaction profile", () => {
    const persona = createDefaultRuntimePersona({
      emotionReactions: {
        happy: { expression: "smile" },
        idle: {}
      }
    });

    expect(persona).toMatchObject({
      name: "Greyfield",
      greeting: "你好，我在。",
      expressionMap: {
        happy: "smile",
        idle: "default"
      }
    });
  });

  it("uses a custom persona loader when one is provided", async () => {
    const loadPersona = vi.fn(async () => ({
      name: "Custom Greyfield",
      userAddress: "captain",
      background: "custom background",
      personality: "custom personality",
      speakingStyle: "custom style",
      greeting: "hello",
      tone: "custom tone",
      boundaries: ["custom boundary"],
      expressionMap: { happy: "custom" }
    }));

    await expect(
      loadRuntimePersona({
        config: defaultGreyfieldConfig,
        interactionProfile: { emotionReactions: { happy: { expression: "smile" } } },
        loadPersona
      })
    ).resolves.toMatchObject({
      name: "Custom Greyfield",
      expressionMap: { happy: "custom" }
    });
    expect(loadPersona).toHaveBeenCalledWith(defaultGreyfieldConfig);
  });
});
