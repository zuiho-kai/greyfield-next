import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";
import { findStagePointOutsideRects, waitForSpeechBubble } from "./electron-check-helpers";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BubbleState extends Rect {
  text: string;
  className: string;
  viewportWidth: number;
  viewportHeight: number;
  screenX: number;
  screenY: number;
  screenRight: number;
  screenBottom: number;
}

interface ShapeSample {
  rects: Rect[];
  bounds: Rect;
  createdAt: number;
}

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-bubble-edge-clickthrough", "latest");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-bubble-edge-clickthrough-"));
const configPath = join(tempDir, "greyfield.config.json");

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await writeFile(configPath, `${JSON.stringify(defaultGreyfieldConfig, null, 2)}\n`, "utf8");

try {
  const app = await launchApp();
  try {
    const petWindow = await waitForRoleWindow(app, "pet");
    const chatWindow = await waitForRoleWindow(app, "chat");
    await petWindow.waitForSelector(".pet-shell canvas.live2d-stage-canvas, .pet-shell canvas.fallback-stage-canvas");
    await waitForPaintedStage(petWindow);
    const edgePlacement = await movePetWindowToRightEdge(app);
    await petWindow.waitForFunction((expectedX) => Math.abs(window.screenX - expectedX) <= 2, edgePlacement.bounds.x);
    await installShapeRecorder(app);

    await chatWindow.getByLabel("Message").fill("请用一句话确认桌宠气泡。");
    await chatWindow.getByRole("button", { name: "Send" }).click();
    await petWindow.locator(".speech-bubble").waitFor({ timeout: 10_000 });

    const bubble = await readBubbleState(petWindow);
    assertBubbleInsideViewport(bubble);
    assertBubbleInsideScreen(bubble, edgePlacement.workArea);
    if (!bubble.className.includes("speech-bubble--left")) {
      throw new Error(`Speech bubble did not flip away from the right edge: ${JSON.stringify(bubble)}`);
    }

    const shapeWithBubble = await waitForShapeSample(
      app,
      (sample) => hasStandaloneBubbleRect(sample, bubble),
      "native shape containing the speech bubble"
    );
    const transparentPoint = await findStagePointOutsideRects(petWindow, false, shapeWithBubble.rects);
    if (pointInRects(transparentPoint, shapeWithBubble.rects)) {
      throw new Error(
        `Transparent probe is still inside the native shape: point=${JSON.stringify(transparentPoint)}, shape=${JSON.stringify(
          shapeWithBubble
        )}`
      );
    }
    const bubbleOnScreenshot = join(artifactDir, "bubble-near-right-edge.png");
    await petWindow.screenshot({ path: bubbleOnScreenshot });

    await petWindow.evaluate(() => window.greyfield?.send("settings:update", { ui: { speechBubbleEnabled: false } }));
    await waitForSpeechBubble(configPath, false);
    await petWindow.locator(".speech-bubble").waitFor({ state: "detached", timeout: 5_000 });
    const shapeWithoutBubble = await waitForShapeSample(
      app,
      (sample) => !hasStandaloneBubbleRect(sample, bubble),
      "native shape after speech bubble is disabled"
    );
    const disabledProbePoint = findPointInsideFirstOutsideSecond(bubble, shapeWithBubble.rects, shapeWithoutBubble.rects);
    if (!disabledProbePoint) {
      throw new Error(
        `Could not find a speech-bubble-only probe point; before=${JSON.stringify(shapeWithBubble)}, after=${JSON.stringify(
          shapeWithoutBubble
        )}, bubble=${JSON.stringify(bubble)}`
      );
    }
    const bubbleOffScreenshot = join(artifactDir, "bubble-disabled.png");
    await petWindow.screenshot({ path: bubbleOffScreenshot });

    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactDir,
          edgePlacement,
          bubble: {
            x: bubble.x,
            y: bubble.y,
            width: bubble.width,
            height: bubble.height,
            className: bubble.className,
            text: bubble.text
          },
          bubbleInsideViewport: true,
          bubbleInsideScreen: true,
          nativeShapeIncludedBubble: true,
          bubbleToggleRemovedNativeShape: true,
          transparentPointOutsideNativeShape: true,
          transparentPoint: roundPoint(transparentPoint),
          disabledProbePoint: roundPoint(disabledProbePoint),
          artifacts: [
            { name: "bubble-near-right-edge.png", path: bubbleOnScreenshot },
            { name: "bubble-disabled.png", path: bubbleOffScreenshot }
          ]
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function launchApp(): Promise<ElectronApplication> {
  const output: string[] = [];
  const executablePath = await getElectronExecutablePath(desktopRoot);
  const app = await electron.launch({
    executablePath,
    cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")],
    env: {
      ...process.env,
      GREYFIELD_CONFIG_PATH: configPath,
      GREYFIELD_ENABLE_NATIVE_SHAPE: "1",
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "chat"): Promise<Page> {
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

async function movePetWindowToRightEdge(app: ElectronApplication): Promise<{
  bounds: Rect;
  workArea: Rect;
}> {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const petWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=pet"));
    if (!petWindow) {
      throw new Error("Missing pet window");
    }
    const workArea = screen.getDisplayMatching(petWindow.getBounds()).workArea;
    const current = petWindow.getBounds();
    petWindow.setBounds({
      x: workArea.x + workArea.width - current.width + 4,
      y: Math.max(workArea.y, Math.min(current.y, workArea.y + workArea.height - current.height)),
      width: current.width,
      height: current.height
    });
    return { bounds: petWindow.getBounds(), workArea };
  });
}

async function installShapeRecorder(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const petWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=pet"));
    if (!petWindow) {
      throw new Error("Missing pet window");
    }
    const globalWithShapeLog = globalThis as typeof globalThis & { __greyfieldShapeLog?: ShapeSample[] };
    globalWithShapeLog.__greyfieldShapeLog = [];
    const originalSetShape = petWindow.setShape.bind(petWindow);
    petWindow.setShape = (rects) => {
      globalWithShapeLog.__greyfieldShapeLog?.push({
        rects: rects.map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })),
        bounds: petWindow.getBounds(),
        createdAt: Date.now()
      });
      return originalSetShape(rects);
    };
  });
}

