import { _electron as electron, type ElectronApplication, type Locator, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { MemoryAtom, SessionTurn } from "@greyfield/core-runtime";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-memory-atoms-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const atomPath = join(tempDir, "memory", "atoms.jsonl");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-memory-atom-library", "latest");
const settingsInitialScreenshotPath = join(artifactDir, "settings-memory-atoms-initial.png");
const settingsAfterClearScreenshotPath = join(artifactDir, "settings-memory-atoms-after-clear.png");
const availableSourceScreenshotPath = join(artifactDir, "source-available.png");
const missingSourceScreenshotPath = join(artifactDir, "source-missing.png");
const unavailableSourceScreenshotPath = join(artifactDir, "source-unavailable.png");
const noSourceScreenshotPath = join(artifactDir, "source-no-passage.png");
const providerSecret = "memory-atom-library-provider-secret";
const editedAtomText = "Edited atom memory: User prefers Sakura.";
const editedPromiseText = "Edited promise memory: Greyfield will help organize the desk.";
const atomOpinionText = "User dislikes pay-to-win game loops.";
const atomPromiseText = "Promise: Greyfield committed to help the user organize their desk.";
const vagueOpinionSource =
  "我给《星环旅店》的差评原文是：教程像坏掉的电梯，剧情把玩家当成没睡醒的测试员。";
const vaguePromiseSource = "记住，你答应以后帮我整理书桌；这个承诺以后要能想起来。";
const vagueRitualText = "Relationship ritual: every December 24, the user and Greyfield brew osmanthus tea together.";
const vagueRitualSource = "记住每年 12 月 24 日，我们和 Greyfield 的固定仪式是一起泡桂花茶。";
const vagueSceneText = "Shared rainy home meal scene with an open window, rain sounds, porridge, and a safe harbor feeling.";
const vagueSceneSource = "那天下雨，我们在家里开着窗一起吃晚饭，这像我们的避风港，记住当时的雨声和桌上的粥。";
const currentRoleCharacterFile = "characters/greyfield.yaml";
const otherRoleCharacterFile = "characters/other-role.yaml";
const currentThreadId = "desktop:characters-greyfield-yaml";
const otherThreadId = "desktop:characters-other-role-yaml";
const boundedTail = "SOURCE_PASSAGE_BOUNDARY_TAIL_SHOULD_NOT_RENDER";
const memoryLibrarySelector = '[data-harness="settings-memory-library"]';
const memorySourceDrilldownSelector = '[data-harness="memory-source-drilldown"]';
const requestBodies: string[] = [];
const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const requestBody = await readRequestBody(request);
  requestBodies.push(requestBody);
  const content = buildScriptedAssistantResponse(requestBody);
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

let app: ElectronApplication | undefined;
try {
  await mkdir(join(tempDir, "sessions"), { recursive: true });
  await mkdir(join(tempDir, "memory"), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...defaultGreyfieldConfig,
        characterFile: currentRoleCharacterFile,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: providerSecret,
          model: "memory-atom-library-harness"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeSessionFile([
    makeTurn({
      id: "desktop-main-session-fact",
      role: "user",
      content: `User birthday source says June 12. ${"This sentence keeps the available source passage long. ".repeat(16)}${boundedTail}`
    }),
    makeTurn({
      id: "desktop-main-session-preference",
      role: "assistant",
      content: ""
    }),
    makeTurn({
      id: "desktop-main-session-opinion",
      role: "user",
      content: vagueOpinionSource
    }),
    makeTurn({
      id: "desktop-main-session-ritual",
      role: "user",
      content: vagueRitualSource
    }),
    makeTurn({
      id: "desktop-main-session-scene",
      role: "user",
      content: vagueSceneSource
    }),
    makeTurn({
      id: "desktop-main-session-promise",
      role: "user",
      content: vaguePromiseSource
    }),
    ...Array.from({ length: 22 }, (_, index) =>
      makeTurn({
        id: `desktop-main-session-filler-${index + 1}`,
        role: "event",
        content: `neutral harness filler ${index + 1}; no durable memory`
      })
    )
  ]);
  await writeAtomFile([
    makeAtom({
      id: "atom-fact",
      type: "fact",
      text: "User birthday is June 12.",
      sourceTurnIds: ["desktop-main-session-fact"],
      metadata: { factType: "birthday" }
    }),
    makeAtom({
      id: "atom-preference",
      type: "preference",
      text: "User prefers the Hiyori model.",
      sourceTurnIds: ["desktop-main-session-preference"],
      metadata: { preferenceType: "live2d_model" }
    }),
    makeAtom({
      id: "atom-opinion",
      type: "opinion",
      text: atomOpinionText,
      sourceTurnIds: ["desktop-main-session-opinion"],
      triggerKeys: ["pay-to-win", "game loops"],
      triggers: {
        exact: ["pay-to-win"],
        aliases: ["game loops"],
        secondary: ["loops", "傻逼", "像之前", "某个游戏"],
        semantic: ["negative game analogy", "game complaint source"]
      },
      object: "星环旅店",
      sentiment: "negative",
      metadata: { opinionType: "game_review" }
    }),
    makeAtom({
      id: "atom-missing-opinion",
      type: "opinion",
      text: "Missing-source opinion memory for drilldown state coverage.",
      sourceTurnIds: ["desktop-main-session-missing-opinion"],
      metadata: { opinionType: "missing_source_check" }
    }),
    makeAtom({
      id: "atom-relationship",
      type: "relationship_event",
      text: "First meeting anniversary ritual is giving roses.",
      sourceSessionId: "previous-local-session",
      sourceTurnIds: ["desktop-main-session-relationship"],
      metadata: { eventType: "first_meeting_anniversary" }
    }),
    makeAtom({
      id: "atom-vague-ritual",
      type: "relationship_event",
      text: vagueRitualText,
      sourceTurnIds: ["desktop-main-session-ritual"],
      subject: "user_and_greyfield",
      object: "recurring_relationship_ritual",
      eventDate: {
        kind: "month_day",
        sourceText: "12 月 24 日",
        precision: "month_day",
        month: 12,
        day: 24
      },
      recurrence: { frequency: "annual", sourceText: "每年" },
      ritualAction: "一起泡桂花茶",
      triggers: {
        exact: ["桂花茶"],
        aliases: ["固定仪式"],
        secondary: ["每年"],
        semantic: ["recurring ritual", "annual ritual", "tea ritual"],
        relationship: [
          "user_and_greyfield",
          "relationship_ritual",
          "recurring_relationship_ritual",
          "annual_ritual",
          "tea_ritual"
        ]
      },
      metadata: {
        eventType: "recurring_relationship_ritual",
        ritualAction: "一起泡桂花茶",
        ritualKind: "tea_ritual"
      }
    }),
    makeAtom({
      id: "atom-scene",
      type: "episodic_scene",
      text: "Shared rainy hotpot evening memory.",
      sourceTurnIds: [],
      metadata: { sceneType: "shared_meal" }
    }),
    makeAtom({
      id: "atom-vague-scene",
      type: "episodic_scene",
      text: vagueSceneText,
      sourceTurnIds: ["desktop-main-session-scene"],
      subject: "user_and_greyfield",
      object: "rain_home_shared_meal_scene",
      triggers: {
        exact: ["雨声", "粥"],
        aliases: ["下雨开窗", "吃晚饭"],
        secondary: ["避风港"],
        semantic: [
          "scene memory",
          "shared scene memory",
          "rainy scene",
          "home scene",
          "open window scene",
          "shared meal scene",
          "rain sound scene",
          "safe harbor"
        ],
        relationship: ["user_and_greyfield", "shared_scene"]
      },
      metadata: {
        sceneType: "shared_meal",
        weather: "rain",
        place: "home",
        windowState: "open",
        activity: "shared_meal",
        relationshipMeaning: "safe_harbor",
        sharedExperience: true,
        sensoryDetails: ["rain_sound"]
      }
    }),
    makeAtom({
      id: "atom-promise",
      type: "promise",
      text: atomPromiseText,
      sourceTurnIds: ["desktop-main-session-promise"],
      triggerKeys: ["promise memory", "desk organization promise"],
      triggers: {
        exact: ["整理书桌"],
        aliases: ["promise"],
        secondary: ["desk"],
        semantic: ["promise memory", "desk organization promise"]
      },
      metadata: {
        promiseType: "commitment",
        promiseSubject: "greyfield",
        promiseAction: "organize_desk"
      }
    }),
    makeAtom({
      id: "atom-other-role",
      threadId: otherThreadId,
      type: "preference",
      text: "Other role memory must stay isolated.",
      sourceTurnIds: ["desktop-main-session-other"]
    })
  ]);

  app = await launchApp();
  let chat = await waitForRoleWindow(app, "chat");
  let settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  await refreshMemory(settings);

  let memoryLibrary = settings.locator(memoryLibrarySelector);
  await memoryLibrary.waitFor();
  await assertMemoryAtomGroupCount(memoryLibrary, "fact", 1);
  await assertMemoryAtomGroupCount(memoryLibrary, "preference", 1);
  await assertMemoryAtomGroupCount(memoryLibrary, "opinion", 2);
  await assertMemoryAtomGroupCount(memoryLibrary, "relationship_event", 2);
  await assertMemoryAtomGroupCount(memoryLibrary, "episodic_scene", 2);
  await assertMemoryAtomGroupCount(memoryLibrary, "promise", 1);
  await assertMemoryAtomCardCount(memoryLibrary, 9);
  await memoryAtomCard(memoryLibrary, "atom-fact").filter({ hasText: "User birthday is June 12." }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-preference").filter({ hasText: "1 source passage ready" }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-opinion").filter({ hasText: "User dislikes pay-to-win game loops." }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-missing-opinion").filter({ hasText: "Missing-source opinion memory" }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-relationship").filter({ hasText: "First meeting anniversary ritual is giving roses." }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-vague-ritual").filter({ hasText: "osmanthus tea" }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-scene").filter({ hasText: "Shared rainy hotpot evening memory." }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-vague-scene").filter({ hasText: "safe harbor" }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-promise").filter({ hasText: atomPromiseText }).waitFor();
  const availableSource = await openSourceDrilldown(memoryLibrary, "atom-fact");
  await availableSource.getByText("User birthday source says June 12.").waitFor();
  await availableSource.getByText("From you").first().waitFor();
  await availableSource.getByText("Saved locally").first().waitFor();
  await assertSourceStateText(availableSource, {
    includes: ["From you", "Saved from conversation", "User birthday source says June 12."],
    excludes: ["Unknown role", "desktop-main-session-fact", "Turn"]
  });
  await assertNoHorizontalOverflow(settings, memorySourceDrilldownSelector);
  await captureSourceState(settings, availableSource, availableSourceScreenshotPath);
  const availableEmptySource = await openSourceDrilldown(memoryLibrary, "atom-preference");
  await availableEmptySource.getByText("From Greyfield").first().waitFor();
  await availableEmptySource.getByText("No message text is saved for this source.").waitFor();
  await assertSourceStateText(availableEmptySource, {
    includes: ["Saved locally", "From Greyfield", "No message text is saved for this source."],
    excludes: ["Source unavailable in this local session store", "Unknown role", "desktop-main-session-preference"]
  });
  const missingSource = await openSourceDrilldown(memoryLibrary, "atom-missing-opinion");
  await missingSource.getByText("Original message not found").first().waitFor();
  await assertSourceStateText(missingSource, {
    includes: [
      "Original message unavailable",
      "Original message not found",
      "Source turn is missing from the current session store.",
      "Greyfield saved a source link"
    ],
    excludes: ["Unknown role", "desktop-main-session-missing-opinion"]
  });
  await captureSourceState(settings, missingSource, missingSourceScreenshotPath);
  const unavailableSource = await openSourceDrilldown(memoryLibrary, "atom-relationship");
  await unavailableSource.getByText("Not available in this session").first().waitFor();
  await assertSourceStateText(unavailableSource, {
    includes: [
      "Original message unavailable",
      "Not available in this session",
      "Source turn belongs to another session and is unavailable in the current local store.",
      "another local session"
    ],
    excludes: ["Unknown role", "desktop-main-session-relationship"]
  });
  await captureSourceState(settings, unavailableSource, unavailableSourceScreenshotPath);
  const recalledSceneSource = await openSourceDrilldown(memoryLibrary, "atom-vague-scene");
  await recalledSceneSource.getByText("家里开着窗一起吃晚饭").waitFor();
  await assertSourceStateText(recalledSceneSource, {
    includes: ["From you", "Saved from conversation", "家里开着窗一起吃晚饭", "避风港", "雨声和桌上的粥"],
    excludes: ["Unknown role", "desktop-main-session-scene"]
  });
  const noSource = await openSourceDrilldown(memoryLibrary, "atom-scene");
  await noSource.getByText("No original message is linked to this memory.").first().waitFor();
  await assertSourceStateText(noSource, {
    includes: ["No saved source", "No original message is linked to this memory."],
    excludes: ["Unknown role"]
  });
  await assertNoHorizontalOverflow(settings, memorySourceDrilldownSelector);
  await captureSourceState(settings, noSource, noSourceScreenshotPath);
  await closeSourceDrilldown(memoryLibrary);

  const initialLibraryText = (await memoryLibrary.textContent()) ?? "";
  assertTextDoesNotExposeForbiddenMemoryUi(initialLibraryText);
  if (initialLibraryText.includes(boundedTail)) {
    throw new Error("Memory Library rendered source text beyond the bounded passage display.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);
  if (initialLibraryText.includes("Other role memory must stay isolated.")) {
    throw new Error("Memory Library rendered a different role's atom memory.");
  }
  await settings.screenshot({ path: settingsInitialScreenshotPath, fullPage: true });

  await assertNoVagueRecall(chat, {
    input: "明天香港会不会下雨？",
    forbiddenFragments: [vagueSceneText, vagueSceneSource, atomOpinionText, atomPromiseText, vagueRitualText]
  });
  await assertVagueRecallPath(chat, {
    input: "这个新游戏也很傻逼，好像之前某个游戏，之前为什么这么说？",
    promptIncludes: [
      "Recall reason: The user is asking about a similar earlier game complaint",
      "Source fragments:",
      "教程像坏掉的电梯",
      "剧情把玩家当成没睡醒的测试员"
    ],
    promptExcludes: [vaguePromiseSource, vagueRitualSource, vagueSceneSource, "desktop-main-session-missing-opinion"],
    responseIncludes: ["similar earlier game complaint", "教程像坏掉的电梯", "剧情把玩家当成没睡醒的测试员"]
  });
  await assertVagueRecallPath(chat, {
    input: "你之前说好要帮我整理的那件事原文是什么？",
    promptIncludes: [
      "Recall reason: The user is asking about a prior commitment between the user and Greyfield.",
      "Source-linked promise memory",
      "Source fragments:",
      "你答应以后帮我整理书桌"
    ],
    promptExcludes: ["客户承诺", vagueRitualSource, vagueSceneSource],
    responseIncludes: ["desk promise", "你答应以后帮我整理书桌"]
  });
  await assertVagueRecallPath(chat, {
    input: "那个每年固定的小仪式原文是什么？",
    promptIncludes: [
      "Recall reason: The user is asking about a remembered shared ritual or important date.",
      "Source-linked relationship memory",
      "Recurrence: annual",
      "Ritual action: 一起泡桂花茶",
      "Source fragments:",
      "每年 12 月 24 日",
      "一起泡桂花茶"
    ],
    promptExcludes: [vagueOpinionSource, vaguePromiseSource, vagueSceneSource],
    responseIncludes: ["shared annual ritual", "每年 12 月 24 日", "一起泡桂花茶"]
  });
  await assertNoVagueRecall(chat, {
    input: "同事那天下雨开窗吃饭的场景原文是什么？",
    forbiddenFragments: [vagueSceneText, vagueSceneSource, "家里开着窗一起吃晚饭", "Source-linked scene memory"]
  });
  await assertVagueRecallPath(chat, {
    input: "那个下雨开窗一起吃东西的场景原文是什么？",
    promptIncludes: [
      "Recall reason: The user is asking about a shared scene with matching place, weather, or activity details.",
      "Source-linked scene memory",
      "Source fragments:",
      "家里开着窗一起吃晚饭",
      "避风港",
      "雨声和桌上的粥"
    ],
    promptExcludes: [vagueOpinionSource, vaguePromiseSource, vagueRitualSource],
    responseIncludes: ["rainy shared scene", "家里开着窗一起吃晚饭", "雨声和桌上的粥"]
  });

  await switchCharacter(settings, otherRoleCharacterFile);
  await memoryAtomCard(memoryLibrary, "atom-other-role").filter({ hasText: "Other role memory must stay isolated." }).waitFor();
  const roleBText = (await memoryLibrary.textContent()) ?? "";
  if (roleBText.includes("User birthday is June 12.") || roleBText.includes(atomOpinionText) || roleBText.includes(atomPromiseText)) {
    throw new Error(`Role-B Memory Library rendered role-A atom memory: ${roleBText}`);
  }
  await switchCharacter(settings, currentRoleCharacterFile);
  await memoryAtomCard(memoryLibrary, "atom-fact").filter({ hasText: "User birthday is June 12." }).waitFor();
  await assertCurrentRoleOnly(memoryLibrary);

  await memoryAtomText(memoryLibrary, "atom-preference").fill(editedAtomText);
  await memoryAtomSave(memoryLibrary, "atom-preference").click();
  await memoryLibrary.getByText("Atom memory atom-preference saved.").waitFor();
  await waitForAtom("atom-preference", (atom) => atom.text === editedAtomText);
  await memoryAtomText(memoryLibrary, "atom-promise").fill(editedPromiseText);
  await memoryAtomSave(memoryLibrary, "atom-promise").click();
  await memoryLibrary.getByText("Atom memory atom-promise saved.").waitFor();
  await waitForAtom("atom-promise", (atom) => atom.text === editedPromiseText);

  await memoryAtomExport(memoryLibrary, "atom-preference").click();
  await memoryLibrary.getByText("Atom memory atom-preference export is ready.").waitFor();
  await memoryExportText(settings).waitFor();
  const singleAtomExport = await memoryExportText(settings).inputValue();
  if (!singleAtomExport.includes(editedAtomText)) {
    throw new Error(`Single-atom export missed edited atom text: ${singleAtomExport}`);
  }
  if (singleAtomExport.includes(providerSecret)) {
    throw new Error("Single-atom export included the configured provider API key.");
  }
  if (singleAtomExport.includes("Other role memory must stay isolated.")) {
    throw new Error("Single-atom export included another role's atom.");
  }
  await memoryAtomExport(memoryLibrary, "atom-promise").click();
  await memoryLibrary.getByText("Atom memory atom-promise export is ready.").waitFor();
  const promiseAtomExport = await memoryExportText(settings).inputValue();
  if (!promiseAtomExport.includes(editedPromiseText)) {
    throw new Error(`Promise atom export missed edited atom text: ${promiseAtomExport}`);
  }
  if (promiseAtomExport.includes(providerSecret)) {
    throw new Error("Promise atom export included the configured provider API key.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);

  await memoryAtomToggle(memoryLibrary, "atom-preference").click();
  await memoryLibrary.getByText("Atom memory atom-preference disabled.").waitFor();
  await waitForAtom("atom-preference", (atom) => atom.disabled === true);
  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "Hiyori 模型偏好还在吗？");
  assertLatestSystemPromptExcludes(editedAtomText, "disabled atom-preference should stay out of prompt recall");

  await memoryAtomToggle(memoryLibrary, "atom-preference").click();
  await waitForAtom("atom-preference", (atom) => atom.disabled === false);
  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "Hiyori 模型偏好重新启用了吗？");
  assertLatestSystemPromptIncludes(editedAtomText, "re-enabled atom-preference should return to prompt recall");

  await app.close();
  app = await launchApp();
  chat = await waitForRoleWindow(app, "chat");
  settings = await waitForRoleWindow(app, "settings");
  await refreshMemory(settings);
  memoryLibrary = settings.locator(memoryLibrarySelector);
  await memoryAtomCard(memoryLibrary, "atom-preference").filter({ hasText: editedAtomText }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-opinion").filter({ hasText: atomOpinionText }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-promise").filter({ hasText: editedPromiseText }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-vague-ritual").filter({ hasText: "osmanthus tea" }).waitFor();
  await memoryAtomCard(memoryLibrary, "atom-vague-scene").filter({ hasText: "safe harbor" }).waitFor();
  await assertCurrentRoleOnly(memoryLibrary);
  await waitForAtom("atom-preference", (atom) => atom.text === editedAtomText && atom.disabled === false);
  await waitForAtom("atom-promise", (atom) => atom.text === editedPromiseText);

  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "pay-to-win game loops 这条记忆还在吗？");
  assertLatestSystemPromptIncludes(atomOpinionText, "atom-opinion should be recalled before deletion");

  await memoryAtomDelete(memoryLibrary, "atom-opinion").click();
  await memoryLibrary
    .getByText("Atom memory atom-opinion deleted. Remembered source evidence was hidden from recall, source views, and exports.")
    .waitFor();
  await waitForMissingAtom("atom-opinion");
  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "pay-to-win game loops 删除后不应该再召回。");
  assertLatestSystemPromptExcludes(atomOpinionText, "deleted atom-opinion should stay out of prompt recall");

  await memoryLibrary.locator('[data-harness="memory-library-export"]').click();
  await memoryLibrary.getByText("Memory export is ready.").waitFor();
  const libraryExport = await memoryExportText(settings).inputValue();
  if (libraryExport.includes(atomOpinionText)) {
    throw new Error(`Library export still included deleted atom-opinion: ${libraryExport}`);
  }
  if (libraryExport.includes(providerSecret)) {
    throw new Error("Memory Library export included the configured provider API key.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);

  await memoryLibrary.locator('[data-harness="memory-atom-clear-current-role"]').click();
  await memoryLibrary
    .getByText(
      /Cleared \d+ current role atom memories\. Remembered source evidence was hidden from recall, source views, and exports\./u
    )
    .waitFor();
  await waitForMissingAtom("atom-fact");
  await waitForMissingAtom("atom-preference");
  await waitForMissingAtom("atom-missing-opinion");
  await waitForMissingAtom("atom-relationship");
  await waitForMissingAtom("atom-vague-ritual");
  await waitForMissingAtom("atom-scene");
  await waitForMissingAtom("atom-vague-scene");
  await waitForMissingAtom("atom-promise");
  await waitForAtom("atom-other-role", (atom) => atom.threadId === otherThreadId);
  const afterClearText = (await memoryLibrary.textContent()) ?? "";
  assertTextDoesNotExposeForbiddenMemoryUi(afterClearText);
  await assertSettingsPageDoesNotExposeProviderSecret(settings);
  if (afterClearText.includes("Other role memory must stay isolated.")) {
    throw new Error("Memory Library rendered the isolated role-B atom after clearing current role atoms.");
  }
  for (const fragment of [atomOpinionText, editedAtomText, editedPromiseText, vagueRitualText, vagueSceneText]) {
    if (afterClearText.includes(fragment)) {
      throw new Error(`Memory Library still rendered a cleared current-role atom after clear: ${fragment}`);
    }
  }
  await settings.screenshot({ path: settingsAfterClearScreenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        atomGroupsVisible: true,
        promiseAtomVisibleAndManageable: true,
        atomEditPersisted: true,
        atomDisablePersisted: true,
        atomEnablePersisted: true,
        disabledAtomSkippedFromPrompt: true,
        enabledAtomReturnedToPrompt: true,
        atomDeleteRemovedFromPrompt: true,
        atomDeleteRemovedFromExport: true,
        vagueOpinionRecallUserPath: true,
        vaguePromiseRecallUserPath: true,
        vagueRelationshipDateRecallUserPath: true,
        vagueSceneRecallUserPath: true,
        vagueRecallFalsePositiveRejected: true,
        vagueRecallResponseExcludedInternalIds: true,
        clearCurrentRoleKeptOtherRoleAtom: true,
        roleBMemoryIsolated: true,
        reloadPersistence: true,
        sourceDrilldownOpened: true,
        sourceDrilldownOpenedForRecalledScene: true,
        sourceDrilldownClosed: true,
        sourceDrilldownNoOverflow: true,
        memoryDomExcludedProviderSecret: true,
        settingsPageTextAndInputsExcludedProviderSecret: true,
        memoryExportExcludedProviderSecret: true,
        noPendingCandidateApprovalUi: true,
        availableSourceScreenshotPath,
        missingSourceScreenshotPath,
        unavailableSourceScreenshotPath,
        noSourceScreenshotPath,
        settingsInitialScreenshotPath,
        settingsAfterClearScreenshotPath,
        remainingAtomIds: (await readAtoms()).map((atom) => atom.id)
      },
      null,
      2
    )
  );
} finally {
  await app?.close().catch(() => undefined);
  server.closeAllConnections?.();
  server.close();
  await rm(tempDir, { recursive: true, force: true });
}

async function launchApp(): Promise<ElectronApplication> {
  const output: string[] = [];
  const launched = await electron.launch({
    executablePath,
    cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")],
    env: {
      ...process.env,
      GREYFIELD_CONFIG_PATH: configPath,
      GREYFIELD_PROJECT_ROOT: workspaceRoot,
      GREYFIELD_USER_DATA_PATH: tempDir
    }
  });
  launched.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  launched.process().stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await launched.firstWindow({ timeout: 10_000 });
    return launched;
  } catch (error) {
    const urls = launched.windows().map((page) => page.url());
    const spawnargs = launched.process().spawnargs;
    await launched.close().catch(() => undefined);
    throw new Error(
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(urls)}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "settings" | "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleName === "settings" ? ".greyfield-shell" : ".chat-shell");
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of request) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  return raw;
}

function buildScriptedAssistantResponse(requestBody: string): string {
  const parsed = JSON.parse(requestBody) as { messages?: Array<{ role?: string; content?: string }> };
  const userInput = [...(parsed.messages ?? [])].reverse().find((message) => message.role === "user")?.content ?? "";
  const systemPrompt = parsed.messages?.find((message) => message.role === "system")?.content ?? "";
  if (userInput.includes("某个游戏") && systemPrompt.includes("教程像坏掉的电梯")) {
    return "I remember the similar earlier game complaint because your question matches that saved complaint. Source fragment: 教程像坏掉的电梯，剧情把玩家当成没睡醒的测试员。";
  }
  if (userInput.includes("说好要帮我整理") && systemPrompt.includes("你答应以后帮我整理书桌")) {
    return "I remember the desk promise because it was a prior commitment between us. Source fragment: 你答应以后帮我整理书桌。";
  }
  if (userInput.includes("每年固定的小仪式") && systemPrompt.includes("一起泡桂花茶")) {
    return "I remember the shared annual ritual because the question points to our fixed date. Source fragment: 每年 12 月 24 日，一起泡桂花茶。";
  }
  if (userInput.includes("下雨开窗一起吃东西") && systemPrompt.includes("家里开着窗一起吃晚饭")) {
    return "I remember the rainy shared scene because the weather, open window, and meal details match. Source fragment: 家里开着窗一起吃晚饭，雨声和桌上的粥。";
  }
  return "No related source-linked memory surfaced for that question.";
}

async function switchCharacter(settings: Page, characterFile: string): Promise<void> {
  await settings.getByLabel("Character").fill(characterFile);
  await settings.waitForTimeout(250);
  await refreshMemory(settings);
}

async function assertCurrentRoleOnly(memoryLibrary: Locator): Promise<void> {
  const text = (await memoryLibrary.textContent()) ?? "";
  if (text.includes("Other role memory must stay isolated.")) {
    throw new Error(`Current role Memory Library rendered role-B atom memory: ${text}`);
  }
}

async function sendMessageAndWaitForNextAssistant(page: Page, text: string): Promise<string> {
  const previousCount = await page.locator(".message-list .assistant:not(.draft)").count();
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".message-list .assistant:not(.draft)").length > count,
    previousCount,
    { timeout: 10_000 }
  );
  return (await page.locator(".message-list .assistant:not(.draft)").last().innerText()).trim();
}

function clearCapturedRequests(): void {
  requestBodies.length = 0;
}

function assertLatestSystemPromptIncludes(fragment: string, reason: string): void {
  const systemPrompt = latestSystemPrompt();
  if (!systemPrompt.includes(fragment)) {
    throw new Error(`${reason}; prompt=${systemPrompt}`);
  }
}

function assertLatestSystemPromptExcludes(fragment: string, reason: string): void {
  const systemPrompt = latestSystemPrompt();
  if (systemPrompt.includes(fragment)) {
    throw new Error(`${reason}; prompt=${systemPrompt}`);
  }
}

async function assertVagueRecallPath(
  page: Page,
  expected: {
    input: string;
    promptIncludes: string[];
    promptExcludes: string[];
    responseIncludes: string[];
  }
): Promise<void> {
  clearCapturedRequests();
  const response = await sendMessageAndWaitForNextAssistant(page, expected.input);
  const prompt = latestSystemPrompt();
  for (const fragment of expected.promptIncludes) {
    if (!prompt.includes(fragment)) {
      throw new Error(`Vague recall prompt missed ${fragment}: ${prompt}`);
    }
  }
  for (const fragment of expected.promptExcludes) {
    if (prompt.includes(fragment)) {
      throw new Error(`Vague recall prompt included unrelated ${fragment}: ${prompt}`);
    }
  }
  for (const fragment of expected.responseIncludes) {
    if (!response.includes(fragment)) {
      throw new Error(`Vague recall response missed ${fragment}: ${response}`);
    }
  }
  // Prompt material is internal: it may carry implementation source refs while the response is the user-visible surface.
  assertNoInternalMemoryIdentifiers(response, "vague recall response");
  assertNoLocalSourceTurnIds(response, "vague recall response");
}

async function assertNoVagueRecall(
  page: Page,
  expected: {
    input: string;
    forbiddenFragments: string[];
  }
): Promise<void> {
  clearCapturedRequests();
  const response = await sendMessageAndWaitForNextAssistant(page, expected.input);
  const prompt = latestSystemPrompt();
  for (const fragment of expected.forbiddenFragments) {
    if (prompt.includes(fragment)) {
      throw new Error(`False-positive prompt included ${fragment}: ${prompt}`);
    }
    if (response.includes(fragment)) {
      throw new Error(`False-positive response included ${fragment}: ${response}`);
    }
  }
  if (!response.includes("No related source-linked memory surfaced")) {
    throw new Error(`False-positive response should not claim recall: ${response}`);
  }
  // Prompt material is internal: product leakage checks belong on assistant output and Memory Library UI.
  assertNoInternalMemoryIdentifiers(response, "false-positive response");
  assertNoLocalSourceTurnIds(response, "false-positive response");
}

function assertNoInternalMemoryIdentifiers(text: string, label: string): void {
  const leaked = text.match(/\b(?:memory-atom|atom-[\w-]+)\b/iu);
  if (leaked) {
    throw new Error(`${label} exposed internal memory identifier ${leaked[0]}: ${text}`);
  }
}

function assertNoLocalSourceTurnIds(text: string, label: string): void {
  const leaked = text.match(/\bdesktop-main-session-[\w-]+\b/iu);
  if (leaked) {
    throw new Error(`${label} exposed local source turn id ${leaked[0]}: ${text}`);
  }
}

function latestSystemPrompt(): string {
  const requestBody = requestBodies.at(-1);
  if (!requestBody) {
    throw new Error("Expected the local LLM server to receive a chat completion request.");
  }
  const parsed = JSON.parse(requestBody) as { messages?: Array<{ role?: string; content?: string }> };
  const systemPrompt = parsed.messages?.find((message) => message.role === "system")?.content;
  if (!systemPrompt) {
    throw new Error(`OpenAI-compatible request did not include a system prompt: ${requestBody}`);
  }
  return systemPrompt;
}

async function writeAtomFile(atoms: MemoryAtom[]): Promise<void> {
  await writeFile(atomPath, `${atoms.map((atom) => JSON.stringify(atom)).join("\n")}\n`, "utf8");
}

async function writeSessionFile(turns: SessionTurn[]): Promise<void> {
  await writeFile(sessionPath, `${turns.map((turn) => JSON.stringify(turn)).join("\n")}\n`, "utf8");
}

async function readAtoms(): Promise<MemoryAtom[]> {
  const raw = await readFile(atomPath, "utf8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryAtom);
}

async function waitForAtom(id: string, predicate: (atom: MemoryAtom) => boolean): Promise<MemoryAtom> {
  const started = Date.now();
  let lastAtoms: MemoryAtom[] = [];
  while (Date.now() - started < 5_000) {
    lastAtoms = await readAtoms();
    const atom = lastAtoms.find((item) => item.id === id);
    if (atom && predicate(atom)) {
      return atom;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for atom ${id}; atoms=${JSON.stringify(lastAtoms)}`);
}

async function waitForMissingAtom(id: string): Promise<void> {
  const started = Date.now();
  let lastAtoms: MemoryAtom[] = [];
  while (Date.now() - started < 5_000) {
    lastAtoms = await readAtoms();
    if (!lastAtoms.some((atom) => atom.id === id)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for atom ${id} to be removed; atoms=${JSON.stringify(lastAtoms)}`);
}

async function refreshMemory(settings: Page): Promise<void> {
  await settings.locator('[data-harness="memory-refresh"]').click();
}

function memoryAtomGroup(memoryLibrary: Locator, type: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-group"][data-memory-type="${type}"]`);
}

function memoryAtomCard(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-card"][data-memory-id="${id}"]`);
}

function memoryAtomText(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-text"][data-memory-id="${id}"]`);
}

function memoryAtomSave(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-save"][data-memory-id="${id}"]`);
}

function memoryAtomExport(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-export"][data-memory-id="${id}"]`);
}

function memoryAtomToggle(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-toggle"][data-memory-id="${id}"]`);
}

function memoryAtomDelete(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-atom-delete"][data-memory-id="${id}"]`);
}

function memoryExportText(settings: Page): Locator {
  return settings.locator('[data-harness="memory-library-export-text"]');
}

async function assertMemoryAtomGroupCount(memoryLibrary: Locator, type: string, expectedCount: number): Promise<void> {
  const group = memoryAtomGroup(memoryLibrary, type);
  await group.waitFor();
  const count = await group.getAttribute("data-memory-count");
  if (count !== String(expectedCount)) {
    throw new Error(`Memory atom group ${type} count mismatch: expected ${expectedCount}, got ${count}`);
  }
}

async function assertMemoryAtomCardCount(memoryLibrary: Locator, expectedCount: number): Promise<void> {
  const count = await memoryLibrary.locator('[data-harness="memory-atom-card"]').count();
  if (count !== expectedCount) {
    throw new Error(`Memory atom card count mismatch: expected ${expectedCount}, got ${count}`);
  }
}

async function openSourceDrilldown(memoryLibrary: Locator, id: string): Promise<Locator> {
  const card = memoryAtomCard(memoryLibrary, id);
  await card.locator('[data-harness="memory-source-open"]').click();
  const source = memoryLibrary.locator(memorySourceDrilldownSelector);
  await source.waitFor();
  return source;
}

async function closeSourceDrilldown(memoryLibrary: Locator): Promise<void> {
  const source = memoryLibrary.locator(memorySourceDrilldownSelector);
  await source.locator('[data-harness="memory-source-close"]').click();
  await source.waitFor({ state: "detached" });
}

async function captureSourceState(page: Page, source: Locator, path: string): Promise<void> {
  await source.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(100);
  await page.screenshot({ path });
}

async function assertSourceStateText(
  source: Locator,
  expected: { includes: string[]; excludes: string[] }
): Promise<void> {
  const text = await source.innerText();
  for (const value of expected.includes) {
    if (!text.includes(value)) {
      throw new Error(`Source state missed ${value}: ${text}`);
    }
  }
  for (const value of expected.excludes) {
    if (text.includes(value)) {
      throw new Error(`Source state included forbidden ${value}: ${text}`);
    }
  }
}

function assertTextDoesNotExposeForbiddenMemoryUi(text: string): void {
  const normalized = text.toLowerCase();
  for (const forbidden of [
    "pending",
    "candidate",
    "approval",
    "triggerkeys",
    "memory-atom-library-provider-secret",
    "desktop-main-session-"
  ]) {
    if (normalized.includes(forbidden)) {
      throw new Error(`Memory Library exposed forbidden ${forbidden} UI text: ${text}`);
    }
  }
}

async function assertNoHorizontalOverflow(page: Page, selector: string): Promise<void> {
  const overflow = await page.locator(selector).evaluateAll((elements) =>
    elements
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          text: element.textContent ?? "",
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          boxWidth: box.width
        };
      })
      .filter((item) => item.scrollWidth > item.clientWidth + 1 || item.boxWidth > window.innerWidth + 1)
  );
  if (overflow.length > 0) {
    throw new Error(`Memory source drilldown overflowed horizontally: ${JSON.stringify(overflow)}`);
  }
}

