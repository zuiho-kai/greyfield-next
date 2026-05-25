import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

async function main(): Promise<void> {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/`;
  const server = startDesktopServer(port);
  try {
    await waitForServer(url);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.fallback-stage-canvas");
      await waitForPaintedCanvas(page);

      const first = await readCanvasState(page);
      await page.waitForTimeout(260);
      const second = await readCanvasState(page);

      if (first.nonTransparentPixels < 2000) {
        throw new Error(`Stage canvas is too empty: ${first.nonTransparentPixels} painted pixels`);
      }
      if (first.signature === second.signature) {
        throw new Error("Stage canvas did not change across animation frames");
      }

      console.log(
        JSON.stringify(
          {
            ok: true,
            usedFallback: true,
            url,
            firstNonTransparentPixels: first.nonTransparentPixels,
            frameChanged: first.signature !== second.signature
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

function startDesktopServer(port: number): ChildProcessWithoutNullStreams {
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `pnpm --filter @greyfield/desktop dev --port ${port}`]
      : ["--filter", "@greyfield/desktop", "dev", "--port", String(port)];
  const server = spawn(command, args, {
    cwd: workspaceRoot,
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

async function waitForPaintedCanvas(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.fallback-stage-canvas");
    if (!canvas) {
      return false;
    }
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0 || canvas.height === 0) {
      return false;
    }
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < image.length; index += 4) {
      if (image[index] > 0) {
        return true;
      }
    }
    return false;
  });
}

async function readCanvasState(page: Page): Promise<{ nonTransparentPixels: number; signature: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.fallback-stage-canvas");
    if (!canvas) {
      throw new Error("Missing stage canvas");
    }

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Missing 2D canvas context");
    }

    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    let signature = 0;
    for (let index = 3; index < image.length; index += 4) {
      const alpha = image[index];
      if (alpha > 0) {
        nonTransparentPixels += 1;
        signature = (signature + alpha * (index + 1)) % 1000000007;
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
