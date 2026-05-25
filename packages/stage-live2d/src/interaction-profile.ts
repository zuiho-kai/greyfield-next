import { resolveTouchArea, type MotionTarget, type TouchArea, type TouchPoint } from "./stage-config";

export interface StageReaction {
  motion?: MotionTarget;
  expression?: string;
  text?: string;
  voiceFeedback?: string;
}

export interface TouchReaction extends StageReaction {
  areaId: string;
}

export interface InteractionProfile {
  touchAreas: TouchArea[];
  touchReactions: Record<string, StageReaction>;
  emotionReactions: Record<string, StageReaction>;
}

export function createDefaultInteractionProfile(): InteractionProfile {
  return {
    touchAreas: [
      { id: "body", x: 70, y: 205, width: 280, height: 360, action: { type: "event", id: "body" } },
      { id: "head", x: 95, y: 55, width: 230, height: 190, action: { type: "event", id: "head" } }
    ],
    touchReactions: {
      head: {
        motion: { group: "Use", index: 0 },
        expression: "smile",
        text: "摸到了头。"
      },
      body: {
        motion: { group: "Idle", index: 0 },
        expression: "default"
      }
    },
    emotionReactions: {
      idle: {
        motion: { group: "Idle", index: 0 },
        expression: "default"
      },
      speaking: {
        motion: { group: "Use", index: 0 },
        expression: "smile"
      },
      interrupted: {
        motion: { group: "Idle", index: 0 },
        expression: "surprised"
      },
      thinking: {
        expression: "default"
      }
    }
  };
}

export function resolveTouchReaction(profile: InteractionProfile, point: TouchPoint): TouchReaction | undefined {
  const area = resolveTouchArea(profile.touchAreas, point);
  if (!area) {
    return undefined;
  }
  return {
    areaId: area.id,
    ...profile.touchReactions[area.id]
  };
}

export function resolveEmotionReaction(profile: InteractionProfile, emotion: string): StageReaction {
  return profile.emotionReactions[emotion] ?? profile.emotionReactions.idle ?? {};
}
