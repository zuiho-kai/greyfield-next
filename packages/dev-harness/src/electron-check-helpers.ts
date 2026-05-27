import type { Page } from "playwright";
import { readFile } from "node:fs/promises";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

export async function waitForLive2DTransform(
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

export async function waitForSavedModel(path: string, model: string): Promise<typeof defaultGreyfieldConfig> {
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

export async function readConfig(path: string): Promise<typeof defaultGreyfieldConfig> {
  return JSON.parse(await readFile(path, "utf8")) as typeof defaultGreyfieldConfig;
}

export function chooseStagePointFromAlpha(input: {
  width: number;
  height: number;
  wantHit: boolean;
  alphaAt: (x: number, y: number) => number;
  toPoint: (x: number, y: number) => { x: number; y: number };
}): { x: number; y: number } | null {
  let best: { x: number; y: number; alpha: number } | null = null;
  for (let y = 0; y < input.height; y += 4) {
    for (let x = 0; x < input.width; x += 4) {
      const alpha = input.alphaAt(x, y);
      const matches = input.wantHit ? alpha >= 16 : alpha < 16;
      if (!matches) {
        continue;
      }
      if (!best || (input.wantHit ? alpha > best.alpha : alpha < best.alpha)) {
        best = { x, y, alpha };
      }
    }
  }
  return best ? input.toPoint(best.x, best.y) : null;
}

export async function findStagePoint(page: Page, hit: boolean): Promise<{ x: number; y: number }> {
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
      let best: { x: number; y: number; alpha: number } | null = null;
      for (let y = 0; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const alpha = getAlpha(x, y);
          if (alpha > strongest.alpha) {
            strongest = { x, y, alpha, canvas: canvas.className };
          }
          const matches = wantHit ? alpha >= 16 : alpha < 16;
          if (matches && (!best || (wantHit ? alpha > best.alpha : alpha < best.alpha))) {
            best = { x, y, alpha };
          }
        }
      }
      if (best) {
        const point = {
          x: rect.left + (best.x / canvas.width) * rect.width,
          y: rect.top + (best.y / canvas.height) * rect.height
        };
        if (!smoke || smoke.sampleModelHit(point.x, point.y) === wantHit) {
          return point;
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

export async function waitForStageHit(page: Page, hit: boolean, point: { x: number; y: number }): Promise<void> {
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

export async function dispatchStageMove(page: Page, point: { x: number; y: number }): Promise<void> {
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

interface StageWheelDispatchProbe {
  dispatched: boolean;
  defaultPrevented: boolean;
  elementClass: string | null;
  smokeHit: boolean | null;
  stageHitBefore: string | null;
  targetClass: string | null;
}

export async function dispatchStageWheel(
  page: Page,
  point: { x: number; y: number },
  deltaY: number
): Promise<StageWheelDispatchProbe> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, deltaY);
  return page.evaluate(({ x, y, wheelDeltaY }) => {
    const stage = document.querySelector<HTMLElement>(".live2d-stage-view");
    const element = document.elementFromPoint(x, y);
    const target = stage ?? element;
    if (!target) {
      throw new Error(`No element at ${x},${y}`);
    }
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      deltaY: wheelDeltaY
    });
    const dispatched = target.dispatchEvent(event);
    return {
      dispatched,
      defaultPrevented: event.defaultPrevented,
      elementClass: element instanceof HTMLElement ? String(element.className) : null,
      smokeHit:
        (window as typeof window & {
          __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean };
        }).__greyfieldStageSmoke?.sampleModelHit(x, y) ?? null,
      stageHitBefore: stage?.dataset.modelHit ?? null,
      targetClass: target instanceof HTMLElement ? String(target.className) : null
    };
  }, { ...point, wheelDeltaY: deltaY });
}

export async function dispatchStageWheelUntilScaleChange(
  page: Page,
  point: { x: number; y: number },
  deltaY: number,
  path: string,
  previousScale: number
): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  let attempts = 0;
  let lastConfig: typeof defaultGreyfieldConfig | null = null;
  let lastProbe: StageWheelDispatchProbe | null = null;
  while (Date.now() - started < 10_000) {
    attempts += 1;
    lastProbe = await dispatchStageWheel(page, point, deltaY);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const config = await readConfig(path).catch(() => null);
    lastConfig = config;
    if (config && config.live2d.scale !== previousScale) {
      return config;
    }
  }
  throw new Error(
    `Timed out waiting for model scale to change from ${previousScale}; attempts=${attempts}; lastConfig=${JSON.stringify(
      lastConfig?.live2d ?? null
    )}; lastProbe=${JSON.stringify(lastProbe)}`
  );
}

export async function waitForWindowPosition(
  path: string,
  x: number,
  y: number
): Promise<typeof defaultGreyfieldConfig> {
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

export async function waitForModelPassThrough(path: string, enabled: boolean): Promise<typeof defaultGreyfieldConfig> {
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

export async function waitForSpeechBubble(path: string, enabled: boolean): Promise<typeof defaultGreyfieldConfig> {
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
