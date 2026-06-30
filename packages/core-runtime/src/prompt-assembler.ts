import type { CharacterPersona } from "./persona";
import type { ChatMessage, ChatContentPart } from "./providers";
import { formatRecallContextForPrompt, type RecallContext } from "./memory-context";
import { formatMemoryAtomRecallContextForPrompt, type MemoryAtomRecallContext } from "./memory-atoms";
import type { SessionTurn } from "./session-store";
import type { RuntimeImageAttachment, RuntimeObservationMetadata } from "./vision-attachments";

export interface PromptAssemblyInput {
  persona: CharacterPersona;
  memory: string;
  handoff: string;
  recent: SessionTurn[];
  input: string;
  inputAttachments?: RuntimeImageAttachment[];
  observation?: RuntimeObservationMetadata;
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
    input.handoff.trim().length > 0 ? `Recent handoff:\n${input.handoff.trim()}` : "Recent handoff: none yet.",
    input.observation ? formatObservationBoundary(input.observation) : ""
  ].filter((section) => section.length > 0);

  return [
    { role: "system", content: systemSections.join("\n\n") },
    ...input.recent.map((turn): ChatMessage => ({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.content })),
    { role: "user", content: formatUserInputContent(input.input, input.inputAttachments) }
  ];
}

function formatUserInputContent(text: string, attachments: RuntimeImageAttachment[] | undefined): string | ChatContentPart[] {
  const trimmed = text.trim();
  if (!attachments || attachments.length === 0) {
    return trimmed;
  }
  return [
    { type: "text", text: trimmed.length > 0 ? trimmed : "Please answer based on the temporary desktop visual context." },
    ...attachments.map((attachment): ChatContentPart => ({
      type: "image_url",
      image_url: {
        url: attachment.dataUrl,
        detail: attachment.source === "screenshot" ? "high" : "low"
      }
    }))
  ];
}

function formatObservationBoundary(observation: RuntimeObservationMetadata): string {
  const source =
    observation.source === "desktop-screen-awareness"
      ? "recent desktop visual context from Screen awareness mode"
      : observation.source === "user-active-screenshot"
        ? "one user-requested screenshot"
        : "a user-requested short screenshot sequence";
  return [
    "Temporary visual observation:",
    `- Source: ${source}.`,
    observation.source === "desktop-screen-awareness"
      ? "- Screen awareness may use a low-cost recent frame only for this turn."
      : `- Frames sent this turn: ${observation.dedupedFrameCount} of ${observation.frameCount}.`,
    "- Raw screenshots, frame data, and local file paths are temporary input only.",
    "- Do not claim control of the desktop or access beyond the provided visual input.",
    "- Durable facts or preferences may be remembered only when the conversation confirms them."
  ].join("\n");
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
