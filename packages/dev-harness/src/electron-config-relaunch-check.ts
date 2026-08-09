import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
import {
  formatPersistedStateFailure,
  formatRendererSecretFailure,
  redactSyntheticProviderKey,
  type ExpectedPersistedState
} from "./electron-config-relaunch-diagnostics";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const artifactDir = join(workspaceRoot, "artifacts", "v1-config-relaunch");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-config-relaunch-"));
const personaPath = join(tempDir, "characters", "relaunch-persona.yaml");
const runToken = `${process.pid}-${Date.now()}`;
const providerApiKey = `relaunch-secret-${runToken}`;
const providerModel = `relaunch-chat-${runToken}`;
const plannerModel = `relaunch-planner-${runToken}`;
const personaName = `Relaunch-${runToken}`;

const server = createServer((_request, response) => {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.end('data: {"choices":[{"delta":{"content":"relaunch stub reply"}}]}\n\ndata: [DONE]\n\n');
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const providerBaseUrl = `http://127.0.0.1:${port}/v1`;
const devLaunch = await import(new URL("../../../apps/desktop/scripts/dev-live2d-electron.mjs", import.meta.url).href);

await mkdir(artifactDir, { recursive: true });
await mkdir(dirname(personaPath), { recursive: true });
await writeFile(
  personaPath,
  [
    "name: RelaunchSeed",
    "userAddress: tester",
    "background: A local relaunch persistence fixture.",
    "personality: steady and precise",
    "speakingStyle: short and direct",
    "tone: warm",
    "boundaries:",
    "  - Keep the relaunch fixture local.",
    "greeting: Ready for relaunch.",
    "expressionMap:",
    "  neutral: default",
    "defaultExpression: neutral",
    ""
  ].join("\n"),
  "utf8"
);

try {
  const firstLaunchEnv = await devLaunch.prepareDevLaunchEnvironment({ env: {}, cacheRoot: tempDir });
  const configPath = firstLaunchEnv.GREYFIELD_CONFIG_PATH;
  const initialSafePatch = JSON.parse(await readFile(configPath, "utf8")) as Pick<
    GreyfieldConfig,
    "window" | "live2d"
  >;
  const initialSafeConfigCreated =
    JSON.stringify(initialSafePatch) === JSON.stringify(devLaunch.safeDevConfigPatch);
  if (!initialSafeConfigCreated) {
    throw new Error(`First default preparation did not create the safe patch: ${JSON.stringify(initialSafePatch)}`);
  }

  const seededConfig: GreyfieldConfig = {
    ...defaultGreyfieldConfig,
    window: { ...defaultGreyfieldConfig.window, ...initialSafePatch.window },
    live2d: { ...defaultGreyfieldConfig.live2d, ...initialSafePatch.live2d },
    provider: {
      ...defaultGreyfieldConfig.provider,
      taskModels: {
        ...defaultGreyfieldConfig.provider.taskModels,
        planner: plannerModel
      }
    }
  };
  await writeFile(configPath, `${JSON.stringify(seededConfig, null, 2)}\n`, "utf8");

  const firstApp = await launchApp(firstLaunchEnv);
  let firstArtifact: WindowArtifact;
  try {
    const settings = await openSettingsThroughControls(firstApp);
    const providerSelect = settings.locator('[data-settings-section="provider"] select').first();
    await providerSelect.selectOption("openai-compatible");
    await settings.getByLabel("Base URL").fill(providerBaseUrl);
    await settings.getByLabel("API Key").fill(providerApiKey);
    await settings.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }).fill(providerModel);

    await openAdvancedSettingsSection(settings, /^(Persona|人格)$/);
    await settings.getByLabel(/^(Character|角色文件)$/).fill(personaPath);
    await settings.locator(".provider-test-result--success", { hasText: /Loaded persona|已加载人格/ }).waitFor({
      timeout: 10_000
    });
    await settings.getByLabel("Greyfield name").fill(personaName);
    await settings.getByRole("button", { name: /^(Save persona|保存人格)$/ }).click();
    await settings.locator(".provider-test-result--success", { hasText: /Saved persona|已保存人格/ }).waitFor({
      timeout: 10_000
    });
    await openAdvancedSettingsSection(settings, /^(Voice|语音)$/);
    await settings.getByLabel("Speak replies").check();

    await waitForPersistedState(configPath, {
      providerBaseUrl,
      providerApiKey,
      providerModel,
      plannerModel,
      personaPath,
      personaName
    });
    firstArtifact = await captureWindowArtifact(firstApp, settings, join(artifactDir, "settings-first-save.png"));
  } finally {
    await firstApp.close();
  }

  const firstConfigRaw = await readFile(configPath, "utf8");
  const firstConfig = JSON.parse(firstConfigRaw) as GreyfieldConfig;
  const firstPersonaContent = await readFile(personaPath, "utf8");

  const secondLaunchEnv = await devLaunch.prepareDevLaunchEnvironment({ env: {}, cacheRoot: tempDir });
  const relaunchPrepareByteStable = (await readFile(configPath, "utf8")) === firstConfigRaw;
  if (!relaunchPrepareByteStable) {
    throw new Error("Ordinary second preparation changed the persisted config before Electron relaunched");
  }

  let rendererSecretRedacted = false;
  const secondApp = await launchApp(secondLaunchEnv);
  let secondArtifact: WindowArtifact;
  try {
    const settings = await openSettingsThroughControls(secondApp);
    await settings.locator(".provider-status--ready", { hasText: /Ready to test|可以测试/ }).waitFor({ timeout: 10_000 });
    await expectInputValue(settings.locator('[data-settings-section="provider"] select').first(), "openai-compatible");
    await expectInputValue(settings.getByLabel("Base URL"), providerBaseUrl);
    await expectInputValue(settings.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }), providerModel);
    await openAdvancedSettingsSection(settings, /^(Persona|人格)$/);
    await expectInputValue(settings.getByLabel(/^(Character|角色文件)$/), personaPath);
    await expectInputValue(settings.getByLabel("Greyfield name"), personaName);
    await openAdvancedSettingsSection(settings, /^(Voice|语音)$/);
    if (!(await settings.getByLabel("Speak replies").isChecked())) {
      throw new Error("Voice speech setting was off after relaunch");
    }

    const apiKeyInput = settings.getByLabel("API Key");
    const apiKeyValue = await apiKeyInput.inputValue();
    const apiKeyPlaceholder = (await apiKeyInput.getAttribute("placeholder")) ?? "";
    const rendererText = await settings.locator("body").innerText();
    const savedPlaceholderMatched = /Saved API key|已保存 API key/.test(apiKeyPlaceholder);
    const rendererContainsKnownSecret = rendererText.includes(providerApiKey);
    rendererSecretRedacted =
      apiKeyValue === "" && savedPlaceholderMatched && !rendererContainsKnownSecret;
    if (!rendererSecretRedacted) {
      throw new Error(formatRendererSecretFailure({
        apiKeyValue,
        apiKeyPlaceholder,
        savedPlaceholderMatched,
        rendererContainsKnownSecret,
        knownSecret: providerApiKey
      }));
    }
    await settings.locator('[data-settings-section="provider"]').scrollIntoViewIfNeeded();
    secondArtifact = await captureWindowArtifact(secondApp, settings, join(artifactDir, "settings-second-launch.png"));
  } finally {
    await secondApp.close();
  }

  const secondConfig = JSON.parse(await readFile(configPath, "utf8")) as GreyfieldConfig;
  const secondPersonaContent = await readFile(personaPath, "utf8");
  const persistedProvider =
    secondConfig.provider.llm === "openai-compatible" &&
    secondConfig.provider.baseUrl === firstConfig.provider.baseUrl &&
    secondConfig.provider.apiKey === firstConfig.provider.apiKey &&
    secondConfig.provider.model === firstConfig.provider.model;
  const persistedVoice =
    secondConfig.voice.speechEnabled === true &&
    JSON.stringify(secondConfig.voice) === JSON.stringify(firstConfig.voice);
  const persistedCharacterFile =
    secondConfig.characterFile === personaPath && secondConfig.characterFile === firstConfig.characterFile;
  const persistedPersonaContent =
    secondPersonaContent === firstPersonaContent && secondPersonaContent.includes(`name: ${personaName}`);
  const preservedHiddenTaskModel =
    secondConfig.provider.taskModels.planner === plannerModel &&
    secondConfig.provider.taskModels.planner === firstConfig.provider.taskModels.planner;
  const ok =
    initialSafeConfigCreated &&
    relaunchPrepareByteStable &&
    persistedProvider &&
    persistedVoice &&
    persistedCharacterFile &&
    persistedPersonaContent &&
    preservedHiddenTaskModel &&
    rendererSecretRedacted;

  if (!ok) {
    throw new Error(
      `Config relaunch checks failed: ${JSON.stringify({
        initialSafeConfigCreated,
        relaunchPrepareByteStable,
        persistedProvider,
        persistedVoice,
        persistedCharacterFile,
        persistedPersonaContent,
        preservedHiddenTaskModel,
        rendererSecretRedacted
      })}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ok,
        launchCount: 2,
        persistedProvider,
        persistedVoice,
        persistedCharacterFile,
        persistedPersonaContent,
        preservedHiddenTaskModel,
        rendererSecretRedacted,
        initialSafeConfigCreated,
        relaunchPrepareByteStable,
        artifacts: [firstArtifact, secondArtifact]
      },
      null,
      2
    )
  );
} finally {
  server.closeAllConnections?.();
  server.close();
  await rm(tempDir, { recursive: true, force: true });
}

interface DevLaunchEnvironment {
  GREYFIELD_CONFIG_PATH: string;
  GREYFIELD_USER_DATA_PATH: string;
  GREYFIELD_PROJECT_ROOT: string;
}

interface WindowArtifact {
  path: string;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

async function launchApp(launchEnv: DevLaunchEnvironment): Promise<ElectronApplication> {
  const output: string[] = [];
  const app = await electron.launch({
    cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")],
    env: {
      ...process.env,
      ...launchEnv
    }
  });
  app.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await app.firstWindow({ timeout: 10_000 });
  } catch (error) {
    const urls = app.windows().map((page) => page.url());
    const sanitizedOutput = redactSyntheticProviderKey(output.join(""), providerApiKey).slice(-4000);
    const sanitizedCause = redactSyntheticProviderKey(String(error), providerApiKey);
    await app.close().catch(() => undefined);
    throw new Error(
      `Timed out waiting for first Electron window; urls=${JSON.stringify(urls)}; output=${sanitizedOutput}; cause=${sanitizedCause}`
    );
  }
  return app;
}

async function openSettingsThroughControls(app: ElectronApplication): Promise<Page> {
  const controls = await waitForRoleWindow(app, "controls");
  await controls.getByRole("button", { name: /^(Open Settings|打开设置)$/ }).click();
  const settings = await waitForRoleWindow(app, "settings");
  const browserWindow = await app.browserWindow(settings);
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if (await browserWindow.evaluate((window) => window.isVisible())) {
      return settings;
    }
    await delay(100);
  }
  throw new Error("Settings BrowserWindow did not become visible through the ordinary controls entry");
}

async function openAdvancedSettingsSection(settings: Page, sectionName: RegExp): Promise<void> {
  const advanced = settings.getByRole("button", { name: /^(Advanced settings|高级设置)$/ });
  if ((await advanced.getAttribute("aria-expanded")) !== "true") {
    await advanced.click();
  }
  await settings.getByRole("button", { name: sectionName }).click();
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "controls" | "settings"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleName === "settings" ? ".greyfield-shell" : ".desktop-controls-shell");
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function captureWindowArtifact(
  app: ElectronApplication,
  page: Page,
  path: string
): Promise<WindowArtifact> {
  const browserWindow = await app.browserWindow(page);
  const visible = await browserWindow.evaluate((window) => window.isVisible());
  const bounds = await browserWindow.evaluate((window) => window.getBounds());
  await page.screenshot({ path, fullPage: true });
  return { path, visible, bounds };
}

async function waitForPersistedState(path: string, expected: ExpectedPersistedState): Promise<GreyfieldConfig> {
  const started = Date.now();
  let lastConfig: GreyfieldConfig | null = null;
  let lastPersona = "";
  while (Date.now() - started < 10_000) {
    try {
      lastConfig = JSON.parse(await readFile(path, "utf8")) as GreyfieldConfig;
      lastPersona = await readFile(expected.personaPath, "utf8");
      if (
        lastConfig.provider.llm === "openai-compatible" &&
        lastConfig.provider.baseUrl === expected.providerBaseUrl &&
        lastConfig.provider.apiKey === expected.providerApiKey &&
        lastConfig.provider.model === expected.providerModel &&
        lastConfig.provider.taskModels.planner === expected.plannerModel &&
        lastConfig.characterFile === expected.personaPath &&
        lastConfig.voice.speechEnabled === true &&
        lastPersona.includes(`name: ${expected.personaName}`)
      ) {
        return lastConfig;
      }
    } catch {
      // Settings writes may be in flight; retry until the complete state is visible.
    }
    await delay(100);
  }
  throw new Error(formatPersistedStateFailure(lastConfig, lastPersona, expected));
}

async function expectInputValue(locator: ReturnType<Page["locator"]>, expected: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const actual = await locator.inputValue().catch(() => "");
    if (actual === expected) {
      return;
    }
    await delay(100);
  }
  const actual = await locator.inputValue().catch(() => "");
  throw new Error(`Unexpected input value after relaunch; expected=${expected}; actual=${actual}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