async function assertSettingsPageDoesNotExposeProviderSecret(page: Page): Promise<void> {
  const rendered = await page.evaluate(() => {
    const fieldValues: string[] = [];
    const elements = document.querySelectorAll("input, textarea, select");
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const style = window.getComputedStyle(element);
      const isVisible =
        style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      if (!isVisible) {
        continue;
      }

      if (element instanceof HTMLSelectElement) {
        let selectedValue = "";
        for (let optionIndex = 0; optionIndex < element.selectedOptions.length; optionIndex += 1) {
          const option = element.selectedOptions.item(optionIndex);
          selectedValue += `${option?.textContent ?? ""} ${option?.value ?? ""} `;
        }
        fieldValues.push(selectedValue.trim());
        continue;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        fieldValues.push(element.value);
      }
    }

    return {
      bodyInnerText: document.body.innerText,
      fieldValues
    };
  });

  const haystack = [rendered.bodyInnerText, ...rendered.fieldValues].join("\n");
  if (haystack.includes(providerSecret)) {
    throw new Error(`Settings page rendered the configured provider API key: ${JSON.stringify(rendered)}`);
  }
}

function makeTurn(overrides: Partial<SessionTurn>): SessionTurn {
  return {
    id: "desktop-main-session-1",
    role: "user",
    content: "User shared a source turn.",
    createdAt: "2026-06-28T00:00:00.000Z",
    ...overrides
  };
}

function makeAtom(overrides: Partial<MemoryAtom>): MemoryAtom {
  return {
    id: "atom-memory",
    threadId: currentThreadId,
    type: "fact",
    text: "User has an atom memory.",
    sourceTurnIds: ["desktop-main-session-1"],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    importance: 0.8,
    triggerKeys: ["hiyori"],
    triggers: {
      exact: ["Hiyori"],
      aliases: [],
      secondary: []
    },
    metadata: {},
    disabled: false,
    ...overrides
  };
}
