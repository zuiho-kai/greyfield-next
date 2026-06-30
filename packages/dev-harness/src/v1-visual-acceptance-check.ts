import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute, join, relative, resolve } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";
import { dispatchStageMove, findStagePoint, waitForStageHit } from "./electron-check-helpers";
import { resolveLive2DFixturePath } from "./live2d-fixture";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const visualAcceptanceArtifactRoot = resolve(workspaceRoot, ".cache", "greyfield-v1-visual-acceptance");

type Artifact = {
  name: string;
  path: string;
  review: string;
};

type VisualAcceptanceSummaryInput = {
  artifactDir: string;
  pet: {
    role: string | null;
    viewport: { width: number; height: number };
    bodyBackgroundColor: string;
    bodyBackgroundImage: string;
    hasControls: boolean;
    hasPetShell: boolean;
    hasGreyfieldApi: boolean;
  };
  controls: {
    role: string | null;
    viewport: { width: number; height: number };
    hasPanel: boolean;
    panelWithinViewport: boolean;
    draggable: boolean;
    activeButtonContrastOk: boolean;
  };
  stage: {
    modelPoint: { x: number; y: number };
    transparentPoint: { x: number; y: number };
    modelHitVerified: boolean;
    transparentHitVerified: boolean;
  };
  chat: {
    assistantReplyVisible: boolean;
    speechBubbleVisible: boolean;
    speechBubbleAvoidsModel: boolean;
    bubbleText: string;
  };
  settings: {
    providerPreviewVisible: boolean;
    memoryExtractionVisible: boolean;
    memoryExtractionToggleVisible: boolean;
    memoryExtractionManualCandidateControlsAbsent: boolean;
    settingsShellVisible: boolean;
    noHorizontalOverflow: boolean;
    narrowNoHorizontalOverflow: boolean;
    windowControlsUsable: boolean;
    viewportWidth: number;
    scrollWidth: number;
  };
  artifacts: Artifact[];
};

export type V1VisualAcceptanceSummary = VisualAcceptanceSummaryInput & {
  ok: true;
  generatedAt: string;
  visualReviewRequired: string[];
};

export function buildV1VisualAcceptanceSummary(input: VisualAcceptanceSummaryInput): V1VisualAcceptanceSummary {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    ...input,
    visualReviewRequired: [
      "Open pet-initial.png and confirm the pet surface is transparent, unframed, and separate from the controls window.",
      "Open controls-initial.png and confirm the desktop input bar is compact, draggable, and not a row of bulky text buttons.",
      "Open controls-active-state.png and confirm clicked controls keep visible icons instead of white-on-white blocks.",
      "Open pet-after-chat.png and confirm the speech bubble reads like a short subtitle and does not cover the model.",
      "Open chat-after-reply.png and confirm the full assistant reply stays in the Chat window.",
      "Open settings-provider-preview.png and confirm Settings reads like a product surface, not a debug console.",
      "Open settings-memory-extraction.png and confirm Better memory is a normal toggle/status section without Accept/Reject candidate review controls.",
      "Open settings-window-controls.png and confirm Window scale/position controls are readable and not collapsed."
    ]
  };
}

export function resolveV1VisualAcceptanceArtifactDir(input = process.env.GREYFIELD_ACCEPTANCE_ARTIFACT_DIR): string {
  const requested = input?.trim();
  if (!requested) {
    return join(visualAcceptanceArtifactRoot, "latest");
  }

  const artifactDir = resolve(requested);
  const rootRelativePath = relative(visualAcceptanceArtifactRoot, artifactDir);
  if (rootRelativePath === "" || rootRelativePath.startsWith("..") || isAbsolute(rootRelativePath)) {
    throw new Error(
      `GREYFIELD_ACCEPTANCE_ARTIFACT_DIR must be a child of ${visualAcceptanceArtifactRoot}; got ${artifactDir}`
    );
  }

  return artifactDir;
}

