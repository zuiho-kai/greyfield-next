import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { MemoryAtom } from "@greyfield/core-runtime";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const artifactDir = join(workspaceRoot, ".cache", "greyfield-visual-observation", "latest");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-visual-observation-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const atomPath = join(tempDir, "memory", "atoms.jsonl");
const fakeScreenshotDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA0lW1TAAAAHklEQVR42mP8z8AARLJgwoIFDBgYGBj+M8B8AAAp+gIGKq+qVwAAAABJRU5ErkJggg==";
const chatScreenshotPath = join(artifactDir, "chat-visual-observation.png");
const settingsSourcePath = join(artifactDir, "memory-source-observation.png");
const summaryPath = join(artifactDir, "summary.json");
const failureScreenshotPath = join(artifactDir, "failure-chat.png");
const summary: Record<string, unknown> = {
  ok: false,
  artifacts: {
    chatScreenshotPath,
    settingsSourcePath,
    failureScreenshotPath,
    summaryPath
  }
};

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "fake",
        tts: "fake"
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

let app: ElectronApplication | undefined;
try {
  app = await launchApp();
  const chat = await waitForRoleWindow(app, "chat");
  const settings = await waitForRoleWindow(app, "settings");
  summary.windowsReady = true;

  await chat.getByRole("button", { name: "Capture one screenshot" }).click();
  await chat.locator(".observation-preview-strip img").first().waitFor({ timeout: 10_000 });
  await chat.getByText("Screenshot ready", { exact: false }).waitFor();
  summary.singleScreenshotReady = true;
  await sendMessage(chat, "看一下这个画面，并回答你看到了什么。");
  await chat.locator(".message-list .assistant:not(.draft)", { hasText: "临时观察" }).waitFor({ timeout: 10_000 });
  await chat.getByText("Used 1 temporary screenshot for this reply.").waitFor();
  summary.singleScreenshotQuestionPath = true;

  await chat.getByRole("button", { name: "Observe slowly" }).click();
  await chat.getByRole("button", { name: "Stop observation" }).click();
  await chat.getByText(/Observation stopped|Observation ready/u).waitFor({ timeout: 10_000 });
  await chat.getByRole("button", { name: "Delete temporary observation" }).click();
  if ((await chat.locator(".observation-preview-strip img").count()) !== 0) {
    throw new Error("Delete did not remove temporary observation previews.");
  }
  summary.lowFrequencyStopDeletePath = true;

  await chat.getByRole("button", { name: "High frequency observation" }).click();
  await chat.getByText("Click High again to start").waitFor();
  await chat.getByRole("button", { name: "High frequency observation" }).click();
  await chat.getByText(/High frequency observation is short-lived/u).waitFor();
  await chat.locator(".observation-preview-strip img").first().waitFor({ timeout: 10_000 });
  await chat.getByRole("button", { name: "Stop observation" }).click();
  await chat.getByText(/Observation stopped|Observation ready/u).waitFor({ timeout: 10_000 });
  summary.highFrequencyConfirmedAndStopped = true;
  await sendMessage(chat, "从这次观察问答中确认：记住我常玩的游戏是 Honkai Star Rail。");
  await chat.locator(".message-list .assistant:not(.draft)", { hasText: "临时观察" }).last().waitFor({ timeout: 10_000 });
  await chat.getByText(/Used \d+ temporary observation frames?/u).waitFor();
  await waitForAtomText("Honkai Star Rail");
  summary.observationQuestionWroteDurableFact = true;

  await settings.bringToFront();
  await refreshMemory(settings);
  const memoryLibrary = settings.locator('[data-harness="settings-memory-library"]');
  await memoryLibrary.waitFor();
  const atomCard = memoryLibrary.locator('[data-harness="memory-atom-card"]', { hasText: "Honkai Star Rail" });
  await atomCard.waitFor({ timeout: 10_000 });
  await atomCard.locator('[data-harness="memory-source-open"]').click();
  const source = memoryLibrary.locator('[data-harness="memory-source-drilldown"]');
  await source.waitFor();
  await source.getByText("Source: user-confirmed screenshot/observation Q&A").waitFor();
  await source.getByText("Honkai Star Rail").first().waitFor();
  await source.scrollIntoViewIfNeeded();
  summary.sourceExplainsUserConfirmedObservation = true;

  await captureElectronWindow(app, "chat", chatScreenshotPath);
  await captureElectronWindow(app, "settings", settingsSourcePath);
  summary.chatScreenshotPath = chatScreenshotPath;
  summary.settingsSourcePath = settingsSourcePath;

  const sessionRaw = await readFile(sessionPath, "utf8");
  const atomRaw = await readFile(atomPath, "utf8");
  for (const [label, text] of [
    ["session", sessionRaw],
    ["atom memory", atomRaw]
  ] as const) {
    if (text.includes("data:image") || text.includes(fakeScreenshotDataUrl) || text.includes("frame-1")) {
      throw new Error(`${label} persisted raw screenshot/frame data: ${text}`);
    }
  }
  const atoms = atomRaw
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryAtom);

  Object.assign(summary, {
    ok: true,
    rawScreenshotExcludedFromSessionAndMemory: true,
    atomIds: atoms.map((atom) => atom.id)
  });
  await writeSummary();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.ok = false;
  summary.error = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  try {
    const chat = app ? await findRoleWindow(app, "chat") : undefined;
    if (app && chat) {
      await captureElectronWindow(app, "chat", failureScreenshotPath);
    }
    summary.failureScreenshotPath = failureScreenshotPath;
  } catch (screenshotError) {
    summary.failureScreenshotError = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
  }
  await writeSummary();
  console.error(JSON.stringify(summary, null, 2));
  throw error;
} finally {
  await app?.close().catch(() => undefined);
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
      GREYFIELD_USER_DATA_PATH: tempDir,
      GREYFIELD_FAKE_SCREENSHOT_DATA_URL: fakeScreenshotDataUrl
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
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function findRoleWindow(app: ElectronApplication, roleName: "settings" | "chat"): Promise<Page | undefined> {
  for (const page of app.windows()) {
    const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
    if (role === roleName) {
      return page;
    }
  }
  return undefined;
}

async function captureElectronWindow(
  app: ElectronApplication,
  roleName: "settings" | "chat",
  path: string
): Promise<void> {
  const pngBase64 = await app.evaluate(async ({ BrowserWindow }, roleName) => {
    const target = BrowserWindow.getAllWindows().find((browserWindow) =>
      browserWindow.webContents.getURL().includes(`window=${roleName}`)
    );
    if (!target) {
      throw new Error(`Missing ${roleName} BrowserWindow for capturePage`);
    }
    if (!target.isVisible()) {
      target.show();
    }
    target.focus();
    const image = await target.capturePage();
    return image.toPNG().toString("base64");
  }, roleName);
  await writeFile(path, Buffer.from(pngBase64, "base64"));
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function waitForAtomText(fragment: string): Promise<void> {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 10_000) {
    last = await readFile(atomPath, "utf8").catch(() => "");
    if (last.includes(fragment)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for observation-confirmed memory atom: ${last}`);
}

async function refreshMemory(settings: Page): Promise<void> {
  await settings.locator('[data-harness="memory-refresh"]').click();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeSummary(): Promise<void> {
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
