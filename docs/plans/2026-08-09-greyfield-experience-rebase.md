# Greyfield First-Use Experience Rebase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付一个诚实、可配置、重启不丢设置、可从单个 Windows portable 文件启动的 Greyfield 首次真实对话闭环。

**Architecture:** 保留 Electron main 对 provider、配置、session 和窗口的所有权；renderer 只展示脱敏状态和发送 typed IPC。四个原子 issue 按依赖顺序分别进入独立 worktree、branch 和 PR，每个 PR 先过规格审查，再过代码质量审查。最终由未参与实现的 sub-agent 从发行 artifact 和临时 userData 独立验收。

**Tech Stack:** TypeScript 5.9、Vue 3、Electron 42.2.0、Vite 8、Vitest 4、Playwright Electron、pnpm 9、electron-builder 26.15.3。

---

## 执行规则与任务账本

主协调 agent 不写业务代码。每个 implementation sub-agent 开工前必须阅读适用的 `AGENTS.md`，使用 `test-driven-development`，只拥有一个 issue 和一个 worktree。实现者完成本地验证、提交、推送并开中文 PR 后，协调 agent 依次派：

1. 独立 spec reviewer；
2. 独立 code-quality reviewer；
3. 若有 finding，原实现者修复，同一 reviewer 复审。

前一项 review 未通过，不进入下一项。PR 合并后才从最新 `origin/main` 创建下一项 worktree。

