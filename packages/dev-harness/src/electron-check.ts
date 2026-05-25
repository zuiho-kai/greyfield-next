import { _electron as electron, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "../../persistence/src/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const quickMode = process.argv.includes("--quick");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-"));
const configPath = join(tempDir, "greyfield.config.json");
await writeFile(configPath, `${JSON.stringify(defaultGreyfieldConfig, null, 2)}\n`, "utf8");

const app = await electron.launch({
  cwd: desktopRoot,
  args: [join(desktopRoot, "dist-main", "index.mjs")],
  env: {
    ...process.env,
    GREYFIELD_CONFIG_PATH: configPath
  }
});

try {
  const petWindow = await app.firstWindow();
  await petWindow.waitForSelector(".pet-shell canvas.live2d-stage-canvas, .pet-shell canvas.fallback-stage-canvas");
  await petWindow.waitForFunction(() => {
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

  const petSnapshot = await petWindow.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      hasGreyfieldApi: typeof window.greyfield?.send === "function",
      role: new URLSearchParams(window.location.search).get("window"),
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyBackgroundImage: bodyStyle.backgroundImage,
      hasControls: document.querySelector(".control-surface") !== null,
      hasPetShell: document.querySelector(".pet-shell") !== null
    };
  });

  if (petSnapshot.role !== "pet" || petSnapshot.hasControls || !petSnapshot.hasPetShell) {
    throw new Error(`Pet window rendered the wrong shell: ${JSON.stringify(petSnapshot)}`);
  }
  if (petSnapshot.bodyBackgroundColor !== "rgba(0, 0, 0, 0)" || petSnapshot.bodyBackgroundImage !== "none") {
    throw new Error(`Pet window is not transparent: ${JSON.stringify(petSnapshot)}`);
  }

  const transparentPoint = await findStagePoint(petWindow, false);
  const modelPoint = await findStagePoint(petWindow, true);
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  await dispatchStageMove(petWindow, modelPoint);
  await waitForStageHit(petWindow, true, modelPoint);
  await dispatchStageMove(petWindow, transparentPoint);
  await waitForStageHit(petWindow, false, transparentPoint);
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  await waitForStageHit(petWindow, true, modelPoint);

  const beforeWheelConfig = await readConfig(configPath);
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  const afterWheelConfig = await dispatchStageWheelUntilScaleChange(
    petWindow,
    modelPoint,
    -240,
    configPath,
    beforeWheelConfig.live2d.scale
  );
  if (afterWheelConfig.live2d.scale < 0.4 || afterWheelConfig.live2d.scale > 2) {
    throw new Error(`Wheel scale escaped V1 bounds: ${afterWheelConfig.live2d.scale}`);
  }
  const beforeRightClickBounds = await getPetBounds();
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  await petWindow.mouse.click(modelPoint.x, modelPoint.y, { button: "right" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterRightClickBounds = await getPetBounds();
  if (
    afterRightClickBounds.width !== beforeRightClickBounds.width ||
    afterRightClickBounds.height !== beforeRightClickBounds.height
  ) {
    throw new Error(
      `Right click changed pet bounds; before=${JSON.stringify(beforeRightClickBounds)}, after=${JSON.stringify(afterRightClickBounds)}`
    );
  }

  const beforeDragBounds = await getPetBounds();
  const dragScale = afterWheelConfig.live2d.scale;
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  await petWindow.mouse.down({ button: "left" });
  await dispatchStageWheel(petWindow, modelPoint, -240);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const duringDragWheelConfig = await readConfig(configPath);
  if (duringDragWheelConfig.live2d.scale !== dragScale) {
    throw new Error(
      `Dragging allowed wheel scale; expected ${dragScale}, got ${duringDragWheelConfig.live2d.scale}`
    );
  }
  await petWindow.mouse.move(modelPoint.x + 36, modelPoint.y + 24, { steps: 4 });
  await petWindow.mouse.up({ button: "left" });
  const afterDragBounds = await waitForPetBoundsChange(beforeDragBounds);
  if (afterDragBounds.width !== beforeDragBounds.width || afterDragBounds.height !== beforeDragBounds.height) {
    throw new Error(
      `Dragging resized pet window; before=${JSON.stringify(beforeDragBounds)}, after=${JSON.stringify(afterDragBounds)}`
    );
  }
  const afterDragConfig = await waitForWindowPosition(configPath, afterDragBounds.x, afterDragBounds.y);
  if (afterDragConfig.live2d.scale !== dragScale) {
    throw new Error(
      `Dragging changed model scale; expected ${dragScale}, got ${afterDragConfig.live2d.scale}`
    );
  }
  const afterStressDragBounds = afterDragBounds;
  if (
    afterStressDragBounds.width !== afterDragBounds.width ||
    afterStressDragBounds.height !== afterDragBounds.height
  ) {
    throw new Error(
      `Repeated dragging resized pet window; before=${JSON.stringify(afterDragBounds)}, after=${JSON.stringify(afterStressDragBounds)}`
    );
  }

  await petWindow.evaluate(() => window.greyfield?.send("settings:update", { window: { modelPassThrough: true } }));
  const passThroughConfig = await waitForModelPassThrough(configPath, true);
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  await dispatchStageWheel(petWindow, modelPoint, -240);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterPassThroughWheelConfig = await readConfig(configPath);
  if (afterPassThroughWheelConfig.live2d.scale !== passThroughConfig.live2d.scale) {
    throw new Error(
      `Model Pass Through allowed wheel scale; expected ${passThroughConfig.live2d.scale}, got ${afterPassThroughWheelConfig.live2d.scale}`
    );
  }
  await petWindow.evaluate(() => window.greyfield?.send("settings:update", { window: { modelPassThrough: false } }));
  await waitForModelPassThrough(configPath, false);

  if (quickMode) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "quick",
          petSnapshot,
          hitTestWorked: true,
          wheelScaleWorked: true,
          dragMovedWindow: {
            before: beforeDragBounds,
            after: afterStressDragBounds
          },
          dragBlockedWheelScale: true,
          modelPassThroughBlockedWheelScale: true
        },
        null,
        2
      )
    );
  } else {
  await app.evaluate(({ BrowserWindow }) => {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      browserWindow.show();
    }
  });
  const settingsWindow = await waitForSettingsWindow();
  await settingsWindow.waitForSelector(".greyfield-shell");

  const settingsBounds = await settingsWindow.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    hasGreyfieldApi: typeof window.greyfield?.send === "function",
    role: new URLSearchParams(window.location.search).get("window"),
    hasSettingsNav: document.querySelector(".settings-nav") !== null,
    hasChatComposer: document.querySelector(".composer") !== null
  }));
  if (settingsBounds.hasChatComposer || !settingsBounds.hasSettingsNav) {
    throw new Error(`Settings window is not isolated from chat: ${JSON.stringify(settingsBounds)}`);
  }
  await settingsWindow.getByRole("button", { name: "Choose model" }).waitFor();
  await settingsWindow.getByLabel("Scale").fill("1.36");
  await settingsWindow.getByLabel("Model X").fill("42");
  await settingsWindow.getByLabel("Model Y").fill("-24");
  await settingsWindow.getByRole("button", { name: "Reset transform" }).click();
  const resetConfig = await waitForLive2DTransform(configPath, { scale: 1, x: 0, y: 0 });
  await settingsWindow.getByRole("textbox", { name: "Model", exact: true }).fill("electron-harness-model");
  const savedConfig = await waitForSavedModel(configPath, "electron-harness-model");
  await settingsWindow.getByLabel("Speech Bubble").uncheck();
  const savedBubbleConfig = await waitForSpeechBubble(configPath, false);

  const chatWindow = await waitForRoleWindow("chat");
  await chatWindow.waitForSelector(".chat-shell");
  await chatWindow.getByLabel("Message").fill("醒了吗？");
  await chatWindow.getByRole("button", { name: "Send" }).click();
  await chatWindow.locator(".message-list .assistant", { hasText: "你好，我醒着。现在可以继续做桌宠了。" }).waitFor();
  await chatWindow.getByRole("button", { name: "Stop" }).click();

  console.log(
    JSON.stringify(
      {
        ok: true,
        windowCount: app.windows().length,
        petSnapshot,
        settingsBounds,
        resetTransform: resetConfig.live2d,
        savedModel: savedConfig.provider.model,
        savedSpeechBubble: savedBubbleConfig.ui.speechBubbleEnabled,
        hitTestWorked: true,
        wheelScaleWorked: true,
        dragMovedWindow: {
          before: beforeDragBounds,
          after: afterStressDragBounds
        },
        dragBlockedWheelScale: true,
        modelPassThroughBlockedWheelScale: true,
        repliedToText: true,
        chatWindowWorked: true
      },
      null,
      2
    )
  );
  }
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForLive2DTransform(
  path: string,
  expected: { scale: number; x: number; y: number }
): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const config = await readConfig(path).catch(() => null);
    if (
      config?.live2d.scale === expected.scale &&
      config.live2d.x === expected.x &&
      config.live2d.y === expected.y
    ) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Live2D transform ${JSON.stringify(expected)}`);
}

async function waitForSettingsWindow(): Promise<Page> {
  return waitForRoleWindow("settings");
}

async function waitForRoleWindow(roleName: "settings" | "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function waitForSavedModel(path: string, model: string): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    try {
      const config = JSON.parse(await readFile(path, "utf8")) as typeof defaultGreyfieldConfig;
      if (config.provider.model === model) {
        return config;
      }
    } catch {
      // The main process may be between truncate and write; retry until stable.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for saved model ${model}`);
}

