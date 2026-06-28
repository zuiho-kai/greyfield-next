import { describe, expect, it } from "vitest";
import {
  buildMemoryAtomRecallContext,
  DeterministicMemoryAtomExtractor,
  extractDeterministicMemoryAtoms,
  formatMemoryAtomRecallContextForPrompt
} from "../memory-atoms";

const baseInput = {
  threadId: "thread-a",
  sourceTurnIds: ["turn-1"],
  sourceSessionId: "session-a",
  createdAt: "2026-06-28T00:00:00.000Z",
  now: "2026-06-28T00:00:00.000Z"
};

describe("memory atoms", () => {
  it("extracts explicit save facts and preferences into source-linked atoms", async () => {
    const extractor = new DeterministicMemoryAtomExtractor();
    const atoms = await extractor.extract({
      ...baseInput,
      text: "记住我的生日是 6月12日。以后叫我博士。"
    });

    expect(atoms.map((atom) => atom.type)).toEqual(["fact", "preference"]);
    expect(atoms.every((atom) => atom.sourceTurnIds.includes("turn-1"))).toBe(true);

    const birthday = atoms.find((atom) => atom.type === "fact");
    expect(birthday).toMatchObject({
      eventDate: { kind: "month_day", month: 6, day: 12 },
      recurrence: { frequency: "annual" },
      metadata: { factType: "birthday" }
    });
    expect(birthday?.triggerKeys).toContain("生日");

    const preference = atoms.find((atom) => atom.type === "preference");
    expect(preference).toMatchObject({
      object: "博士",
      metadata: { preferenceType: "address_name", preferredName: "博士" }
    });
    expect(preference?.triggers.exact).toContain("博士");
  });

  it("extracts an anniversary rose relationship atom with date, recurrence, and ritual action", () => {
    const [atom] = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-rose"],
      text: "今天是我们第一次遇见的纪念日，记住我送你一朵玫瑰，以后每年提醒我。"
    });

    expect(atom).toMatchObject({
      type: "relationship_event",
      sourceTurnIds: ["turn-rose"],
      eventDate: { kind: "absolute", isoDate: "2026-06-28" },
      recurrence: { frequency: "annual", sourceText: "每年" },
      ritualAction: "送玫瑰",
      metadata: { eventType: "first_meeting_anniversary", gift: "rose" }
    });
    expect(atom?.triggerKeys).toEqual(expect.arrayContaining(["第一次遇见", "纪念日", "玫瑰"]));
  });

  it("extracts a negative game opinion atom with target and reason trigger keys", () => {
    const [atom] = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-game"],
      text: "不要再推荐《星海边境》了，我讨厌这个游戏的付费和剧情。"
    });

    expect(atom).toMatchObject({
      type: "opinion",
      object: "星海边境",
      sentiment: "negative",
      metadata: {
        target: "星海边境",
        reasons: ["付费", "剧情"],
        opinionType: "game_review"
      }
    });
    expect(atom?.triggers.exact).toEqual(expect.arrayContaining(["星海边境", "《星海边境》"]));
    expect(atom?.triggers.secondary).toEqual(expect.arrayContaining(["付费", "剧情", "游戏差评"]));
  });

  it("extracts a rainy hotpot episodic scene atom without pretending semantic recall is implemented", () => {
    const [atom] = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-hotpot"],
      text: "别忘了那个下雨天我们吃火锅的晚上。"
    });

    expect(atom).toMatchObject({
      type: "episodic_scene",
      metadata: {
        sceneType: "shared_meal",
        weather: "rain",
        activity: "hotpot",
        timeOfDay: "evening"
      }
    });
    expect(atom?.triggers.environment).toEqual(expect.arrayContaining(["下雨", "雨天"]));
    expect(atom?.triggers.semantic).toEqual(expect.arrayContaining(["rain hotpot memory", "shared scene memory"]));
  });

  it("extracts a non-hotpot episodic scene with weather, place, object, meaning, and time", () => {
    const [atom] = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-lego"],
      text: "记住那个下雪的下午，我们在虚拟家的窗边一起拼乐高，像一次安静的陪伴。"
    });

    expect(atom).toMatchObject({
      type: "episodic_scene",
      object: "snow_virtual_home_lego_scene",
      metadata: {
        sceneType: "episodic_scene",
        weather: "snow",
        place: "virtual_home",
        activity: "lego",
        relationshipMeaning: "quiet_companionship",
        timeOfDay: "afternoon"
      }
    });
    expect(atom?.triggers.environment).toEqual(expect.arrayContaining(["下雪", "雪天", "virtual_home"]));
    expect(atom?.triggers.exact).toEqual(expect.arrayContaining(["拼乐高", "乐高"]));
  });

  it("recalls atoms through exact, alias, and secondary trigger lanes", () => {
    const atoms = [
      ...extractDeterministicMemoryAtoms({
        ...baseInput,
        sourceTurnIds: ["turn-rose"],
        text: "今天是我们第一次遇见的纪念日，记住我送你一朵玫瑰，以后每年提醒我。"
      }),
      ...extractDeterministicMemoryAtoms({
        ...baseInput,
        sourceTurnIds: ["turn-game"],
        text: "不要再推荐《星海边境》了，我讨厌这个游戏的付费和剧情。"
      })
    ];

    const exact = buildMemoryAtomRecallContext({
      input: "星海边境后来更新了吗？",
      atoms
    });
    expect(exact.items[0]).toMatchObject({
      type: "opinion",
      reason: expect.stringContaining("exact:星海边境"),
      sourceTurnIds: ["turn-game"]
    });

    const alias = buildMemoryAtomRecallContext({
      input: "初遇纪念日要准备什么？",
      atoms
    });
    expect(alias.items[0]).toMatchObject({
      type: "relationship_event",
      reason: expect.stringContaining("alias:初遇"),
      sourceTurnIds: ["turn-rose"]
    });

    const secondary = buildMemoryAtomRecallContext({
      input: "这个新游戏付费又很烦，像之前那个。",
      atoms
    });
    expect(secondary.items[0]).toMatchObject({
      type: "opinion",
      reason: expect.stringContaining("secondary:")
    });
    expect(secondary.items[0]?.matchedKeys).toContain("付费");
    expect(formatMemoryAtomRecallContextForPrompt(secondary)).toContain("Source turns: turn-game");
  });

  it("keeps unmatched atom recall empty instead of falling back to recent history", () => {
    const atoms = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-game"],
      text: "不要再推荐《星海边境》了，我讨厌这个游戏的付费和剧情。"
    });

    const context = buildMemoryAtomRecallContext({
      input: "明天的天气怎么样？",
      atoms
    });

    expect(context.items).toEqual([]);
    expect(formatMemoryAtomRecallContextForPrompt(context)).toBe("");
  });
});
