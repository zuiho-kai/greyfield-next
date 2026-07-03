import type { CharacterPersona } from "@greyfield/core-runtime";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export interface RuntimePersonaProfile {
  emotionReactions: Record<string, { expression?: string }>;
}

export interface RuntimePersonaLoaderInput {
  config: GreyfieldConfig;
  interactionProfile: RuntimePersonaProfile;
  loadPersona?: (config: GreyfieldConfig) => Promise<CharacterPersona>;
}

export async function loadRuntimePersona(input: RuntimePersonaLoaderInput): Promise<CharacterPersona> {
  return input.loadPersona?.(input.config) ?? createDefaultRuntimePersona(input.interactionProfile);
}

export function createDefaultRuntimePersona(interactionProfile: RuntimePersonaProfile): CharacterPersona {
  return {
    name: "Greyfield",
    userAddress: "you",
    background: "A Live2D desktop companion focused on presence, conversation, and continuity.",
    personality: "Warm, steady, observant, and lightly playful without pretending to control the desktop.",
    speakingStyle: "Keep replies short enough to speak naturally and prefer concrete progress over vague planning.",
    greeting: "你好，我在。",
    tone: "warm, concise, slightly playful",
    boundaries: ["V1 cannot control the desktop", "V1 cannot browse the web on its own"],
    expressionMap: Object.fromEntries(
      Object.entries(interactionProfile.emotionReactions).map(([status, reaction]) => [
        status,
        reaction.expression ?? "default"
      ])
    )
  };
}
