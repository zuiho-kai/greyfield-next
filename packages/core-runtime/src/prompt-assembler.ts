import type { CharacterPersona } from "./persona";
import type { ChatMessage } from "./providers";
import { formatRecallContextForPrompt, type RecallContext } from "./memory-context";
import { formatMemoryAtomRecallContextForPrompt, type MemoryAtomRecallContext } from "./memory-atoms";
import type { SessionTurn } from "./session-store";

export interface PromptAssemblyInput {
  persona: CharacterPersona;
  memory: string;
  handoff: string;
  recent: SessionTurn[];
  input: string;
  sessionId: string;
  threadId: string;
  recallContext?: RecallContext;
  atomRecallContext?: MemoryAtomRecallContext;
}

export function assemblePrompt(input: PromptAssemblyInput): ChatMessage[] {
  const persona = input.persona;
  const speakingStyle = readPersonaText(persona.speakingStyle, persona.tone);
  const systemSections = [
    `Character: ${persona.name}`,
    `User address: ${readPersonaText(persona.userAddress, "the user")}`,
    `Background:\n${readPersonaText(persona.background, "A Live2D desktop companion focused on presence, conversation, and continuity.")}`,
    `Personality:\n${readPersonaText(persona.personality, persona.tone)}`,
    `Speaking style:\n${speakingStyle}`,
    `Greeting:\n${readPersonaText(persona.greeting, "你好，我在。")}`,
    `Runtime boundary: Greyfield Next V1 is a visible Live2D desktop companion, not a desktop-control or multi-agent system.`,
    persona.boundaries.length > 0 ? `Boundaries:\n${persona.boundaries.map((boundary) => `- ${boundary}`).join("\n")}` : "",
    `Expression map:\n${Object.entries(persona.expressionMap)
      .map(([state, expression]) => `- ${state}: ${expression}`)
      .join("\n")}`,
    `Thread: ${input.threadId}`,
    `Session: ${input.sessionId}`,
    input.memory.trim().length > 0 ? `Memory:\n${input.memory.trim()}` : "Memory: none yet.",
    input.atomRecallContext ? formatAtomRecallContextSection(input.atomRecallContext) : "",
    input.recallContext ? formatRecallContextSection(input.recallContext) : "",
    input.handoff.trim().length > 0 ? `Recent handoff:\n${input.handoff.trim()}` : "Recent handoff: none yet."
  ].filter((section) => section.length > 0);

  return [
    { role: "system", content: systemSections.join("\n\n") },
    ...input.recent.map((turn): ChatMessage => ({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.content })),
    { role: "user", content: input.input }
  ];
}

function formatRecallContextSection(context: RecallContext): string {
  const formatted = formatRecallContextForPrompt(context);
  return formatted.length > 0 ? `Recall context:\n${formatted}` : "Recall context: no relevant long-context summaries.";
}

function formatAtomRecallContextSection(context: MemoryAtomRecallContext): string {
  const formatted = formatMemoryAtomRecallContextForPrompt(context);
  return formatted.length > 0
    ? `Long-term recall context:\n${formatted}`
    : "Long-term recall context: no relevant source-linked long-term memories.";
}

function readPersonaText(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}
