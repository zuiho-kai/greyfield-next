import { describe, expect, it } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { DesktopIpcEventChannel, DesktopIpcEventMap, DesktopIpcRequestChannel, DesktopIpcRequestMap } from "../../shared/ipc";
import { createDesktopRuntimeBridge, type DesktopHostApi } from "../desktop-runtime-bridge";
import {
  configFromSettings,
  personaFormFromPersona,
  personaFromForm,
  settingsFromConfig,
  settingsPatchToConfigPatch
} from "../settings-state-mapper";

describe("Settings persona state", () => {
  it("maps proactivity level between persisted config, renderer state, and patches", () => {
    const settings = settingsFromConfig({
      ...defaultGreyfieldConfig,
      ui: {
        ...defaultGreyfieldConfig.ui,
        proactiveMemoryEnabled: true,
        proactivityLevel: 80
      }
    });

    expect(settings.proactivityLevel).toBe(80);
    expect(configFromSettings({ ...settings, proactivityLevel: 20 }).ui).toMatchObject({
      proactiveMemoryEnabled: true,
      proactivityLevel: 20
    });
    expect(settingsPatchToConfigPatch({ proactivityLevel: 0 })).toEqual({
      ui: { proactivityLevel: 0 }
    });
  });

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

  it("reloads persona after changing the Settings character file and does not save the old draft", () => {
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
    handlers.get("persona:state")?.({
      status: "ready",
      path: "characters/a.yaml",
      message: "Loaded persona A",
      persona: {
        name: "Aster",
        userAddress: "pilot",
        background: "Persona A background.",
        personality: "A personality",
        speakingStyle: "A style",
        tone: "A tone",
        boundaries: ["A boundary"],
        greeting: "Hello from A.",
        expressionMap: { neutral: "default" }
      }
    } satisfies DesktopIpcEventMap["persona:state"]);

    const oldDraft = { ...bridge.getState().persona.form, name: "Aster draft" };
    bridge.updatePersonaDraft(oldDraft);
    sent.splice(0);

    bridge.updateSettings({ characterFile: "characters/b.yaml" });
    const config = bridge.getConfigSnapshot();
    handlers.get("settings:changed")?.({
      ...config,
      characterFile: "characters/b.yaml",
      provider: { ...config.provider, apiKey: "", hasApiKey: false }
    } satisfies DesktopIpcEventMap["settings:changed"]);

    expect(sent).toContainEqual(["settings:update", { characterFile: "characters/b.yaml" }]);
    expect(sent).toContainEqual(["persona:load", {}]);
    expect(bridge.getState().persona).toMatchObject({
      status: "loading",
      path: "characters/b.yaml",
      form: expect.not.objectContaining({ name: "Aster draft" })
    });

    handlers.get("persona:state")?.({
      status: "ready",
      path: "characters/b.yaml",
      message: "Loaded persona B",
      persona: {
        name: "Beryl",
        userAddress: "captain",
        background: "Persona B background.",
        personality: "B personality",
        speakingStyle: "B style",
        tone: "B tone",
        boundaries: ["B boundary"],
        greeting: "Hello from B.",
        expressionMap: { neutral: "default", speaking: "smile" }
      }
    } satisfies DesktopIpcEventMap["persona:state"]);

    expect(bridge.getState().persona.form).toMatchObject({
      name: "Beryl",
      userAddress: "captain",
      boundariesText: "B boundary"
    });

    bridge.savePersona(bridge.getState().persona.form);
    expect(sent.at(-1)).toEqual([
      "persona:save",
      {
        persona: expect.objectContaining({
          name: "Beryl",
          userAddress: "captain",
          boundaries: ["B boundary"]
        })
      }
    ]);
  });
});
