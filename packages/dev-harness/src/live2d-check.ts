import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { resolveLive2DFixturePath, toViteFsModelUrl } from "./live2d-fixture";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");

async function main(): Promise<void> {
  const fixture = resolveLive2DFixturePath();
  const port = await findFreePort();
  const rootUrl = `http://127.0.0.1:${port}/`;
  const modelUrl = toViteFsModelUrl(fixture);
  const petUrl = `${rootUrl}?window=pet&live2dModel=${encodeURIComponent(modelUrl)}`;
  const server = startDesktopServer(port);

  try {
    await waitForServer(rootUrl);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
      page.on("console", (message) => {
        if (message.type() === "error") {
          console.error(message.text());
        }
      });
      await page.goto(petUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-stage-mode="live2d"] canvas.live2d-stage-canvas', { timeout: 20_000 });
      await waitForLive2DPixels(page);
      const petSnapshot = await page.evaluate(() => {
        const bodyStyle = getComputedStyle(document.body);
        const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
        const canvasRect = canvas?.getBoundingClientRect();
        return {
          bodyBackgroundColor: bodyStyle.backgroundColor,
          bodyBackgroundImage: bodyStyle.backgroundImage,
          hasControls: document.querySelector(".control-surface") !== null,
          hasPetShell: document.querySelector(".pet-shell") !== null,
          canvasWidth: canvas?.width,
          canvasHeight: canvas?.height,
          canvasClientWidth: canvasRect?.width,
          canvasClientHeight: canvasRect?.height
        };
      });
      if (
        petSnapshot.bodyBackgroundColor !== "rgba(0, 0, 0, 0)" ||
        petSnapshot.bodyBackgroundImage !== "none" ||
        petSnapshot.hasControls ||
        !petSnapshot.hasPetShell
      ) {
        throw new Error(`Live2D pet shell is not transparent and isolated: ${JSON.stringify(petSnapshot)}`);
      }
      if (petSnapshot.canvasWidth !== 1100 || petSnapshot.canvasHeight !== 760) {
        throw new Error(`Live2D canvas did not resize to the pet viewport: ${JSON.stringify(petSnapshot)}`);
      }

      const first = await readWebglCanvasState(page);
      if (first.nonTransparentPixels < 2000) {
        throw new Error(`Live2D canvas is too empty: ${first.nonTransparentPixels} painted pixels`);
      }
      await page.locator(".live2d-stage-view").click({ position: { x: 550, y: 180 } });
      await page.waitForSelector('.live2d-stage-view[data-last-touch="head"]');
      await page.waitForSelector('.live2d-stage-view[data-current-expression="smile"]');
      await page.waitForSelector('.live2d-stage-view[data-current-motion="Use:0"]');
      await page.waitForTimeout(500);
      const second = await readWebglCanvasState(page);
      if (first.signature === second.signature) {
        throw new Error("Live2D canvas did not change after a model touch reaction");
      }
      const transparentPoint = await findCanvasPoint(page, false);
      const modelPoint = await findCanvasPoint(page, true);
      await page.mouse.move(transparentPoint.x, transparentPoint.y);
      await page.waitForSelector('.live2d-stage-view[data-model-hit="false"]');
      await page.mouse.move(modelPoint.x, modelPoint.y);
      await page.waitForSelector('.live2d-stage-view[data-model-hit="true"]');

      console.log(
        JSON.stringify(
          {
            ok: true,
            usedFallback: false,
            fixture,
            petSnapshot,
            firstNonTransparentPixels: first.nonTransparentPixels,
            frameChanged: first.signature !== second.signature,
            touchExpressionWorked: true,
            touchMotionWorked: true,
            touchAreaWorked: true
          },
          null,
          2
        )
      );
    } finally {
      await browser.close();
    }
  } finally {
    await stopDesktopServer(server);
  }
}

async function findCanvasPoint(page: Page, hit: boolean): Promise<{ x: number; y: number }> {
  return page.evaluate((wantHit) => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
    if (!canvas) {
      throw new Error("Missing Live2D stage canvas");
    }
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      throw new Error("Missing WebGL context");
    }
    const image = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const rect = canvas.getBoundingClientRect();
    const stepX = Math.max(1, Math.floor(canvas.width / 40));
    const stepY = Math.max(1, Math.floor(canvas.height / 40));
    for (let y = 0; y < canvas.height; y += stepY) {
      for (let x = 0; x < canvas.width; x += stepX) {
        const alpha = image[(y * canvas.width + x) * 4 + 3];
        const isHit = alpha >= 16;
        if (isHit === wantHit) {
          return {
            x: rect.left + (x / canvas.width) * rect.width,
            y: rect.top + ((canvas.height - 1 - y) / canvas.height) * rect.height
          };
        }
      }
    }
    throw new Error(`Could not find ${wantHit ? "model" : "transparent"} canvas point`);
  }, hit);
}

function startDesktopServer(port: number): ChildProcessWithoutNullStreams {
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: desktopRoot,
    stdio: "pipe"
  });
  server.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });
  return server;
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Could not allocate a free port");
  }
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(targetUrl: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

async function waitForLive2DPixels(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
    if (!canvas) {
      return false;
    }
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl || canvas.width === 0 || canvas.height === 0) {
      return false;
    }
    const image = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
    for (let index = 3; index < image.length; index += 4) {
      if (image[index] > 0) {
        return true;
      }
    }
    return false;
  }, null, { timeout: 20_000 });
}

async function readWebglCanvasState(page: Page): Promise<{ nonTransparentPixels: number; signature: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
    if (!canvas) {
      throw new Error("Missing Live2D stage canvas");
    }
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      throw new Error("Missing WebGL context");
    }
    const image = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
    let nonTransparentPixels = 0;
    let signature = 0;
    for (let index = 0; index < image.length; index += 4) {
      const red = image[index];
      const green = image[index + 1];
      const blue = image[index + 2];
      const alpha = image[index + 3];
      if (alpha > 0) {
        nonTransparentPixels += 1;
        signature = (signature + (red + green * 3 + blue * 5 + alpha * 7) * (index + 1)) % 1000000007;
      }
    }
    return { nonTransparentPixels, signature };
  });
}

async function stopDesktopServer(server: ChildProcessWithoutNullStreams): Promise<void> {
  if (server.killed) {
    return;
  }

  if (process.platform === "win32" && server.pid) {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(server.pid), "/t", "/f"], () => resolve());
    });
    return;
  }

  server.kill();
  await once(server, "exit").catch(() => undefined);
}

await main();
