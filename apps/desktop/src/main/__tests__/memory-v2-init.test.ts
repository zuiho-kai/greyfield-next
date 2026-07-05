import { describe, expect, it } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { shouldUseNewMemorySystem } from "../memory-v2-init";

describe("Memory V2 initialization", () => {
  it("enables Memory V2 by default while preserving explicit opt-out", () => {
    expect(shouldUseNewMemorySystem(defaultGreyfieldConfig)).toBe(true);
    expect(shouldUseNewMemorySystem({ memory: {} })).toBe(true);
    expect(shouldUseNewMemorySystem({ memory: { useV2System: false } })).toBe(false);
  });
});