export async function runV1VisualAcceptanceCheck(): Promise<V1VisualAcceptanceSummary> {
  const artifactDir = resolveV1VisualAcceptanceArtifactDir();
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const tempDir = await mkdtemp(join(tmpdir(), "greyfield-v1-visual-"));
  const configPath = join(tempDir, "greyfield.config.json");
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...defaultGreyfieldConfig,
        live2d: {
          ...defaultGreyfieldConfig.live2d,
          modelPath: pathToFileURL(resolveLive2DFixturePath()).href
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const app = await launchApp(tempDir, configPath);
  try {
    const petWindow = await waitForRoleWindow(app, "pet");
    await petWindow.waitForSelector('.pet-shell .live2d-stage-view[data-stage-mode="live2d"] canvas.live2d-stage-canvas');
    await waitForPaintedStage(petWindow);

    const pet = await readPetSnapshot(petWindow);
    if (
      pet.role !== "pet" ||
      pet.hasControls ||
      !pet.hasPetShell ||
      !pet.hasGreyfieldApi
    ) {
      throw new Error(`Pet window did not render the expected desktop-pet shell: ${JSON.stringify(pet)}`);
    }
    if (pet.bodyBackgroundColor !== "rgba(0, 0, 0, 0)" || pet.bodyBackgroundImage !== "none") {
      throw new Error(`Pet window is not transparent: ${JSON.stringify(pet)}`);
    }

    const modelPoint = await waitForStagePoint(petWindow, true);
    const transparentPoint = await waitForStagePoint(petWindow, false);
    await petWindow.evaluate(() =>
      window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
    );
    await dispatchStageMove(petWindow, modelPoint);
    await waitForStageHit(petWindow, true, modelPoint);
    await dispatchStageMove(petWindow, transparentPoint);
    await waitForStageHit(petWindow, false, transparentPoint);

    const controlsWindow = await waitForRoleWindow(app, "controls");
    await controlsWindow.waitForSelector(".desktop-control-panel");
    const controls = await readControlsSnapshot(controlsWindow);
    controls.draggable = await dragDesktopControls(app, controlsWindow);
    if (controls.role !== "controls" || !controls.hasPanel || !controls.panelWithinViewport || !controls.draggable) {
      throw new Error(`Desktop controls did not render the expected draggable panel: ${JSON.stringify(controls)}`);
    }

    const artifacts: Artifact[] = [];
    artifacts.push(await screenshot(petWindow, artifactDir, "pet-initial.png", "Transparent pet shell and model surface."));
    artifacts.push(await screenshot(controlsWindow, artifactDir, "controls-initial.png", "Draggable desktop input controls."));
    const activeButtonProbe = await verifyActiveControlContrast(controlsWindow);
    controls.activeButtonContrastOk = activeButtonProbe.ok;
    if (!controls.activeButtonContrastOk) {
      throw new Error(
        `Desktop controls active/hover button state lost icon contrast: ${JSON.stringify({
          controls,
          activeButtonProbe
        })}`
      );
    }
    artifacts.push(await screenshot(controlsWindow, artifactDir, "controls-active-state.png", "Active desktop controls button state."));
    await controlsWindow.getByRole("button", { name: /^(Turn voice output off|关闭语音输出)$/ }).click();

    const chatWindow = await waitForRoleWindow(app, "chat");
    await chatWindow.waitForSelector(".chat-shell");
    await chatWindow.getByTestId("chat-message-input").fill("验收一下桌宠前端。");
    await chatWindow.getByTestId("chat-send-button").click();
    await chatWindow.locator(".message-list .assistant", { hasText: "你好，我醒着。现在可以继续做桌宠了。" }).waitFor();
    await petWindow.locator(".speech-bubble").waitFor({ state: "visible" });
    const bubbleText = await petWindow.locator(".speech-bubble").textContent();
    const bubbleProbe = await waitForSpeechBubbleModelClear(petWindow);
    artifacts.push(await screenshot(petWindow, artifactDir, "pet-after-chat.png", "Pet bubble after a fake chat reply."));
    artifacts.push(await screenshot(chatWindow, artifactDir, "chat-after-reply.png", "Chat keeps the complete assistant reply."));

    await app.evaluate(({ BrowserWindow }) => {
      for (const browserWindow of BrowserWindow.getAllWindows()) {
        browserWindow.show();
      }
    });
    const settingsWindow = await waitForRoleWindow(app, "settings");
    await settingsWindow.waitForSelector(".greyfield-shell");
    await settingsWindow.locator(".provider-status--preview", { hasText: /Fake provider is active|本地假服务/ }).waitFor();
    const settingsLayout = await readSettingsLayout(settingsWindow);
    if (!settingsLayout.noHorizontalOverflow || !settingsLayout.windowControlsUsable) {
      throw new Error(`Settings window has horizontal overflow: ${JSON.stringify(settingsLayout)}`);
    }
    if (
      !settingsLayout.memoryExtractionVisible ||
      !settingsLayout.memoryExtractionToggleVisible ||
      !settingsLayout.memoryExtractionManualCandidateControlsAbsent
    ) {
      throw new Error(`Settings Memory extraction section is incomplete: ${JSON.stringify(settingsLayout)}`);
    }
    await resizeElectronWindow(app, "settings", 520, 620);
    await settingsWindow.waitForTimeout(100);
    const narrowSettingsLayout = await readSettingsLayout(settingsWindow);
    if (!narrowSettingsLayout.noHorizontalOverflow || !narrowSettingsLayout.windowControlsUsable) {
      throw new Error(`Settings window breaks in narrow layout: ${JSON.stringify(narrowSettingsLayout)}`);
    }
    const finalSettingsLayout = {
      ...narrowSettingsLayout,
      narrowNoHorizontalOverflow: narrowSettingsLayout.noHorizontalOverflow
    };
    artifacts.push(
      await screenshot(settingsWindow, artifactDir, "settings-provider-preview.png", "Settings provider preview state.")
    );
    await settingsWindow.getByLabel(/^(Memory extraction|记忆提取)$/, { exact: true }).scrollIntoViewIfNeeded();
    artifacts.push(
      await screenshot(settingsWindow, artifactDir, "settings-memory-extraction.png", "Settings Memory extraction section.")
    );
    await settingsWindow.getByLabel(/^(Scale|缩放)$/).scrollIntoViewIfNeeded();
    artifacts.push(
      await screenshot(settingsWindow, artifactDir, "settings-window-controls.png", "Settings Window controls.")
    );

    const summary = buildV1VisualAcceptanceSummary({
      artifactDir,
      pet,
      controls,
      stage: {
        modelPoint: roundPoint(modelPoint),
        transparentPoint: roundPoint(transparentPoint),
        modelHitVerified: true,
        transparentHitVerified: true
      },
      chat: {
        assistantReplyVisible: true,
        speechBubbleVisible: true,
        speechBubbleAvoidsModel: !bubbleProbe.overlapsModel,
        bubbleText: bubbleText?.trim() ?? ""
      },
      settings: {
        ...finalSettingsLayout
      },
      artifacts
    });

    const summaryPath = join(artifactDir, "summary.json");
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
    return summary;
  } finally {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function launchApp(tempDir: string, configPath: string): Promise<ElectronApplication> {
  const output: string[] = [];
  const executablePath = await getElectronExecutablePath(desktopRoot);
  const app = await electron.launch({
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
  app.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await app.firstWindow({ timeout: 10_000 });
  } catch (error) {
    const urls = app.windows().map((page) => page.url());
    const spawnargs = app.process().spawnargs;
    await app.close().catch(() => undefined);
    throw new Error(
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(
        urls
      )}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
  return app;
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat" | "controls"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function waitForPaintedStage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvases = Array.from(
      document.querySelectorAll<HTMLCanvasElement>("canvas.live2d-stage-canvas, canvas.fallback-stage-canvas")
    );
    for (const canvas of canvases) {
      if (canvas.width === 0 || canvas.height === 0) {
        continue;
      }
      const context = canvas.getContext("2d");
      if (context) {
        const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < image.length; index += 4) {
          if (image[index] > 0) {
            return true;
          }
        }
        continue;
      }
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) {
        continue;
      }
      const image = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
      for (let index = 3; index < image.length; index += 4) {
        if (image[index] > 0) {
          return true;
        }
      }
    }
    return false;
  });
}