| 顺序 | Issue | Worktree | Branch | Manifest 分类 | 主要门禁 |
| --- | --- | --- | --- | --- | --- |
| 1 | [#221](https://github.com/zuiho-kai/greyfield-next/issues/221) | `C:\Users\Administrator\.config\superpowers\worktrees\Greyfield-next\issue-221-config-persistence` | `codex/221-config-persistence` | GFN-V1-008 / 016 bug fix | unit + config relaunch Electron harness |
| 2 | [#220](https://github.com/zuiho-kai/greyfield-next/issues/220) | `C:\Users\Administrator\.config\superpowers\worktrees\Greyfield-next\issue-220-product-truth` | `codex/220-product-truth` | GFN-V1-004 / 005 / 008 / 009 polish；GFN-V1-015 correction | renderer tests + restart context + visual |
| 3 | [#222](https://github.com/zuiho-kai/greyfield-next/issues/222) | `C:\Users\Administrator\.config\superpowers\worktrees\Greyfield-next\issue-222-first-chat-setup` | `codex/222-first-chat-setup` | GFN-V1-008 polish | provider tests + first-real-reply + visual |
| 4 | [#223](https://github.com/zuiho-kai/greyfield-next/issues/223) | `C:\Users\Administrator\.config\superpowers\worktrees\Greyfield-next\issue-223-windows-portable` | `codex/223-windows-portable` | 新增 GFN-V1-017；GFN-V1-016 语义不变 | package build + packaged real-chat smoke |

所有 worktree 从其开工时的最新 `origin/main` 创建。禁止让后续任务基于未合并的本地分支静默堆叠。

## Task 1: #221 重启不再覆盖用户配置

**用户结果：** 用户保存真实 provider 设置后，再次运行默认双击路径仍读取同一配置；首次缺配置时仍能得到安全默认窗口与内置模型。

**Files:**

- Modify: `apps/desktop/scripts/dev-live2d-electron.mjs`
- Modify: `apps/desktop/src/main/__tests__/electron-window-options.test.ts`
- Create: `packages/dev-harness/src/electron-config-relaunch-check.ts`
- Modify: `package.json`
- Modify: `packages/dev-harness/v1-features.json`
- Modify: `docs/qa-retro.md`

### Step 1: 创建 issue worktree 并验证基线

Run:

```powershell
git fetch origin --prune
git worktree add "C:\Users\Administrator\.config\superpowers\worktrees\Greyfield-next\issue-221-config-persistence" -b codex/221-config-persistence origin/main
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
```

Expected: 现有测试和 typecheck 通过。若 pnpm 经本地代理卡在 tarball，当前命令进程中清空 `HTTP_PROXY`、`HTTPS_PROXY`、`http_proxy`、`https_proxy` 后重试；不改仓库级 npm 配置。

### Step 2: 写出“已有默认路径配置必须保留”的失败测试

在 `electron-window-options.test.ts` 增加真实磁盘测试。核心断言：

```ts
const existingConfig = {
  ...defaultGreyfieldConfig,
  characterFile: "characters/persisted-greyfield.yaml",
  provider: {
    ...defaultGreyfieldConfig.provider,
    llm: "openai-compatible",
    baseUrl: "https://example.invalid/v1",
    apiKey: "persisted-secret",
    model: "persisted-chat-model",
    taskModels: {
      ...defaultGreyfieldConfig.provider.taskModels,
      planner: "keep-planner-model"
    }
  },
  voice: { ...defaultGreyfieldConfig.voice, speechEnabled: true }
};
await writeFile(join(dir, "greyfield.config.json"), `${JSON.stringify(existingConfig, null, 2)}\n`, "utf8");
await devLaunch.prepareDevLaunchEnvironment({ env: {}, cacheRoot: dir });
expect(JSON.parse(await readFile(join(dir, "greyfield.config.json"), "utf8"))).toEqual(existingConfig);
```

Run:

```powershell
pnpm test -- apps/desktop/src/main/__tests__/electron-window-options.test.ts
```

Expected: FAIL；旧实现把文件改写为只有 `window` 与 `live2d` 的 safe patch。

### Step 3: 只在缺文件或显式测试重置时写初始配置

在 `resolveDevLaunchPaths` 中一次性解析 `configPath`，用 `existsSync` 判断默认路径是否存在。保持显式 `GREYFIELD_CONFIG_PATH` 的最高优先级；新增的 reset 只服务确定性测试：

```js
const configPath = env.GREYFIELD_CONFIG_PATH ?? join(cacheRoot, "greyfield.config.json");
const resetRequested = env.GREYFIELD_RESET_DEV_CONFIG === "1";
return {
  cacheRoot,
  configPath,
  userDataPath: env.GREYFIELD_USER_DATA_PATH ?? join(cacheRoot, "user-data"),
  shouldWriteSafeConfig:
    !env.GREYFIELD_CONFIG_PATH && (resetRequested || !existsSync(configPath))
};
```

不要读取后再 merge 并重写完整配置；“不写”才能保留未知字段和 API key。

### Step 4: 补齐首次创建、显式路径和显式 reset 测试

测试矩阵：

- 默认路径不存在：写入 `safeDevConfigPatch`。
- 默认路径已存在：字节内容不变。
- `GREYFIELD_RESET_DEV_CONFIG=1`：默认路径重建为 safe patch。
- 显式 `GREYFIELD_CONFIG_PATH`：即使不存在也不由 dev launcher 创建；reset 不覆盖显式路径。

Run:

```powershell
pnpm test -- apps/desktop/src/main/__tests__/electron-window-options.test.ts
```

Expected: PASS。

### Step 5: 写 config relaunch Electron harness

`electron-config-relaunch-check.ts` 使用临时目录，执行真实两次启动：

1. 调用 `prepareDevLaunchEnvironment({ env: {}, cacheRoot: tempDir })` 生成首次配置。
2. 预先创建唯一 persona 文件；在首次 Electron Settings 中填入本地 stub Base URL、API key、聊天模型，切换到该 persona 并保存唯一角色名，开启声音；预先放入唯一 `planner` task model。
3. 轮询磁盘，直到 provider、voice 和隐藏 task model 全部写入。
4. 关闭 Electron，再次调用同一 `prepareDevLaunchEnvironment`。
5. 在第二次 Electron Settings 读取 provider readiness；API key 只能显示“已保存”，renderer 不得拿到明文。
6. 直接读取磁盘，断言 provider、voice、`characterFile`、persona 文件内容和 planner token 与第一次相同。

输出 JSON 至 stdout：

```ts
{
  ok: true,
  launchCount: 2,
  persistedProvider: true,
  persistedVoice: true,
  persistedCharacterFile: true,
  persistedPersonaContent: true,
  preservedHiddenTaskModel: true,
  rendererSecretRedacted: true
}
```

### Step 6: 注册窄门禁并更新 manifest/retro

在根 `package.json` 加：

```json
"harness:electron:config-relaunch": "pnpm build:desktop && tsx packages/dev-harness/src/electron-config-relaunch-check.ts"
```

把 GFN-V1-008 与 GFN-V1-016 acceptance 加上“默认双击重启不得覆盖保存配置”的磁盘证据。`docs/qa-retro.md` 记录这次真实 miss：启动器的测试安全默认值不能在每次启动时覆盖用户状态。

### Step 7: 验证、提交、推送并开 PR

Run:

```powershell
pnpm test -- apps/desktop/src/main/__tests__/electron-window-options.test.ts
pnpm harness:electron:config-relaunch
pnpm typecheck
git diff --check
git add apps/desktop/scripts/dev-live2d-electron.mjs apps/desktop/src/main/__tests__/electron-window-options.test.ts packages/dev-harness/src/electron-config-relaunch-check.ts packages/dev-harness/v1-features.json docs/qa-retro.md package.json
git commit -m "fix: preserve config across default relaunch"
git push -u origin codex/221-config-persistence
gh pr create --title "修复默认重启覆盖用户配置" --body "...中文目的、范围、Issue #221、验证与风险..."
```

Expected: PR 只包含 #221；不得包含 UI 重排或打包工具。

## Task 2: #220 如实显示试玩、最近对话与长期记忆暂停

**用户结果：** 默认用户能看懂当前是试玩还是真实 provider；fake ASR 明确是固定转写演示；第二次启动看到有界的最近对话恢复提示；长期记忆明确暂停。

**Files:**

- Modify: `README.md`
- Create: `apps/desktop/src/renderer/provider-experience-status.ts`
- Create: `apps/desktop/src/renderer/__tests__/provider-experience-status.test.ts`
- Modify: `apps/desktop/src/renderer/ControlsWindow.vue`
- Modify: `apps/desktop/src/renderer/ChatWindow.vue`
- Modify: `apps/desktop/src/renderer/settings-memory-extraction-status.ts`
- Modify: `apps/desktop/src/renderer/settings-i18n.ts`
- Modify: `apps/desktop/src/renderer/__tests__/settings-i18n.test.ts`
- Modify: `apps/desktop/src/renderer/desktop-runtime-bridge.ts`
- Modify: `apps/desktop/src/renderer/__tests__/desktop-runtime-bridge.test.ts`
- Modify: `apps/desktop/src/renderer/__tests__/settings-memory-extraction-status.test.ts`
- Modify: `apps/desktop/src/main/runtime-service.ts`
- Modify: `apps/desktop/src/main/__tests__/runtime-service.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `packages/persistence/src/config-schema.ts`
- Modify: `packages/persistence/src/__tests__/config.test.ts`
- Modify: `packages/dev-harness/src/electron-restart-context-check.ts`
- Modify: `packages/dev-harness/src/v1-visual-acceptance-check.ts`
- Modify: `packages/dev-harness/src/__tests__/v1-visual-acceptance-check.test.ts`
- Modify: `packages/dev-harness/v1-features.json`

### Step 1: 从合并后的 main 创建独立 worktree 并跑基线

Run:

```powershell
git fetch origin --prune
git worktree add "C:\Users\Administrator\.config\superpowers\worktrees\Greyfield-next\issue-220-product-truth" -b codex/220-product-truth origin/main
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
```

Expected: #221 已在 `origin/main`，基线通过。

### Step 2: 先写 provider experience 与 memory-paused 失败测试

`provider-experience-status.test.ts` 先定义用户语义：

```ts
expect(describeProviderExperience(fakeState, "zh-CN")).toMatchObject({
  tone: "preview",
  label: "试玩模式",
  actionLabel: "配置真实聊天"
});
expect(describeVoiceInputExperience(fakeState, "zh-CN")).toMatchObject({
  isPreview: true,
  label: "试玩语音（固定转写）"
});
expect(describeProviderExperience(completeButUntestedState, "zh-CN")).toMatchObject({
  tone: "blocked",
  actionLabel: "测试连接"
});
expect(describeProviderExperience(failedTestState, "zh-CN")).toMatchObject({
  tone: "blocked",
  actionLabel: "重新测试"
});
expect(describeProviderExperience(successfulTestState, "zh-CN")).toMatchObject({
  tone: "configured",
  actionLabel: ""
});
```

把 memory status 旧测试改为：

```ts
expect(describeMemoryExtractionStatus(createInitialDesktopRendererState())).toMatchObject({
  tone: "disabled",
  label: "长期记忆当前暂停"
});
```

Run:

```powershell
pnpm test -- apps/desktop/src/renderer/__tests__/provider-experience-status.test.ts apps/desktop/src/renderer/__tests__/settings-memory-extraction-status.test.ts
```

Expected: FAIL；新模块和新 truth state 尚不存在。

同一步先把 fresh/default 的主动行为写成失败测试：

```ts
expect(defaultGreyfieldConfig.ui.proactiveMemoryEnabled).toBe(false);
expect(defaultGreyfieldConfig.ui.proactivityLevel).toBe(0);
```

已有用户配置继续按原值读取，不做静默迁移；这里只改变新配置默认值。屏幕感知保持现有 fresh state 的 `off`，并由 visual harness 断言。

### Step 3: 增加最小、脱敏的 session continuity IPC

在 `DesktopIpcEventMap` 新增：

```ts
"session:continuity": {
  restoredRecentTurnCount: number;
  longTermMemoryEnabled: boolean;
};
```

`RuntimeService` 增加只返回数量的方法，使用与 runtime 相同的上限：

```ts
async getSessionContinuity(): Promise<{ restoredRecentTurnCount: number }> {
  const limit = this.options.recentTurnLimit ?? 20;
  const recentTurns = await this.sessionStore.getRecent(limit);
  return { restoredRecentTurnCount: recentTurns.length };
}
```

不要把历史正文发给 renderer。`index.ts` 用一个命名常量同时控制 `memoryEnabled: false` 与广播的 `longTermMemoryEnabled: false`，避免未来再次出现文案与 runtime 两套真相。

`desktop-runtime-bridge.ts` 初始状态：

```ts
sessionContinuity: {
  restoredRecentTurnCount: 0,
  longTermMemoryEnabled: false
}
```

订阅 `session:continuity` 并只替换该字段。

### Step 4: 实现共享试玩/真实状态与可见入口

`provider-experience-status.ts` 复用 `describeProviderStatus` 判断字段完整度，再把 `providerTest.status` 纳入用户语义；“字段齐全”不能等价于“已就绪”：

```ts
export function describeProviderExperience(state: DesktopRendererState, locale: SettingsLocale): ProviderExperienceView {
  const provider = describeProviderStatus(state, locale);
  if (provider.tone === "preview") {
    return { tone: "preview", label: settingsT(locale, "experience.preview"), detail: provider.detail, actionLabel: settingsT(locale, "experience.configure") };
  }
  if (provider.tone === "blocked") {
    return { tone: "blocked", label: settingsT(locale, "experience.incomplete"), detail: provider.detail, actionLabel: settingsT(locale, "experience.finishSetup") };
  }
  if (state.providerTest.status !== "success") {
    return {
      tone: "blocked",
      label: settingsT(locale, state.providerTest.status === "error" ? "experience.testFailed" : "experience.untested"),
      detail: state.providerTest.message || settingsT(locale, "experience.testRequired"),
      actionLabel: settingsT(locale, state.providerTest.status === "error" ? "experience.retest" : "experience.test")
    };
  }
  return { tone: "configured", label: settingsT(locale, "experience.configured"), detail: provider.detail, actionLabel: "" };
}
```

`DesktopRuntimeBridge.updateSettings()` 只要 patch 改到 `providerLLM`、`providerBaseUrl`、`providerApiKey` 或 `providerModel`，就把旧 `providerTest` 重置为 `idle`；测试成功后再改模型必须回到“待测试”。补 bridge 单测保护 stale success 不会泄露到 Controls/Chat。

- Controls 首眼显示短 pill；试玩/未完成状态提供有文字的配置按钮，不只放齿轮图标。
- Chat 在消息列表上方显示同一状态与 CTA。
- fake ASR 时保留确定性演示入口，但按钮可见文本/tooltip 必须写“固定转写试玩”。
- Chat 在 `restoredRecentTurnCount > 0` 时显示“已恢复最近 N 条对话消息（不是长期记忆）”，不显示正文。
- fresh/default 主动说话为关闭、强度为 0；Settings 高级区如实显示关闭。屏幕感知保持默认关闭。已有显式用户配置不被覆盖。

### Step 5: 让长期记忆可见区服从 runtime capability

`describeMemoryExtractionStatus` 最前面检查 `state.sessionContinuity.longTermMemoryEnabled`：

```ts
if (!state.sessionContinuity.longTermMemoryEnabled) {
  return {
    tone: "disabled",
    label: settingsT(locale, "memory.paused.label"),
    detail: settingsT(locale, "memory.paused.detail")
  };
}
```

Settings 中禁用会触发新记忆抽取的 toggle，但保留已有开发管理表面；说明“管理工具存在”不等于默认对话会写长期记忆。

### Step 6: 重写 README 当前状态，不再把技术预览称为成品

必须审计整段“当前状态”“快速开始”“质量保证”，而不是只替换一行：

- 默认 fake LLM/ASR 明确为试玩。
- 真实 provider 是可配置路径，需 Test LLM。
- Windows 双击器是源码开发启动器，Task 4 前不称发行物。
- 长期记忆 runtime 当前暂停；benchmark/管理代码不等于产品已启用。
- recent context 跨重启已有 harness，但不是长期语义记忆。
- V2-V6 从“当前功能”移到冻结的后续方向。

### Step 7: 扩展 restart 与 visual harness

`electron-restart-context-check.ts` 在第二次发送前断言 Chat 有恢复提示，并继续验证第二次 mock provider 请求包含第一轮 unique text。输出增加：

```ts
restoredRecentTurnCountVisible: true,
restoredBeforeSecondSend: true,
longTermMemoryClaimPaused: true
```

`v1-visual-acceptance-check.ts` 从 fresh/default state 截图并断言：

- Controls 试玩状态和“配置真实聊天”在 viewport 内。
- Chat 试玩 banner 在 viewport 内。
- Settings 长期记忆暂停文案可通过普通导航到达；截图不把 scrollIntoView 当 first-glance 证据。
- fresh config 的主动说话和屏幕感知均为关闭；启动期间不得出现未经用户动作的 proactive message。

同步更新 manifest：GFN-V1-008 增加 fresh Settings/renderer 的主动行为默认关闭验收；GFN-V1-015 增加只广播有界 recent message count、不得发送历史正文的验收。不得另写一个没有 QA script 的游离声明。

### Step 8: 负向文本搜索与窄验证

Run:

```powershell
rg -n "本地记忆已开启|Local memory is on|长期记忆 ✅|最小闭环已完成" README.md apps/desktop/src/renderer packages/dev-harness
pnpm test -- packages/persistence/src/__tests__/config.test.ts apps/desktop/src/renderer/__tests__/provider-experience-status.test.ts apps/desktop/src/renderer/__tests__/settings-memory-extraction-status.test.ts apps/desktop/src/renderer/__tests__/settings-i18n.test.ts apps/desktop/src/renderer/__tests__/desktop-runtime-bridge.test.ts apps/desktop/src/main/__tests__/runtime-service.test.ts packages/dev-harness/src/__tests__/v1-visual-acceptance-check.test.ts
pnpm harness:electron:restart-context
pnpm harness:v1-visual
pnpm typecheck
```

Expected: `rg` 无旧承诺命中；命名 fixture 若必须保留，改成明确的 historical/negative fixture 并由测试说明。全部命令通过，人工打开 Controls、Chat、Settings 截图。

### Step 9: 提交、推送并开 PR

Commit message:

```text
feat: make first-use capability state truthful
```

PR body 用中文，链接 #220，列出截图绝对路径、restart summary、负向搜索和未启用长期记忆的边界。

## Task 3: #222 四项完成真实聊天，其余设置后置

**用户结果：** 默认 Controls 点击一次即可打开无需滚动的模型连接卡；填写 provider、Base URL、API key、聊天模型并测试后，同一 Chat 获得由本地 OpenAI-compatible stub 生成的真实流式回复。

**Files:**

- Modify: `apps/desktop/src/renderer/SettingsWindow.vue`
- Modify: `apps/desktop/src/renderer/ProviderSettingsSection.vue`
- Modify: `apps/desktop/src/renderer/settings-nav.ts`
- Modify: `apps/desktop/src/renderer/settings-i18n.ts`
- Modify: `apps/desktop/src/renderer/styles.css`
- Modify: `apps/desktop/src/renderer/__tests__/settings-nav.test.ts`
- Modify: `apps/desktop/src/renderer/__tests__/settings-input-patch.test.ts`
- Modify: `apps/desktop/src/renderer/__tests__/settings-provider-status.test.ts`
- Modify: `apps/desktop/src/renderer/__tests__/settings-i18n.test.ts`
- Create: `packages/dev-harness/src/electron-first-real-reply-check.ts`
- Modify: `packages/dev-harness/src/electron-settings-provider-test-check.ts`
- Modify: `packages/dev-harness/src/v1-visual-acceptance-check.ts`
- Modify: `packages/dev-harness/src/__tests__/v1-visual-acceptance-check.test.ts`
- Modify: `package.json`
- Modify: `packages/dev-harness/v1-features.json`

### Step 1: 从 #220 合并后的 main 建 worktree并跑基线

使用任务账本中的 worktree/branch。串行运行 install、`pnpm test`、`pnpm typecheck`。

### Step 2: 先写默认 provider-first 失败测试，并保留高级字段不变回归

`settings-nav.test.ts`：

```ts
expect(settingsPrimarySectionIds).toEqual(["provider"]);
expect(settingsAdvancedSectionIds).toEqual(["persona", "voice", "model", "window", "memory"]);
```

`settings-input-patch.test.ts` 现有职责已经保护基础输入不会顺带改高级字段；补齐具体 slot 断言并把它当回归门禁，而不是虚构为失败。填写 Base URL、API key、chat model 产生的 patch 不包含 planner、utility、memory、vision、multimodal、voice ASR/TTS 字段。

Run targeted tests；Expected: `settings-nav.test.ts` 因默认区仍不是 provider-first 而 FAIL；`settings-input-patch.test.ts` 应继续 PASS。若 patch 测试失败，先按独立回归处理，不把它归因于导航改动。

### Step 3: Provider 首屏只保留四项与 Test LLM

`ProviderSettingsSection.vue` 调整为：

1. provider 类型；
2. Base URL；
3. API Key；
4. `providerModel` 聊天模型；
5. readiness、Test LLM、结果。

其余七个 task slots 放进默认关闭的语义化 disclosure：

```vue
<details class="provider-advanced" data-harness="provider-advanced-models">
  <summary>{{ t("advanced.taskModels") }}</summary>
  <label v-for="slot in advancedTaskModelSlots" ...>...</label>
</details>
```

chat slot 不得在高级区重复。隐藏高级区时不能卸载或重写其 state。

### Step 4: Settings 默认 provider-first，低频分区后置

- `activeSectionId` 默认改为 `provider`。
- template 顺序先渲染 Provider。
- 左侧首屏只显示“开始聊天”、Chat 与“高级设置”按钮。
- 用户展开高级设置后，Persona、Voice、Live2D、Window、Memory 现有分区与导航全部保留。
- 展开动作不自动滚动；点击具体高级 nav 后才 `nextTick` 定位。

820×620 下，provider 四项、readiness 和 Test LLM 必须同时在 control viewport 内。

### Step 5: 扩展 provider harness，保护失败与隐藏字段

`electron-settings-provider-test-check.ts` 继续覆盖 fake、缺 Base URL、缺 API key、缺模型与成功，并让本地 stub 可确定性返回以下 Test LLM 失败：

- HTTP 401：凭据未通过；
- HTTP 403：凭据无权限；
- HTTP 404：Base URL 或模型不存在；
- 请求超时：提示检查地址/网络并可重试；
- SSE 在首 token 前断开或返回 malformed stream：显示流错误，不假装测试成功。

每种错误都必须在 Settings 显示可读、可重试的短文案；不得泄露 API key、请求 body 或堆栈。另新增：

- 初始 viewport 内能看到四项和 Test LLM。
- advanced disclosure 默认关闭。
- 填基础字段后，预置 planner/memory/vision token 的磁盘值不变。
- Test LLM 不写 session JSONL。

### Step 6: 新增 first-real-reply Electron harness

`electron-first-real-reply-check.ts`：

1. fresh fake config + 本地 SSE stub。
2. 在 Controls 点击可见文字“配置真实聊天”。
3. Settings 出现且 provider 卡无需滚动。
4. 填四项并 Test LLM 成功。
5. 从 Settings 打开 Chat，发送唯一 `nonce`。
6. stub 断言 request messages 含该 nonce，返回 `真实回复:${nonce}`。
7. Chat 完整消息与 Pet bubble 都显示该回复。
8. 磁盘 config 为 openai-compatible；session JSONL 只含真实用户/assistant turn。

输出：

```ts
{
  ok: true,
  entryVisibleFromControls: true,
  providerCardFitsViewport: true,
  testLlmSucceeded: true,
  realRequestContainedNonce: true,
  chatDisplayedStubReply: true,
  petDisplayedStubReply: true,
  fakeReplyAbsent: true
}
```

根 `package.json` 加 `harness:electron:first-real-reply`。

### Step 7: 更新 visual harness 并人工看图

默认 Settings 截图改成 provider-first。断言：

- provider section top 在 viewport；
- 四项与 Test LLM 全可见；
- advanced disclosure 关闭；
- 打开 advanced 后 task model 与其余导航可达。

保留一张 advanced 截图，但不得把它当首次配置截图。

### Step 8: 窄验证、提交与 PR

Run:

```powershell
pnpm test -- apps/desktop/src/renderer/__tests__/settings-nav.test.ts apps/desktop/src/renderer/__tests__/settings-input-patch.test.ts apps/desktop/src/renderer/__tests__/settings-provider-status.test.ts apps/desktop/src/renderer/__tests__/settings-i18n.test.ts packages/dev-harness/src/__tests__/v1-visual-acceptance-check.test.ts
pnpm harness:electron:settings-provider-test
pnpm harness:electron:first-real-reply
pnpm harness:v1-visual
pnpm typecheck
git diff --check
```

人工检查 first-glance、advanced 与真实回复截图。Commit：

```text
feat: make real chat setup the first settings path
```

推送 `codex/222-first-chat-setup`，开中文 PR 并链接 #222。

## Task 4: #223 Windows portable 与 packaged 真实聊天闭环

**用户结果：** 用户从项目外路径双击一个版本化 portable `.exe`，无需仓库、Node、pnpm 或 Vite；同一个 exe 能完成真实 provider 测试、真实回复、Stop 与重启连续性，且所有可写数据只进入应用 userData。

**锁定决策：** 使用 `electron-builder@26.15.3` 的 Windows x64 `portable` target，Electron 固定为 `42.2.0`。portable 是单文件、免安装目标；`files`、`extraResources` 与 `asarUnpack` 分别控制应用文件、bootstrap 资源和 Live2D 解包。Electron 42.2.0 内嵌 Node 24.15.0，不把 host Node 版本误当 Electron ABI；本任务通过清除 production native import 避免 ABI rebuild，而不是追不存在的 Windows `sqlite-vss@0.1.2` 二进制。

官方依据：

- `https://www.electron.build/docs/win/`
- `https://www.electron.build/docs/contents/`
- `https://releases.electronjs.org/release/v42.2.0`
- `https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.15.3`

**Files（worker 不得改成另一套 packager 或未命名替代物）：**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/desktop/package.json`
- Create: `electron-builder.yml`
- Create: `scripts/prepare-windows-portable-stage.mjs`
- Modify: `apps/desktop/scripts/build-main.mjs`
- Create: `apps/desktop/src/main/desktop-paths.ts`
- Create: `apps/desktop/src/main/__tests__/desktop-paths.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/runtime-service.ts`
- Modify: `apps/desktop/src/main/memory-v2-init.ts`
- Create: `packages/dev-harness/src/windows-portable-smoke.ts`
- Create: `packages/dev-harness/src/__tests__/windows-portable-stage.test.ts`
- Modify: `packages/dev-harness/v1-features.json`
- Modify: `README.md`
- Modify: `docs/progress.md` only after artifact acceptance passes

### Step 1: 从 #222 合并后的 main 创建 worktree并证明旧 packaged path 会失败

按任务账本建 worktree，串行 install、`pnpm test`、`pnpm typecheck`。在 `desktop-paths.test.ts` 先写：

- dev：project root 仍可由显式 `GREYFIELD_PROJECT_ROOT`/仓库 root 提供；
- packaged：bootstrap root 是 `process.resourcesPath/bootstrap`，writable root 是 `userData`；
- config、session、persona working copy、memory seed 都不得写到 `app.asar` 或 resources；
- bootstrap 第一次复制 `greyfield.yaml` 与 `memory.md`，目标已有内容时逐字节保留；
- `GREYFIELD_USER_DATA_PATH` 覆盖值成为唯一 writable root。

Run:

```powershell
pnpm test -- apps/desktop/src/main/__tests__/desktop-paths.test.ts
```

Expected: FAIL；现有 `join(currentDir, "..", "..", "..")` 在 `resources/app.asar/dist-main` 下错位，也没有 copy-if-missing bootstrap。

### Step 2: 建立统一 packaged path 与一次性 bootstrap

`desktop-paths.ts` 导出可注入、可单测的 `resolveDesktopPaths()` 和 `ensurePackagedBootstrap()`：

- packaged bootstrap：`resourcesPath/bootstrap/{characters,data}`；
- packaged `projectRoot`：`userData`；
- 第一次只复制 `characters/greyfield.yaml` 到 `userData/characters/greyfield.yaml`、`data/memory.md` 到 `userData/data/memory.md`；
- 后续启动不覆盖 persona 或 data；复制失败要带源/目标路径的脱敏错误并阻止半初始化启动；
- config 与 JSONL session 均从同一 `userData` 派生。

`index.ts` 在 `app.whenReady()` 前读取 `GREYFIELD_USER_DATA_PATH` 并 `app.setPath("userData", value)`，ready 后完成 bootstrap，再创建 runtime/windows。renderer/preload 仍从 `app.asar` 内相对路径加载。portable 0.1 只承诺内置 Live2D；Vite 专属 `/@fs/` 自定义绝对模型路径在 README 标为未验收，不得宣称 packaged 已支持。

### Step 3: 清除长期记忆暂停路径上的 native runtime import

当前 `runtime-service.ts` 顶层导入 `memory-v2-init.ts`，导致 main bundle 即使 `memoryEnabled:false` 仍包含 `better-sqlite3`/`sqlite-vss` external import。最小 owner-boundary 修正：

- `RuntimeServiceOptions` 增加可选 `initializeMemoryStoresV2` factory；
- `runtime-service.ts` 只保留 `MemoryStoresV2` type surface，不再运行时导入 `memory-v2-init.ts`；
- 只有未来显式启用长期记忆的 caller 才注入 native factory；当前 desktop 不注入；
- `build-main.mjs` 的 external 只保留 `electron`；
- `apps/desktop/package.json` 移除重复声明的 `better-sqlite3`、`sqlite-vss`，Electron 改为精确 `42.2.0`。

`prepare-windows-portable-stage.mjs` 在复制前扫描 `dist-main/index.mjs` 与 `dist-preload/index.cjs`：允许 `electron`、`node:*` 和 Node builtin；一旦出现其他第三方裸 import、`better-sqlite3`、`sqlite-vss` 或 `.node` 就硬失败。不能退回“把 sqlite-vss DLL 解包”，因为该版本无 Windows binary；也不能只因 `memoryEnabled:false` 就忽略静态 import。

### Step 4: 写无 dependencies staging 与单一 builder 配置

`prepare-windows-portable-stage.mjs` 每次重建 `.cache/greyfield-windows-portable/app/`，只复制：

- `dist-main/index.mjs`；
- `dist-preload/index.cjs`；
- `dist-renderer/**`，排除 source map；
- bootstrap `characters/greyfield.yaml`、`data/memory.md`；
- 生成的最小 `package.json`，含 `name`、`productName`、`version`、`main`，且 `dependencies` 为空。

`windows-portable-stage.test.ts` 对真实 fixture/stage helper 断言上述 allowlist，并负向断言无源码、test、Playwright、`.cache` 嵌套、workspace path、node_modules 或 SQLite 字符串。

根 `electron-builder.yml` 固定：

```yaml
appId: io.greyfield.desktop
productName: Greyfield
directories:
  app: .cache/greyfield-windows-portable/app
  output: .cache/greyfield-windows-portable/artifacts
asar: true
npmRebuild: false
files:
  - package.json
  - dist-main/index.mjs
  - dist-preload/index.cjs
  - dist-renderer/**/*
asarUnpack:
  - dist-renderer/assets/live2d/**/*
extraResources:
  - from: .cache/greyfield-windows-portable/app/bootstrap/characters
    to: bootstrap/characters
  - from: .cache/greyfield-windows-portable/app/bootstrap/data
    to: bootstrap/data
win:
  target:
    - target: portable
      arch: [x64]
  artifactName: Greyfield-${version}-win-${arch}-portable.${ext}
```

`extraResources.from` 以 electron-builder project root 为基准；stage test 要解析 YAML 并证明路径存在。根版本与 staging 版本统一改成 `0.1.0-preview.1`，`electron-builder` 精确锁 `26.15.3`。

### Step 5: 增加确定性 package/manifest 命令

根 scripts 精确增加：

```json
"package:windows:portable": "pnpm build:desktop && node scripts/prepare-windows-portable-stage.mjs && electron-builder --config electron-builder.yml --win portable --x64",
"harness:windows:portable": "tsx packages/dev-harness/src/windows-portable-smoke.ts",
"verify:windows:portable": "pnpm test -- apps/desktop/src/main/__tests__/desktop-paths.test.ts packages/dev-harness/src/__tests__/windows-portable-stage.test.ts && pnpm typecheck && pnpm package:windows:portable && pnpm harness:windows:portable"
```

staging helper 或 smoke 计算唯一 artifact 的 `{ fileName, bytes, sha256 }`；若 artifact 数量不是 1、命名不匹配版本/平台/架构或 hash 为空则失败。

### Step 6: 对同一个仓库外 portable exe 跑真实闭环

`windows-portable-smoke.ts` 不启动 dev Electron，也不接受 `win-unpacked` 代替 portable：

1. 启动本地 OpenAI-compatible SSE nonce server；创建 fresh userData 与仓库外启动目录，把唯一 portable exe 复制过去。
2. 清除 `GREYFIELD_DESKTOP_URL`、`GREYFIELD_PROJECT_ROOT`、`GREYFIELD_CONFIG_PATH`；PATH 只留 Windows 系统目录；设置唯一 `GREYFIELD_USER_DATA_PATH`。
3. 用 Playwright 以 portable exe 为 `executablePath` 启动；若 wrapper 无法连接，harness 直接失败，不静默改测 unpacked app。
4. 证明 renderer URL 全是 `file:`，进程树无 Vite、pnpm 或 Node dev server；Pet/Controls bounds 位于可见显示器。
5. 从 stage/renderer 诊断读取并断言 `data-stage-mode="live2d"`、`usedFallback=false`，WebGL 非透明模型像素至少 2000；保存 `pet.png`。
6. 截图并证明 Controls 试玩状态和“配置真实聊天”首眼可见；点击普通入口，Settings 四项与 Test LLM 无滚动可见。
7. 通过普通 UI 写入本地 stub Base URL、API key、模型；Test LLM 成功，stub 收到唯一 test nonce。
8. 打开 Chat 发送唯一 user nonce；stub 收到真实 HTTP/SSE request，Chat 与 Pet bubble 显示 `真实回复:<nonce>`，固定 fake 回复不存在。
9. 从 Controls 显式开启回复语音（保留 deterministic fake TTS），再发长流：stub 先发送可播放完整句并保持连接；语音开始后点击 Stop，断言 provider request abort、无 late nonce、audio queue 清空、speech cancel 被调用、`mouthOpen=0`。
10. 退出后断言 config/session/persona working copy 只在临时 userData；仓库 config/persona/data hash 不变，仓库外 exe 目录无用户配置。
11. 用同一 exe 与同一 userData 重启；provider/key/model 仍在，最近消息恢复提示出现；再次真实请求的 messages 包含重启前 nonce，Live2D 仍 `usedFallback=false`。

输出 `.cache/greyfield-packaged-smoke/latest/{summary.json,pet.png,controls-trial.png,settings-real-config.png,chat-real-reply.png,chat-stopped.png,restart.png}`。`summary.json` 至少含 artifact hash/bytes、window bounds、renderer schemes、`usedFallback:false`、painted pixel count、test/real/abort nonce、config path、restart context 与仓库 hash-before/after。

### Step 7: 更新 manifest、产品状态与已知边界

新增 `GFN-V1-017 Windows self-contained portable`；GFN-V1-016 保留源码环境双击启动器原义，并明确不是用户发行物。GFN-V1-017 acceptance 直接引用 `pnpm verify:windows:portable` 与 summary 字段。README 写清未签名可能触发 SmartScreen、无自动更新、只验内置 Live2D、本地 stub 只证明 OpenAI-compatible HTTP/SSE contract。只有 packaged 验收通过后才更新 `docs/progress.md`，不得提前写“已发布”。

### Step 8: 精确验证、提交与 PR

Run:

```powershell
pnpm test -- apps/desktop/src/main/__tests__/desktop-paths.test.ts packages/dev-harness/src/__tests__/windows-portable-stage.test.ts
pnpm typecheck
pnpm package:windows:portable
pnpm harness:windows:portable
git diff --check
```

人工打开 6 张截图并核对 `summary.json`、artifact manifest、stage allowlist。Commit：

```text
feat: ship a self-contained Windows portable
```

推送 `codex/223-windows-portable`，开中文 PR，链接 #223，明确未签名、无自动更新、无公开 Release；如果 portable wrapper 无法被同一 harness 驱动，状态是 blocked，不得用 dev/unpacked 证据关闭 issue。

## Task 5: 未参与实现的 sub-agent 最终验收

**验收者约束：** 必须新 spawn，不能是 #220–#223 的任何实现者；只读 merged `origin/main` 与发行 artifact，不接受实现者口头说明作为证据。

**Files:**

- Read: `docs/plans/2026-08-09-greyfield-experience-rebase-design.md`
- Read: `packages/dev-harness/v1-features.json`
- Inspect: `.cache/greyfield-packaged-smoke/latest/**`
- Inspect: 四个 merged PR 的 current-head diff、checks 与 review threads
- Do not modify tracked files

### Step 1: 建立验收矩阵

逐项列出：artifact/启动、试玩披露、fake ASR 披露、主动行为默认关闭、最小 provider 设置、Test LLM 失败矩阵、真实 nonce 回复、Stop、配置重启、recent context 提示、长期记忆暂停、packaged path、资源/绝对路径/SQLite 依赖泄露。

### Step 2: 从 artifact 与新 userData 重跑普通用户路径

验收者亲自运行：

```powershell
pnpm verify:windows:portable
pnpm harness:electron:first-real-reply
pnpm harness:electron:provider-abort
pnpm harness:electron:stop-audio
pnpm harness:electron:config-relaunch
pnpm harness:electron:restart-context
```

所有 Electron harness 串行执行，不得并行共享窗口或 build 目录。真实聊天、Stop 和重启的发行物结论只取自 `verify:windows:portable` 对同一个仓库外 exe 的证据；后续 dev harness 只是模块回归，不能替代 packaged verdict。

### Step 3: 检查可见证据和负向事实

- 打开 packaged Pet、Controls、Chat、Settings 截图。
- 从 fresh state 证明入口无需滚动或开发快捷键。
- 搜索错误长期记忆承诺、fake 伪装文案、仓库绝对路径。
- 核对 artifact hash、文件大小、进程树、config userData 路径、`usedFallback=false` 与 painted pixels。
- 解开/检查 stage allowlist，确认无 `better-sqlite3`、`sqlite-vss`、`.node`、test、Playwright 或 workspace 绝对路径。

### Step 4: 输出 literal verdict

只允许：

- `通过`：全部本轮条件满足，无 P0/P1；
- `不通过`：列出最小复现、证据路径、责任 issue/模块与严重级别。

任何失败回到原 implementation sub-agent 修复，再由同一验收者复验。实现者自测、PR green 或协调 agent 代码审查都不能替代这个最终 verdict。