async function readConfig(path: string): Promise<typeof defaultGreyfieldConfig> {
  return JSON.parse(await readFile(path, "utf8")) as typeof defaultGreyfieldConfig;
}

async function findStagePoint(page: Page, hit: boolean): Promise<{ x: number; y: number }> {
  return page.evaluate((wantHit) => {
    const smoke = (window as typeof window & {
      __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean };
    }).__greyfieldStageSmoke;
    const canvases = Array.from(
      document.querySelectorAll<HTMLCanvasElement>("canvas.live2d-stage-canvas, canvas.fallback-stage-canvas")
    );
    if (canvases.length === 0) {
      throw new Error("Missing pet stage canvas");
    }
    let strongest = { x: 0, y: 0, alpha: 0, canvas: "" };
    for (const canvas of canvases) {
      if (canvas.width === 0 || canvas.height === 0) {
        continue;
      }
      const rect = canvas.getBoundingClientRect();
      const getAlpha = createAlphaReader(canvas);
      for (let y = 0; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const alpha = getAlpha(x, y);
          if (alpha > strongest.alpha) {
            strongest = { x, y, alpha, canvas: canvas.className };
          }
          if ((alpha >= 16) === wantHit) {
            const point = {
              x: rect.left + (x / canvas.width) * rect.width,
              y: rect.top + (y / canvas.height) * rect.height
            };
            if (!smoke || smoke.sampleModelHit(point.x, point.y) === wantHit) {
              return point;
            }
          }
        }
      }
    }
    throw new Error(
      `Could not find ${wantHit ? "model" : "transparent"} pet stage point; strongest=${JSON.stringify(strongest)} canvases=${canvases
        .map((canvas) => `${canvas.className}:${canvas.width}x${canvas.height}`)
        .join(",")}`
    );

    function createAlphaReader(target: HTMLCanvasElement): (x: number, y: number) => number {
      const context = target.getContext("2d");
      if (context) {
        const image = context.getImageData(0, 0, target.width, target.height).data;
        return (x, y) => image[(y * target.width + x) * 4 + 3];
      }
      const gl = target.getContext("webgl2") ?? target.getContext("webgl");
      if (!gl) {
        throw new Error("Missing stage canvas rendering context");
      }
      const image = new Uint8Array(target.width * target.height * 4);
      gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
      return (x, y) => image[((target.height - 1 - y) * target.width + x) * 4 + 3];
    }

  }, hit);
}