async function waitForStagePoint(page: Page, hit: boolean): Promise<{ x: number; y: number }> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < 8_000) {
    try {
      return await findStagePoint(page, hit);
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${hit ? "model" : "transparent"} stage point`);
}

async function readPetSnapshot(page: Page): Promise<VisualAcceptanceSummaryInput["pet"]> {
  return page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    return {
      role: new URLSearchParams(window.location.search).get("window"),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyBackgroundImage: bodyStyle.backgroundImage,
      hasControls: document.querySelector(".control-surface") !== null,
      hasPetShell: document.querySelector(".pet-shell") !== null,
      hasGreyfieldApi: typeof window.greyfield?.send === "function"
    };
  });
}

async function readSpeechBubbleModelOverlap(page: Page): Promise<{
  visible: boolean;
  overlapsModel: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  overlappingPoints: Array<{ x: number; y: number }>;
}> {
  return page.evaluate(() => {
    const bubble = document.querySelector<HTMLElement>(".speech-bubble");
    if (!bubble) {
      return { visible: false, overlapsModel: false, overlappingPoints: [] };
    }
    const rect = bubble.getBoundingClientRect();
    const sampler = (
      window as typeof window & {
        __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean };
      }
    ).__greyfieldStageSmoke?.sampleModelHit;
    if (!sampler) {
      return {
        visible: true,
        overlapsModel: false,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        overlappingPoints: []
      };
    }

    const overlappingPoints: Array<{ x: number; y: number }> = [];
    const inset = 8;
    const columns = 5;
    const rows = 3;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = rect.left + inset + ((rect.width - inset * 2) * column) / Math.max(1, columns - 1);
        const y = rect.top + inset + ((rect.height - inset * 2) * row) / Math.max(1, rows - 1);
        if (sampler(x, y)) {
          overlappingPoints.push({ x: Math.round(x), y: Math.round(y) });
        }
      }
    }

    return {
      visible: true,
      overlapsModel: overlappingPoints.length > 0,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      overlappingPoints
    };
  });
}

async function waitForSpeechBubbleModelClear(page: Page): Promise<{
  visible: boolean;
  overlapsModel: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  overlappingPoints: Array<{ x: number; y: number }>;
}> {
  const started = Date.now();
  let lastProbe: Awaited<ReturnType<typeof readSpeechBubbleModelOverlap>> | undefined;
  while (Date.now() - started < 3_000) {
    lastProbe = await readSpeechBubbleModelOverlap(page);
    if (lastProbe.visible && !lastProbe.overlapsModel) {
      return lastProbe;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Speech bubble was not visible and clear of the model surface: ${JSON.stringify(lastProbe)}`);
}