async function waitForShapeSample(
  app: ElectronApplication,
  predicate: (sample: ShapeSample) => boolean,
  label: string
): Promise<ShapeSample> {
  const started = Date.now();
  let lastSamples: ShapeSample[] = [];
  while (Date.now() - started < 5_000) {
    const samples = await app.evaluate(() => {
      return ((globalThis as typeof globalThis & { __greyfieldShapeLog?: ShapeSample[] }).__greyfieldShapeLog ?? []).map(
        (sample) => ({
          rects: sample.rects,
          bounds: sample.bounds,
          createdAt: sample.createdAt
        })
      );
    });
    lastSamples = samples;
    for (const sample of [...samples].reverse()) {
      if (predicate(sample)) {
        return sample;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}; lastSamples=${JSON.stringify(lastSamples)}`);
}

async function readBubbleState(page: Page): Promise<BubbleState> {
  return page.locator(".speech-bubble").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent?.trim() ?? "",
      className: String(element.className),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      screenX: Math.round(window.screenX + rect.x),
      screenY: Math.round(window.screenY + rect.y),
      screenRight: Math.round(window.screenX + rect.x + rect.width),
      screenBottom: Math.round(window.screenY + rect.y + rect.height)
    };
  });
}

function assertBubbleInsideViewport(bubble: BubbleState): void {
  if (
    bubble.x < 0 ||
    bubble.y < 0 ||
    bubble.x + bubble.width > bubble.viewportWidth ||
    bubble.y + bubble.height > bubble.viewportHeight
  ) {
    throw new Error(`Speech bubble escaped the pet viewport: ${JSON.stringify(bubble)}`);
  }
}

function assertBubbleInsideScreen(bubble: BubbleState, workArea: Rect): void {
  if (
    bubble.screenX < workArea.x ||
    bubble.screenY < workArea.y ||
    bubble.screenRight > workArea.x + workArea.width ||
    bubble.screenBottom > workArea.y + workArea.height
  ) {
    throw new Error(`Speech bubble escaped the screen work area: bubble=${JSON.stringify(bubble)}, workArea=${JSON.stringify(workArea)}`);
  }
}

function hasStandaloneBubbleRect(sample: ShapeSample, bubble: BubbleState): boolean {
  const bubbleArea = bubble.width * bubble.height;
  return sample.rects.some((rect) => intersectionArea(rect, bubble) >= bubbleArea * 0.7);
}

function intersectionArea(left: Rect, right: Rect): number {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const farX = Math.min(left.x + left.width, right.x + right.width);
  const farY = Math.min(left.y + left.height, right.y + right.height);
  return Math.max(0, farX - x) * Math.max(0, farY - y);
}

function findPointInsideFirstOutsideSecond(bubble: Rect, first: Rect[], second: Rect[]): { x: number; y: number } | null {
  for (let y = bubble.y + 8; y < bubble.y + bubble.height - 8; y += 8) {
    for (let x = bubble.x + 8; x < bubble.x + bubble.width - 8; x += 8) {
      const point = { x, y };
      if (pointInRects(point, first) && !pointInRects(point, second)) {
        return point;
      }
    }
  }
  return null;
}

function pointInRects(point: { x: number; y: number }, rects: Rect[]): boolean {
  return rects.some((rect) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
}

function roundPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