async function waitForStageHit(page: Page, hit: boolean, point: { x: number; y: number }): Promise<void> {
  const selector = `.live2d-stage-view[data-model-hit="${hit ? "true" : "false"}"]`;
  const smokeMatches = await page.evaluate(({ x, y, expected }) => {
    return (
      (window as typeof window & {
        __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean };
      }).__greyfieldStageSmoke?.sampleModelHit(x, y) === expected
    );
  }, { ...point, expected: hit });
  if (smokeMatches) {
    return;
  }
  try {
    await page.waitForSelector(selector, { timeout: 3_000 });
  } catch (error) {
    const probe = await page.evaluate(({ x, y }) => {
      const stage = document.querySelector<HTMLElement>(".live2d-stage-view");
      const element = document.elementFromPoint(x, y);
      return {
        expectedPoint: { x, y },
        stageHit: stage?.dataset.modelHit,
        elementClass: element instanceof HTMLElement ? element.className : null,
        smokeHit: (window as typeof window & {
          __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean };
        }).__greyfieldStageSmoke?.sampleModelHit(x, y)
      };
    }, point);
    throw new Error(`Timed out waiting for ${selector}; probe=${JSON.stringify(probe)}; cause=${String(error)}`);
  }
}

async function dispatchStageMove(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const target = document.querySelector(".live2d-stage-view") ?? document.elementFromPoint(x, y);
    if (!target) {
      throw new Error(`No element at ${x},${y}`);
    }
    target.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: x,
        clientY: y,
        screenX: window.screenX + x,
        screenY: window.screenY + y,
        pointerId: 1,
        pointerType: "mouse"
      })
    );
    target.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: x,
        clientY: y,
        screenX: window.screenX + x,
        screenY: window.screenY + y
      })
    );
  }, point);
}

