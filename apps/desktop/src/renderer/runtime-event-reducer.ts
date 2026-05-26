import { createDefaultInteractionProfile, resolveEmotionReaction } from "@greyfield/stage-live2d";
import type { RuntimeOutputEvent } from "@greyfield/core-runtime";
import type { DesktopRendererState } from "./desktop-runtime-bridge";

export type RendererInteractionProfile = ReturnType<typeof createDefaultInteractionProfile>;

export function reduceRuntimeEvent(
  state: DesktopRendererState,
  event: RuntimeOutputEvent,
  interactionProfile: RendererInteractionProfile
): DesktopRendererState {
  if (event.type === "runtime.status") {
    return {
      ...state,
      status: event.status,
      stage: {
        ...state.stage,
        ...stageReactionForStatus(event.status, interactionProfile)
      }
    };
  }

  if (event.type === "error") {
    const lastUserMessage = [...state.messages].reverse().find((message) => message.role === "user")?.text ?? state.inputDraft;
    return {
      ...state,
      status: "error",
      errorMessage: event.message,
      inputDraft: lastUserMessage,
      assistantDraft: "",
      audioQueue: [],
      stage: {
        ...state.stage,
        mouthOpen: 0
      }
    };
  }

  if (event.type === "assistant.text.delta") {
    return {
      ...state,
      assistantDraft: `${state.assistantDraft}${event.text}`
    };
  }

  if (event.type === "assistant.text.final") {
    return {
      ...state,
      assistantDraft: "",
      messages: [...state.messages, { role: "assistant", text: event.text }]
    };
  }

  if (event.type === "assistant.audio.chunk") {
    return {
      ...state,
      audioQueue: [...state.audioQueue, event.text],
      stage: {
        ...state.stage,
        mouthOpen: 0
      }
    };
  }

  if (event.type === "assistant.audio.end") {
    return {
      ...state,
      stage: {
        ...state.stage,
        mouthOpen: 0
      }
    };
  }

  return state;
}

function stageReactionForStatus(
  status: string,
  profile: RendererInteractionProfile
): Partial<DesktopRendererState["stage"]> {
  if (status === "idle") {
    return {};
  }
  const reaction = resolveEmotionReaction(profile, status);
  return {
    ...(reaction.expression ? { expression: reaction.expression } : {}),
    ...(reaction.motion ? { motion: reaction.motion } : {})
  };
}
