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
  stage: {
    modelPoint: { x: number; y: number };
    transparentPoint: { x: number; y: number };
    modelHitVerified: boolean;
    transparentHitVerified: boolean;
  };
  chat: {
    assistantReplyVisible: boolean;
    speechBubbleVisible: boolean;
    bubbleText: string;
  };
  settings: {
    providerPreviewVisible: boolean;
    settingsShellVisible: boolean;
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
      "Open pet-initial.png and confirm the pet surface is transparent, unframed, and not a web control panel.",
      "Open pet-after-chat.png and confirm the speech bubble is readable and does not cover the full chat history.",
      "Open chat-after-reply.png and confirm the full assistant reply stays in the Chat window.",
      "Open settings-provider-preview.png and confirm Settings reads like a product surface, not a debug console."
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
    if (pet.role !== "pet" || pet.hasControls || !pet.hasPetShell || !pet.hasGreyfieldApi) {
      throw new Error(`Pet window did not render the expected desktop-pet shell: ${JSON.stringify(pet)}`);
    }
    if (pet.bodyBackgroundColor !== "rgba(0, 0, 0, 0)" || pet.bodyBackgroundImage !== "none") {
      throw new Error(`Pet window is not transparent: ${JSON.stringify(pet)}`);
    }

    const modelPoint = await findStagePoint(petWindow, true);
    const transparentPoint = await findStagePoint(petWindow, false);
    await petWindow.evaluate(() =>
      window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
    );
    await dispatchStageMove(petWindow, modelPoint);
    await waitForStageHit(petWindow, true, modelPoint);
    await dispatchStageMove(petWindow, transparentPoint);
    await waitForStageHit(petWindow, false, transparentPoint);

    const artifacts: Artifact[] = [];
    artifacts.push(await screenshot(petWindow, artifactDir, "pet-initial.png", "Transparent pet shell and model surface."));

    const chatWindow = await waitForRoleWindow(app, "chat");
    await chatWindow.waitForSelector(".chat-shell");
    await chatWindow.getByLabel("Message").fill("验收一下桌宠前端。");
    await chatWindow.getByRole("button", { name: "Send" }).click();
    await chatWindow.locator(".message-list .assistant", { hasText: "你好，我醒着。现在可以继续做桌宠了。" }).waitFor();
    await petWindow.locator(".speech-bubble").waitFor();
    const bubbleText = await petWindow.locator(".speech-bubble").textContent();
    artifacts.push(await screenshot(petWindow, artifactDir, "pet-after-chat.png", "Pet bubble after a fake chat reply."));
    artifacts.push(await screenshot(chatWindow, artifactDir, "chat-after-reply.png", "Chat keeps the complete assistant reply."));

    await app.evaluate(({ BrowserWindow }) => {
      for (const browserWindow of BrowserWindow.getAllWindows()) {
        browserWindow.show();
      }
    });
    const settingsWindow = await waitForRoleWindow(app, "settings");
    await settingsWindow.waitForSelector(".greyfield-shell");
    await settingsWindow.locator(".provider-status--preview", { hasText: "Fake provider is active" }).waitFor();
    artifacts.push(
      await screenshot(settingsWindow, artifactDir, "settings-provider-preview.png", "Settings provider preview state.")
    );

    const summary = buildV1VisualAcceptanceSummary({
      artifactDir,
      pet,
      stage: {
        modelPoint: roundPoint(modelPoint),
        transparentPoint: roundPoint(transparentPoint),
        modelHitVerified: true,
        transparentHitVerified: true
      },
      chat: {
        assistantReplyVisible: true,
        speechBubbleVisible: true,
        bubbleText: bubbleText?.trim() ?? ""
      },
      settings: {
        providerPreviewVisible: true,
        settingsShellVisible: true
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat"): Promise<Page> {
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
