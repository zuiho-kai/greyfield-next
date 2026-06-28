import { describe, expect, it } from "vitest";
import { extractDeterministicMemoryAtoms, type MemoryAtom } from "../memory-atoms";
import { buildProactiveMemoryCandidates, buildProactiveMemoryCandidatesFromSceneContext } from "../proactive-memory";

const baseInput = {
  threadId: "thread-a",
  sourceTurnIds: ["turn-hotpot"],
  sourceSessionId: "session-a",
  createdAt: "2026-06-28T00:00:00.000Z",
  now: "2026-06-28T00:00:00.000Z"
};

describe("proactive memory", () => {
  it("generates a natural low-disturbance environment candidate from a scene atom", () => {
    const atom = makeRainyWindowHotpotAtom();

    const result = buildProactiveMemoryCandidates({
      atoms: [atom],
      environment: {
        now: "2026-07-15T10:00:00.000Z",
        weather: "raining",
        virtualHome: { windowOpen: true },
        lastSeenDays: 45
      },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      kind: "environment",
      atomId: atom.id,
      sourceTurnIds: ["turn-hotpot"],
      importance: atom.importance,
      cooldown: {
        triggeredAt: "2026-07-15T10:00:00.000Z",
        globalCooldownMs: 0,
        perAtomCooldownMs: 0
      },
      matchedEnvironmentKeys: expect.arrayContaining(["rain", "virtual_home", "virtual_home.window=open", "last_seen_days>=30"])
    });
    expect(result.candidates[0]?.text).toContain("外面在下雨");
    expect(result.candidates[0]?.text).toContain("关窗");
    expect(result.candidates[0]?.text).toContain("吃火锅");
    expect(result.candidates[0]?.text).not.toContain(atom.id);
    expect(result.candidates[0]?.text).not.toMatch(/memory-atom|source-turn|database|storage/iu);
    expect(result.nextTriggerState.atomLastTriggeredAt?.[atom.id]).toBe("2026-07-15T10:00:00.000Z");
  });

  it("generates candidates from explicit runtime scene context without external sensing", () => {
    const atom = makeRainyWindowHotpotAtom();

    const result = buildProactiveMemoryCandidatesFromSceneContext({
      atoms: [atom],
      sceneContext: matchingSceneContext(),
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      atomId: atom.id,
      sourceTurnIds: ["turn-hotpot"],
      matchedEnvironmentKeys: expect.arrayContaining(["rain", "virtual_home", "virtual_home.window=open", "last_seen_days>=30"])
    });
    expect(result.candidates[0]?.reason).toContain("environment:rain,virtual_home,virtual_home.window=open,last_seen_days>=30");
    expect(result.candidates[0]?.text).not.toMatch(/weather api|screen|desktop state|memory-atom|source-turn|database|storage/iu);
  });

  it("gates candidates by policy, disabled atoms, importance, and cooldowns", () => {
    const atom = makeRainyWindowHotpotAtom();

    expect(
      buildProactiveMemoryCandidates({
        atoms: [atom],
        environment: matchingEnvironment(),
        policy: { enabled: false }
      }).skipped
    ).toEqual([{ reason: "policy_disabled" }]);

    expect(
      buildProactiveMemoryCandidates({
        atoms: [{ ...atom, disabled: true }],
        environment: matchingEnvironment(),
        policy: { globalCooldownMs: 0 }
      }).skipped
    ).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "disabled" }]));

    expect(
      buildProactiveMemoryCandidates({
        atoms: [{ ...atom, importance: 0.2 }],
        environment: matchingEnvironment(),
        policy: { globalCooldownMs: 0, minImportance: 0.7 }
      }).skipped
    ).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "importance_below_threshold" }]));

    expect(
      buildProactiveMemoryCandidates({
        atoms: [atom],
        environment: matchingEnvironment(),
        triggerState: { lastTriggeredAt: "2026-07-15T09:30:00.000Z" },
        policy: { globalCooldownMs: 60 * 60 * 1000 }
      }).skipped
    ).toEqual([{ reason: "global_cooldown" }]);

    expect(
      buildProactiveMemoryCandidates({
        atoms: [atom],
        environment: matchingEnvironment(),
        triggerState: { atomLastTriggeredAt: { [atom.id]: "2026-07-15T09:30:00.000Z" } },
        policy: { globalCooldownMs: 0, perAtomCooldownMs: 60 * 60 * 1000 }
      }).skipped
    ).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "atom_cooldown" }]));
  });

  it("stays quiet for recent activity, missing virtual home, closed windows, normal weather, and non-shared scenes", () => {
    const atom = makeRainyWindowHotpotAtom();

    const yesterdaySeen = buildProactiveMemoryCandidates({
      atoms: [atom],
      environment: { ...matchingEnvironment(), lastSeenDays: 1 },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(yesterdaySeen.candidates).toEqual([]);
    expect(yesterdaySeen.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "recent_user_activity" }]));

    const missingVirtualHome = buildProactiveMemoryCandidates({
      atoms: [atom],
      environment: { now: "2026-07-15T10:00:00.000Z", weather: "raining", lastSeenDays: 45 },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(missingVirtualHome.candidates).toEqual([]);
    expect(missingVirtualHome.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "virtual_home_missing" }]));

    const windowClosed = buildProactiveMemoryCandidates({
      atoms: [atom],
      environment: { ...matchingEnvironment(), virtualHome: { windowOpen: false } },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(windowClosed.candidates).toEqual([]);
    expect(windowClosed.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "window_closed" }]));

    const normalWeather = buildProactiveMemoryCandidates({
      atoms: [atom],
      environment: { ...matchingEnvironment(), weather: "normal weather" },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(normalWeather.candidates).toEqual([]);
    expect(normalWeather.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "weather_mismatch" }]));

    const nonSharedScene = makeNonSharedRainyWindowAtom();
    const noSharedExperience = buildProactiveMemoryCandidates({
      atoms: [nonSharedScene],
      environment: matchingEnvironment(),
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(noSharedExperience.candidates).toEqual([]);
    expect(noSharedExperience.skipped).toEqual(
      expect.arrayContaining([{ atomId: nonSharedScene.id, reason: "no_shared_scene" }])
    );
  });

  it("keeps scene-context candidates quiet for recent activity, ordinary weather, missing home/window state, and non-shared scenes", () => {
    const atom = makeRainyWindowHotpotAtom();

    const recentActivity = buildProactiveMemoryCandidatesFromSceneContext({
      atoms: [atom],
      sceneContext: { ...matchingSceneContext(), absenceDays: 1 },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(recentActivity.candidates).toEqual([]);
    expect(recentActivity.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "recent_user_activity" }]));

    const ordinaryWeather = buildProactiveMemoryCandidatesFromSceneContext({
      atoms: [atom],
      sceneContext: { ...matchingSceneContext(), weather: "ordinary" },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(ordinaryWeather.candidates).toEqual([]);
    expect(ordinaryWeather.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "weather_mismatch" }]));

    const missingHome = buildProactiveMemoryCandidatesFromSceneContext({
      atoms: [atom],
      sceneContext: {
        currentTime: "2026-07-15T10:00:00.000Z",
        weather: "raining",
        objects: [{ kind: "window", state: "open" }],
        absenceDays: 45
      },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(missingHome.candidates).toEqual([]);
    expect(missingHome.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "virtual_home_missing" }]));

    const missingWindowState = buildProactiveMemoryCandidatesFromSceneContext({
      atoms: [atom],
      sceneContext: {
        currentTime: "2026-07-15T10:00:00.000Z",
        weather: "raining",
        location: "virtual_home",
        objects: [{ kind: "hotpot" }],
        absenceDays: 45
      },
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(missingWindowState.candidates).toEqual([]);
    expect(missingWindowState.skipped).toEqual(expect.arrayContaining([{ atomId: atom.id, reason: "window_closed" }]));

    const nonSharedScene = makeNonSharedRainyWindowAtom();
    const noSharedExperience = buildProactiveMemoryCandidatesFromSceneContext({
      atoms: [nonSharedScene],
      sceneContext: matchingSceneContext(),
      policy: { globalCooldownMs: 0, perAtomCooldownMs: 0 }
    });
    expect(noSharedExperience.candidates).toEqual([]);
    expect(noSharedExperience.skipped).toEqual(
      expect.arrayContaining([{ atomId: nonSharedScene.id, reason: "no_shared_scene" }])
    );
  });
});