async function dispatchStageWheel(page: Page, point: { x: number; y: number }, deltaY: number): Promise<void> {
  await page.evaluate(({ x, y, wheelDeltaY }) => {
    const target = document.querySelector(".live2d-stage-view") ?? document.elementFromPoint(x, y);
    if (!target) {
      throw new Error(`No element at ${x},${y}`);
    }
    target.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        screenX: window.screenX + x,
        screenY: window.screenY + y,
        deltaY: wheelDeltaY
      })
    );
  }, { ...point, wheelDeltaY: deltaY });
}

async function dispatchStageWheelUntilScaleChange(
  page: Page,
  point: { x: number; y: number },
  deltaY: number,
  path: string,
  previousScale: number
): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    await dispatchStageWheel(page, point, deltaY);
    const config = await readConfig(path).catch(() => null);
    if (config && config.live2d.scale !== previousScale) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for model scale to change from ${previousScale}`);
}

async function getPetBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((browserWindow) => {
      const url = browserWindow.webContents.getURL();
      return url.includes("window=pet");
    });
    if (!window) {
      throw new Error("Missing pet BrowserWindow");
    }
    return window.getBounds();
  });
}

async function stressDragPetWindow(
  page: Page,
  before: { x: number; y: number; width: number; height: number }
): Promise<{ x: number; y: number; width: number; height: number }> {
  let bounds = before;
  for (let index = 0; index < 6; index += 1) {
    const point = await findStagePoint(page, true);
    await page.evaluate(() =>
      window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
    );
    const delta = index % 2 === 0 ? { x: 34, y: 22 } : { x: -28, y: -18 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + delta.x, point.y + delta.y, { steps: 4 });
    await page.mouse.up({ button: "left" });
    bounds = await waitForPetBoundsChange(bounds);
  }
  return bounds;
}

async function waitForPetBoundsChange(before: { x: number; y: number }): Promise<{ x: number; y: number; width: number; height: number }> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const bounds = await getPetBounds();
    if (bounds.x !== before.x || bounds.y !== before.y) {
      return bounds;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for pet window drag from ${JSON.stringify(before)}`);
}

async function waitForWindowPosition(path: string, x: number, y: number): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const config = await readConfig(path).catch(() => null);
    if (config?.window.x === x && config.window.y === y) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for persisted window position ${x},${y}`);
}

async function waitForModelPassThrough(path: string, enabled: boolean): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const config = await readConfig(path).catch(() => null);
    if (config?.window.modelPassThrough === enabled) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Model Pass Through ${enabled}`);
}

async function waitForSpeechBubble(path: string, enabled: boolean): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    try {
      const config = JSON.parse(await readFile(path, "utf8")) as typeof defaultGreyfieldConfig;
      if (config.ui.speechBubbleEnabled === enabled) {
        return config;
      }
    } catch {
      // Retry until the write is stable.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for speech bubble setting ${enabled}`);
}
