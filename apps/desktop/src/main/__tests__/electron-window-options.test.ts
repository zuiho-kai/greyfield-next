import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import {
  createControlsWindowOptions,
  createPetWindowOptions,
  createSettingsWindowOptions,
  resolveRendererHtmlPath
} from "../electron-window-options";

describe("Electron window options", () => {
  it("keeps the pet window transparent, frameless, and scoped to config dimensions", () => {
    const options = createPetWindowOptions(defaultGreyfieldConfig, "E:/project/apps/desktop/dist-preload/index.cjs", [
      { x: 0, y: 0, width: 1920, height: 1080 }
    ]);

    expect(options).toMatchObject({
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      width: 420,
      height: 620,
      resizable: false
    });
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      preload: "E:/project/apps/desktop/dist-preload/index.cjs"
    });
  });

  it("clamps offscreen pet coordinates into the visible display area", () => {
    const options = createPetWindowOptions(
      {
        ...defaultGreyfieldConfig,
        window: { ...defaultGreyfieldConfig.window, x: 900, y: -400, width: 420, height: 620 }
      },
      undefined,
      [{ x: 0, y: 0, width: 800, height: 600 }]
    );

    expect(options).toMatchObject({
      x: 380,
      y: 0,
      width: 420,
      height: 620
    });
  });

  it("keeps existing safe pet coordinates unchanged", () => {
    const options = createPetWindowOptions(
      {
        ...defaultGreyfieldConfig,
        window: { ...defaultGreyfieldConfig.window, x: 120, y: 80, width: 420, height: 620 }
      },
      undefined,
      [{ x: 0, y: 0, width: 1280, height: 900 }]
    );

    expect(options).toMatchObject({
      x: 120,
      y: 80,
      width: 420,
      height: 620
    });
  });

  it("places controls from the clamped pet position and keeps controls visible", () => {
    const options = createControlsWindowOptions(
      {
        ...defaultGreyfieldConfig,
        window: { ...defaultGreyfieldConfig.window, x: 760, y: 500, width: 420, height: 620 }
      },
      undefined,
      [{ x: 0, y: 0, width: 800, height: 600 }]
    );

    expect(options).toMatchObject({
      x: 344,
      y: 460,
      width: 456,
      height: 140
    });
  });

  it("keeps settings as a normal utility window", () => {
    const options = createSettingsWindowOptions();

    expect(options).toMatchObject({
      width: 820,
      height: 620,
      show: false,
      frame: true,
      transparent: false
    });
  });

  it("resolves renderer html next to dist-main output", () => {
    expect(resolveRendererHtmlPath("E:/project/apps/desktop/dist-main")).toBe(
      "E:\\project\\apps\\desktop\\dist-renderer\\index.html"
    );
  });

  it("uses bundled Hiyori and isolated safe dev config when live2d dev env is not explicit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-dev-launch-"));
    try {
      const devLaunch = await import(new URL("../../../scripts/dev-live2d-electron.mjs", import.meta.url).href);
      const fixture = join(dir, "hiyori_free_t08.model3.json");
      const url = devLaunch.createRendererUrl("http://127.0.0.1:5173/", {
        env: {},
        exists: (path: string) => path === fixture,
        packageFixture: fixture
      });

      expect(new URL(url).searchParams.get("live2dModel")).toBe(`/@fs/${fixture.replace(/\\/g, "/")}`);

      const env = await devLaunch.prepareDevLaunchEnvironment({
        env: {},
        cacheRoot: dir
      });
      const config = JSON.parse(await readFile(env.GREYFIELD_CONFIG_PATH, "utf8"));

      expect(env).toMatchObject({
        GREYFIELD_CONFIG_PATH: join(dir, "greyfield.config.json"),
        GREYFIELD_USER_DATA_PATH: join(dir, "user-data")
      });
      expect(config).toMatchObject({
        window: {
          x: 80,
          y: 80,
          clickThrough: false,
          modelPassThrough: false
        },
        live2d: {
          modelPath: "assets/live2d/momose-hiyori/runtime/hiyori_free_t08.model3.json",
          scale: 1,
          x: 0,
          y: 0
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps explicit live2d dev config paths and fixture ahead of defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-dev-launch-explicit-"));
    try {
      const devLaunch = await import(new URL("../../../scripts/dev-live2d-electron.mjs", import.meta.url).href);
      const fixture = join(dir, "custom.model3.json");
      const configPath = join(dir, "custom.config.json");
      const userDataPath = join(dir, "custom-user-data");

      const url = devLaunch.createRendererUrl("http://127.0.0.1:5173/", {
        env: { GREYFIELD_LIVE2D_FIXTURE: fixture },
        exists: (path: string) => path === fixture,
        packageFixture: join(dir, "bundled.model3.json")
      });
      const env = await devLaunch.prepareDevLaunchEnvironment({
        env: {
          GREYFIELD_CONFIG_PATH: configPath,
          GREYFIELD_USER_DATA_PATH: userDataPath
        },
        cacheRoot: dir
      });

      expect(new URL(url).searchParams.get("live2dModel")).toBe(`/@fs/${fixture.replace(/\\/g, "/")}`);
      expect(env).toMatchObject({
        GREYFIELD_CONFIG_PATH: configPath,
        GREYFIELD_USER_DATA_PATH: userDataPath
      });
      await expect(readFile(configPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