function makeRainyWindowHotpotAtom(): MemoryAtom {
  const [atom] = extractDeterministicMemoryAtoms({
    ...baseInput,
    text: "如果以后下雨，虚拟家的窗户开着，而且我长期没上线，就提醒我关窗，我们一起吃火锅。"
  });
  if (!atom) {
    throw new Error("Expected rainy virtual-home hotpot atom");
  }
  return atom;
}

function makeNonSharedRainyWindowAtom(): MemoryAtom {
  const [atom] = extractDeterministicMemoryAtoms({
    ...baseInput,
    sourceTurnIds: ["turn-window"],
    text: "如果以后下雨，虚拟家的窗户开着，而且我长期没上线，就提醒我关窗。"
  });
  if (!atom) {
    throw new Error("Expected rainy virtual-home window atom");
  }
  return atom;
}

function matchingEnvironment() {
  return {
    now: "2026-07-15T10:00:00.000Z",
    weather: "raining",
    virtualHome: { windowOpen: true },
    lastSeenDays: 45
  };
}

function matchingSceneContext() {
  return {
    currentTime: "2026-07-15T10:00:00.000Z",
    weather: "raining",
    location: "virtual_home",
    objects: [{ kind: "window", state: "open" }, { kind: "hotpot" }],
    absenceDays: 45
  };
}