async function readControlsSnapshot(page: Page): Promise<VisualAcceptanceSummaryInput["controls"]> {
  return page.evaluate(() => {
    const panel = document.querySelector(".desktop-control-panel");
    const rect = panel?.getBoundingClientRect();
    return {
      role: new URLSearchParams(window.location.search).get("window"),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      hasPanel: panel !== null,
      panelWithinViewport: rect
        ? rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight
        : false,
      draggable: false,
      activeButtonContrastOk: false
    };
  });
}

async function verifyActiveControlContrast(page: Page): Promise<{
  ok: boolean;
  color?: string;
  backgroundColor?: string;
  contrast?: number;
  className?: string;
  icon?: { width: number; height: number };
}> {
  const voiceButton = page.getByRole("button", { name: /^(Turn voice output on|开启语音输出)$/ });
  await voiceButton.click();
  await page.getByRole("button", { name: /^(Turn voice output off|关闭语音输出)$/ }).waitFor();
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const activeButton = document.querySelector<HTMLButtonElement>(".desktop-control-button--active");
    if (!activeButton) {
      return { ok: false };
    }
    const rect = activeButton.getBoundingClientRect();
    activeButton.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    );
    const style = getComputedStyle(activeButton);
    const color = parseRgb(style.color);
    const background = parseRgb(style.backgroundColor);
    if (!color || !background) {
      return {
        ok: false,
        color: style.color,
        backgroundColor: style.backgroundColor,
        className: activeButton.className
      };
    }
    const contrast = contrastRatio(color, background);
    const icon = activeButton.querySelector("svg");
    const iconRect = icon?.getBoundingClientRect();
    return {
      ok: contrast >= 3 && Boolean(iconRect && iconRect.width >= 12 && iconRect.height >= 12),
      color: style.color,
      backgroundColor: style.backgroundColor,
      contrast,
      className: activeButton.className,
      icon: iconRect ? { width: iconRect.width, height: iconRect.height } : undefined
    };

    function parseRgb(value: string): [number, number, number] | null {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) {
        return null;
      }
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    }

    function luminance(rgb: [number, number, number]): number {
      const [red, green, blue] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }
  });
}

