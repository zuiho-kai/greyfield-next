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
    if (event.status === "interrupted") {
      return {
        ...state,
        status: event.status,
        voiceInput: {
          status: "idle",
          message: ""
        },
        assistantDraft: "",
        audioQueue: [],
        stage: {
          ...state.stage,
          ...stageReactionForStatus(event.status, interactionProfile),
          mouthOpen: 0
        }
      };
    }
    return {
      ...state,
      status: event.status,
      voiceInput:
        event.status === "listening"
          ? {
              status: state.voiceInput.status === "transcribing" ? "transcribing" : "listening",
              message: state.voiceInput.status === "transcribing" ? "Transcribing voice..." : "Listening..."
            }
          : event.status === "thinking" || event.status === "speaking" || event.status === "idle"
            ? {
                status: "idle",
                message: ""
              }
            : state.voiceInput,
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
      voiceErrorMessage: "",
      voiceInput: {
        status: "error",
        message: event.message
      },
      inputDraft: lastUserMessage,
      assistantDraft: "",
      audioQueue: [],
      stage: {
        ...state.stage,
        mouthOpen: 0
      }
    };
  }

  if (event.type === "transcript.final") {
    if (state.status === "interrupted") {
      return state;
    }
    return {
      ...state,
      voiceInput: {
        status: "idle",
        message: ""
      },
      errorMessage: "",
      messages: [...state.messages, { role: "user", text: event.text }]
    };
  }

  if (event.type === "assistant.text.delta") {
    if (state.status === "interrupted") {
      return state;
    }
    return {
      ...state,
      voiceErrorMessage: "",
      assistantDraft: `${state.assistantDraft}${event.text}`
    };
  }

  if (event.type === "assistant.text.final") {
    if (state.status === "interrupted") {
      return {
        ...state,
        assistantDraft: ""
      };
    }
    return {
      ...state,
      assistantDraft: "",
      messages: [...state.messages, { role: "assistant", text: event.text }]
    };
  }

  if (event.type === "assistant.audio.chunk") {
    if (state.status === "interrupted") {
      return state;
    }
    return {
      ...state,
      voiceErrorMessage: "",
      audioQueue: [...state.audioQueue, event.text],
      stage: {
        ...state.stage,
        mouthOpen: 0
      }
    };
  }

  if (event.type === "assistant.audio.error") {
    return {
      ...state,
      voiceErrorMessage: event.message
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
