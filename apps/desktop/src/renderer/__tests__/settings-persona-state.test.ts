import { describe, expect, it } from "vitest";
import type { DesktopIpcEventChannel, DesktopIpcEventMap, DesktopIpcRequestChannel, DesktopIpcRequestMap } from "../../shared/ipc";
import { createDesktopRuntimeBridge, type DesktopHostApi } from "../desktop-runtime-bridge";
import { personaFormFromPersona, personaFromForm } from "../settings-state-mapper";

describe("Settings persona state", () => {
  it("maps persona files into the Settings form and save payload", () => {
    const form = personaFormFromPersona({
      name: "Mira",
      userAddress: "partner",
      background: "A focused desktop companion.",
      personality: "calm and curious",
      speakingStyle: "short lines",
      tone: "calm",
      boundaries: ["Do not browse silently.", "Ask before risky actions."],
      greeting: "Welcome back.",
      expressionMap: { neutral: "default" }
    });

    expect(form).toMatchObject({
      name: "Mira",
      userAddress: "partner",
      boundariesText: "Do not browse silently.\nAsk before risky actions."
    });
    expect(personaFromForm({ ...form, boundariesText: " Do not browse silently.\n\nAsk before risky actions.\nAsk before risky actions. " }))
      .toMatchObject({
        name: "Mira",
        userAddress: "partner",
        boundaries: ["Do not browse silently.", "Ask before risky actions."]
      });
  });

  it("loads persona state through the desktop bridge and saves edited fields", () => {
    const sent: Array<[DesktopIpcRequestChannel, unknown]> = [];
    const handlers = new Map<DesktopIpcEventChannel, (payload: unknown) => void>();
    const host: DesktopHostApi = {
      send<Channel extends DesktopIpcRequestChannel>(channel: Channel, payload: DesktopIpcRequestMap[Channel]) {
        sent.push([channel, payload]);
      },
      on(channel, handler) {
        handlers.set(channel, handler as (payload: unknown) => void);
        return () => handlers.delete(channel);
      }
    };
    const bridge = createDesktopRuntimeBridge(host);

    bridge.requestPersona();
    expect(sent).toContainEqual(["persona:load", {}]);

    handlers.get("persona:state")?.({
      status: "ready",
      path: "characters/greyfield.yaml",
      message: "Loaded persona",
      persona: {
        name: "Mira",
        userAddress: "partner",
        background: "A focused desktop companion.",
        personality: "calm and curious",
        speakingStyle: "short lines",
        tone: "calm",
        boundaries: ["Do not browse silently."],
        greeting: "Welcome back.",
        expressionMap: { neutral: "default" }
      }
    } satisfies DesktopIpcEventMap["persona:state"]);

    const readyState = bridge.getState();
    expect(readyState.persona.form.name).toBe("Mira");
    const draft = { ...readyState.persona.form, name: "Airi", userAddress: "captain" };
    bridge.updatePersonaDraft(draft);
    bridge.savePersona(draft);

    expect(sent.at(-1)).toEqual([
      "persona:save",
      {
        persona: expect.objectContaining({
          name: "Airi",
          userAddress: "captain",
          boundaries: ["Do not browse silently."]
        })
      }
    ]);
  });
});
