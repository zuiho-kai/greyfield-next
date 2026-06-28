import { describe, expect, it } from "vitest";
import {
  buildMemoryAtomRecallContext,
  DeterministicMemoryAtomExtractor,
  extractDeterministicMemoryAtoms,
  formatMemoryAtomRecallContextForPrompt
} from "../memory-atoms";
import type { SessionTurn } from "../session-store";

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
    expect(atom?.triggers.aliases).toEqual(expect.arrayContaining(["某个游戏", "之前那个游戏", "旧游戏"]));
    expect(atom?.triggers.secondary).toEqual(expect.arrayContaining(["付费", "剧情", "游戏差评", "差评", "吐槽", "傻逼", "垃圾", "像之前"]));
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

  it("keeps calendar metadata on dated episodic scene atoms", () => {
    const [atom] = extractDeterministicMemoryAtoms({
      ...baseInput,
      now: "2026-06-28T00:00:00.000Z",
      sourceTurnIds: ["turn-tea"],
      text: "记住今天晚上我们在虚拟家喝茶，像一次安静陪伴。"
    });

    expect(atom).toMatchObject({
      type: "episodic_scene",
      eventDate: { kind: "absolute", isoDate: "2026-06-28" }
    });

    const context = buildMemoryAtomRecallContext({
      input: "今天这件事要怎么回忆？",
      atoms: [atom],
      now: "2026-06-28T12:00:00.000Z"
    });
    expect(context.items[0]).toMatchObject({
      id: atom.id,
      reason: expect.stringContaining("calendar:今天")
    });
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

  it("recalls annual birthday and first-meeting atoms by calendar dates without lexical overlap", () => {
    const atoms = [
      ...extractDeterministicMemoryAtoms({
        ...baseInput,
        sourceTurnIds: ["turn-birthday"],
        text: "我的生日是 9 月 7 日，不要只记成秋天。"
      }),
      ...extractDeterministicMemoryAtoms({
        ...baseInput,
        sourceTurnIds: ["turn-first-meeting"],
        text: "我们第一次相遇是 2024 年 5 月 20 日，那天我拿着一支红玫瑰。"
      })
    ];

    const context = buildMemoryAtomRecallContext({
      input: "9月7日和5月20日这两个日子要准备什么？",
      atoms,
      now: "2027-01-15T00:00:00.000Z"
    });

    expect(context.items.map((item) => item.type)).toEqual(expect.arrayContaining(["fact", "relationship_event"]));
    expect(context.items.find((item) => item.type === "fact")).toMatchObject({
      sourceTurnIds: ["turn-birthday"],
      reason: expect.stringContaining("calendar:")
    });
    expect(context.items.find((item) => item.type === "relationship_event")).toMatchObject({
      sourceTurnIds: ["turn-first-meeting"],
      eventDate: { kind: "absolute", isoDate: "2024-05-20" },
      recurrence: { frequency: "annual" },
      reason: expect.stringContaining("calendar:")
    });
  });

  it("uses today, tomorrow, and the date window for annual calendar recall", () => {
    const atoms = extractDeterministicMemoryAtoms({
      ...baseInput,
      now: "2026-06-28T00:00:00.000Z",
      sourceTurnIds: ["turn-today-birthday"],
      text: "今天是我的生日，别忘了以后每年都记得。"
    });

    const tomorrow = buildMemoryAtomRecallContext({
      input: "明天有什么要准备？",
      atoms,
      now: "2027-06-27T00:00:00.000Z"
    });
    expect(tomorrow.items[0]).toMatchObject({
      type: "fact",
      sourceTurnIds: ["turn-today-birthday"],
      reason: expect.stringContaining("calendar:明天")
    });

    const windowedToday = buildMemoryAtomRecallContext({
      input: "今天有什么要准备？",
      atoms,
      now: "2027-06-27T00:00:00.000Z",
      calendarWindowDays: 1
    });
    expect(windowedToday.items[0]).toMatchObject({
      type: "fact",
      reason: expect.stringContaining("calendar:near:今天")
    });
  });

  it("does not convert non-date text or unrelated date questions into calendar recall", () => {
    const atoms = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-birthday"],
      text: "我的生日是 9 月 7 日，不要只记成秋天。"
    });

    const context = buildMemoryAtomRecallContext({
      input: "有什么要准备的吗？",
      atoms,
      now: "2027-09-06T00:00:00.000Z"
    });

    expect(context.items).toEqual([]);

    const weather = buildMemoryAtomRecallContext({
      input: "明天香港会不会下雨？",
      atoms,
      now: "2027-09-06T00:00:00.000Z"
    });
    expect(weather.items).toEqual([]);

    const schedule = buildMemoryAtomRecallContext({
      input: "2027年9月7日的会议日程是什么？",
      atoms,
      now: "2027-09-06T00:00:00.000Z"
    });
    expect(schedule.items).toEqual([]);
  });

  it("includes concise source fragments for source-drilldown atom recall", () => {
    const sourceTurns: SessionTurn[] = [
      {
        id: "turn-game",
        role: "user",
        content: "我给《星环旅店》的差评原文是：教程像坏掉的电梯，剧情把玩家当成没睡醒的测试员。",
        createdAt: "2026-06-28T00:00:00.000Z"
      }
    ];
    const atoms = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-game"],
      text: sourceTurns[0]!.content
    });

    const context = buildMemoryAtomRecallContext({
      input: "这个新游戏也很傻逼，好像之前某个游戏，之前为什么这么说？",
      atoms,
      sourceTurns
    });
    const prompt = formatMemoryAtomRecallContextForPrompt(context);

    expect(context.items[0]?.reason).not.toContain("exact:");
    expect(context.items[0]?.matchedKeys).toEqual(expect.arrayContaining(["某个游戏", "傻逼", "像之前"]));
    expect(prompt).toContain("Source fragments:");
    expect(prompt).toContain("教程像坏掉的电梯");
    expect(prompt).toContain("剧情把玩家当成没睡醒的测试员");
  });

  it("does not recall negative game atoms for ordinary game mentions", () => {
    const atoms = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-game"],
      text: "我给《星环旅店》的差评原文是：教程像坏掉的电梯，剧情把玩家当成没睡醒的测试员。"
    });

    const context = buildMemoryAtomRecallContext({
      input: "有什么普通的新游戏推荐？",
      atoms
    });

    expect(context.items).toEqual([]);
  });

  it("keeps source drilldown bounded and reports missing source turns without dropping the atom", () => {
    const sourceTurns: SessionTurn[] = [
      {
        id: "turn-game",
        role: "user",
        content: "短原因：剧情很糟。这里还有一大段不应该在预算很小时完整塞进提示的原始吐槽。",
        createdAt: "2026-06-28T00:00:00.000Z"
      }
    ];
    const atoms = extractDeterministicMemoryAtoms({
      ...baseInput,
      sourceTurnIds: ["turn-game"],
      text: "不要再推荐《星环旅店》了，我讨厌这个游戏的剧情。"
    });

    const bounded = buildMemoryAtomRecallContext({
      input: "上次我吐槽《星环旅店》的原文是什么？",
      atoms,
      sourceTurns,
      sourcePassageMaxCharactersPerTurn: 18
    });
    const boundedPrompt = formatMemoryAtomRecallContextForPrompt(bounded);
    expect(boundedPrompt).toContain("短原因");
    expect(boundedPrompt).not.toContain("完整塞进提示");

    const missing = buildMemoryAtomRecallContext({
      input: "上次我吐槽《星环旅店》的原文是什么？",
      atoms,
      sourceTurns: [],
      sourcePassageMode: "always"
    });
    const missingPrompt = formatMemoryAtomRecallContextForPrompt(missing);
    expect(missing.items).toHaveLength(1);
    expect(missingPrompt).toContain("Missing source turns: turn-game");
    expect(missingPrompt).toContain("Memory: User has a negative opinion");
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