async function dragDesktopControls(app: ElectronApplication, page: Page): Promise<boolean> {
  const before = await readRoleWindowBounds(app, "controls");
  const handle = page.locator(".desktop-control-handle");
  const handleBox = await handle.boundingBox();
  if (!before || !handleBox) {
    return false;
  }

  const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 72, start.y - 28, { steps: 6 });
  await page.mouse.up();
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    const after = await readRoleWindowBounds(app, "controls");
    if (after && (Math.abs(after.x - before.x) >= 20 || Math.abs(after.y - before.y) >= 20)) {
      return after.width === before.width && after.height === before.height;
    }
    await delay(100);
  }
  return false;
}

async function readRoleWindowBounds(
  app: ElectronApplication,
  roleName: "pet" | "settings" | "chat" | "controls"
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return app.evaluate(
    ({ BrowserWindow }, targetRole) => {
      const window = BrowserWindow.getAllWindows().find((browserWindow) =>
        browserWindow.webContents.getURL().includes(`window=${targetRole}`)
      );
      return window?.getBounds() ?? null;
    },
    roleName
  );
}

async function readSettingsLayout(page: Page): Promise<VisualAcceptanceSummaryInput["settings"]> {
  return page.evaluate(() => {
    const scrollWidth = document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth;
    const compactInputs = Array.from(document.querySelectorAll<HTMLInputElement>(".settings-fields--compact input"));
    const memorySection = document.querySelector<HTMLElement>('[aria-label="Memory extraction"], [aria-label="记忆提取"]');
    const memoryText = memorySection?.textContent ?? "";
    const windowControlsUsable =
      compactInputs.length >= 4 &&
      compactInputs.every((input) => {
        const label = input.closest("label");
        if (!label) {
          return false;
        }
        const labelRect = label.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        return (
          inputRect.width >= 18 &&
          inputRect.height >= 18 &&
          inputRect.left >= labelRect.left - 1 &&
          inputRect.right <= labelRect.right + 1 &&
          inputRect.top >= labelRect.top - 1 &&
          inputRect.bottom <= labelRect.bottom + 1
        );
      });
    return {
      providerPreviewVisible: document.querySelector(".provider-status--preview") !== null,
      memoryExtractionVisible: memorySection !== null,
      memoryExtractionToggleVisible:
        memorySection?.querySelector('input[aria-label="Better memory extraction"], input[aria-label="增强记忆提取"]') != null,
      memoryExtractionManualCandidateControlsAbsent: !/\b(accept|reject|candidate|pending)\b/i.test(memoryText),
      settingsShellVisible: document.querySelector(".greyfield-shell") !== null,
      viewportWidth: window.innerWidth,
      scrollWidth,
      noHorizontalOverflow: scrollWidth <= window.innerWidth,
      narrowNoHorizontalOverflow: scrollWidth <= window.innerWidth,
      windowControlsUsable
    };
  });
}

async function resizeElectronWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat", width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const target = BrowserWindow.getAllWindows().find((browserWindow) =>
        browserWindow.webContents.getURL().includes(`window=${payload.roleName}`)
      );
      target?.setSize(payload.width, payload.height);
    },
    { roleName, width, height }
  );
}

async function screenshot(page: Page, artifactDir: string, name: string, review: string): Promise<Artifact> {
  const path = join(artifactDir, name);
  await page.screenshot({ path });
  return { name, path, review };
}

function roundPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await runV1VisualAcceptanceCheck();
}
