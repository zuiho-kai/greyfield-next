import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { resolveLive2DFixturePath } from "./live2d-fixture";
import { getElectronExecutablePath } from "./electron-install";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(root, "apps", "desktop");
const liveConfig = process.env.GREYFIELD_ACCEPTANCE_CONFIG;
const diagnostic = process.argv.includes("--diagnose");
const checkRedirects = process.argv.includes("--redirect-check");
const artifacts = join(root, ".cache", "greyfield-screen-help", liveConfig ? "real" : "stub", new Date().toISOString().replace(/[:.]/g, "-"));
const temp = await mkdtemp(join(tmpdir(), "greyfield-screen-help-"));
await mkdir(artifacts, { recursive: true });
const requests: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: unknown[] }> = [];
const toolEvents: Array<{ type: string; name?: string; status?: string; message?: string }> = [];
let stopRequestStarted = false;
let stopRequestClosed = false;
const server = createServer(async (req, res) => {
  let body = "";
  for await (const part of req) body += String(part);
  const payload = JSON.parse(body);
  requests.push(payload);
  const lastUser = [...payload.messages].reverse().find((message: { role: string }) => message.role === "user");
  const user = typeof lastUser?.content === "string" ? lastUser.content : JSON.stringify(lastUser?.content);
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (delta: unknown) => res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
  if (payload.model === "stub-vision") {
    send({ content: "屏幕终端显示 Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'lodash' imported from C:/project/index.mjs。" });
    res.end("data: [DONE]\n\n");
    return;
  }
  if (user.includes("STOP_PROBE")) {
    stopRequestStarted = true;
    send({ content: "正在继续核对资料，请稍等。" });
    req.on("close", () => { stopRequestClosed = true; });
    res.on("close", () => { stopRequestClosed = true; });
    return;
  }
  const toolResults = payload.messages.filter((message: { role: string }) => message.role === "tool");
  const firstResult = toolResults[0] ? JSON.parse(toolResults[0].content) : undefined;
  if (user.includes("为什么")) send({ content: "第二步检查依赖是否安装，是因为 Node 在解析导入路径时需要找到对应的包。" });
  else if (toolResults.length === 0) send({ content: "我来查一下这个模块加载错误。", tool_calls: [{ index: 0, id: "search-1", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "site:nodejs.org ERR_MODULE_NOT_FOUND" }) } }] });
  else if (toolResults.length === 1 && firstResult.results?.[0]?.url) send({ tool_calls: [{ index: 0, id: "read-1", type: "function", function: { name: "read_webpage", arguments: JSON.stringify({ url: checkRedirects ? `https://httpbin.org/redirect-to?url=${encodeURIComponent(firstResult.results[0].url)}` : firstResult.results[0].url, focus: "ERR_MODULE_NOT_FOUND" }) } }] });
  else send({ content: toolResults.some((message: { content: string }) => JSON.parse(message.content).error) ? "资料获取失败，请稍后重试。" : "ERR_MODULE_NOT_FOUND：当前项目缺少 lodash。\n\n1. **安装缺少的依赖**，在项目目录运行：\n```sh\nnpm install lodash\n\nnode index.mjs\n```\n\n2. **确认导入**：`import lodash from 'lodash'`。\n\n3. **重新运行**：`node index.mjs`。" });
  res.end("data: [DONE]\n\n");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const external = liveConfig ? JSON.parse((await readFile(liveConfig, "utf8")).replace(/^\uFEFF/, "")) : undefined;
const base = defaultGreyfieldConfig;
const config = { ...base,
  provider: external ? { ...base.provider, ...external.provider } : { ...base.provider, llm: "openai-compatible", baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "local-stub-only", visionModel: "stub-vision", taskModels: { ...base.provider.taskModels, chat: "stub-chat" } },
  voice: { ...base.voice, speechEnabled: false },
  live2d: { ...base.live2d, modelPath: pathToFileURL(resolveLive2DFixturePath()).href },
  ui: { ...base.ui, proactivityLevel: 0, settingsLocale: "zh-CN" }
};
const configPath = join(temp, "greyfield.config.json");
await writeFile(configPath, JSON.stringify(config));
let app: ElectronApplication | undefined;
const summary: Record<string, unknown> = { ok: false, model: liveConfig ? "real configured provider" : "local SSE stub", web: "real public network", artifacts };
try {
  app = await electron.launch({ executablePath: await getElectronExecutablePath(desktopRoot), cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")], env: { ...process.env, PW_TEST_SCREENSHOT_NO_FONTS_READY: "1", GREYFIELD_BROWSER_TRACE_PATH: join(artifacts, "chrome"), GREYFIELD_CONFIG_PATH: configPath, GREYFIELD_PROJECT_ROOT: root, GREYFIELD_USER_DATA_PATH: temp, GREYFIELD_LLM_TIMEOUT_MS: "90000" } });
  const controls = await role(app, "controls", ".desktop-control-panel");
  const pet = await role(app, "pet", ".pet-shell");
  const petWarnings = new Set<string>();
  pet.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !petWarnings.has(message.text())) {
      petWarnings.add(message.text());
      console.log(`Pet ${message.type()}: ${message.text().slice(0, 500)}`);
    }
  });
  const chat = await role(app, "chat", ".chat-shell");
  if (checkRedirects) await app.evaluate(({ session }) => {
    session.defaultSession.webRequest.onHeadersReceived({ urls: ["https://httpbin.org/*"] }, (details, callback) => {
      (globalThis as typeof globalThis & { webRedirectStatus?: number }).webRedirectStatus = details.statusCode;
      callback({});
    });
  });
  await chat.exposeFunction("recordResearchEvent", (event: { type: string; name?: string; status?: string; message?: string }) => {
    toolEvents.push(event);
    console.log(JSON.stringify(event));
  });
  await chat.evaluate(() => window.greyfield?.on("runtime:event", (event) => {
    if (event.type === "assistant.tool.status" || event.type === "error") void (window as unknown as { recordResearchEvent: (event: unknown) => Promise<void> }).recordResearchEvent(event);
  }));
  await pet.waitForFunction(() => {
    if (document.querySelector('[data-stage-mode="live2d"]') === null) return false;
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
    if (!canvas) return false;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  }, null, { timeout: 30_000 }).then(() => { summary.nonFallbackModelPixels = true; }).catch(async (error) => {
    summary.nonFallbackModelPixels = false;
    summary.petGateError = String(error);
    summary.petFailure = await pet.evaluate(() => ({ stage: document.querySelector(".live2d-stage-view")?.outerHTML.slice(0, 1200), canvases: Array.from(document.querySelectorAll("canvas")).map((canvas) => ({ width: canvas.width, height: canvas.height })) }));
    await pet.screenshot({ path: join(artifacts, "failure-pet.png") }).catch(() => {});
    await controls.screenshot({ path: join(artifacts, "failure-controls.png") }).catch(() => {});
    if (!diagnostic) throw error;
  });
  // A visible error fixture is captured by the ordinary desktop screen source, without injecting screenshots.
  await app.evaluate(async ({ BrowserWindow }) => {
    const fixture = new BrowserWindow({ width: 950, height: 540, x: 20, y: 30, show: true });
    await fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="background:#17202a;color:#e9f0f5;font:24px monospace;padding:35px"><h2>Node.js project — terminal</h2><p style="color:#ff9c95">Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'lodash\' imported from C:/project/index.mjs</p><p>import { map } from "lodash";</p><p>node index.mjs</p></body>')}`);
  });
  const toggle = controls.getByRole("button", { name: "开启屏幕感知", exact: true });
  await toggle.waitFor({ state: "visible" });
  const toggleFits = await toggle.evaluate((element) => { const r = element.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
  if (!toggleFits) throw new Error("Screen awareness entry does not fit the ordinary controls surface");
  await toggle.click();
  await controls.getByRole("button", { name: "关闭屏幕感知", exact: true }).waitFor();
  await controls.screenshot({ path: join(artifacts, "controls-screen-on.png") });
  await pet.screenshot({ path: join(artifacts, "pet.png") });
  await controls.locator(".desktop-control-input").fill("这个报错帮我查一下：请联网搜索并读取官方资料，给我简短可执行的修复和来源。");
  const start = Date.now();
  await controls.locator(".desktop-control-input").press("Enter");
  await controls.getByRole("button", { name: /打开设置|Open settings/ }).click();
  const settings = await role(app, "settings", ".greyfield-shell");
  await settings.getByRole("button", { name: /^(聊天|Chat)$/ }).click();
  await chat.getByTestId("chat-tool-status").waitFor({ timeout: 90_000 });
  summary.firstToolFeedbackMs = Date.now() - start;
  await chat.screenshot({ path: join(artifacts, "chat-researching.png") });
  await chat.locator(".message-item.assistant .chat-source-link").first().waitFor({ timeout: 180_000 });
  await chat.getByTestId("chat-stop-button").waitFor();
  await chat.waitForFunction(() => (document.querySelector('[data-testid="chat-stop-button"]') as HTMLButtonElement)?.disabled, { timeout: 90_000 });
  summary.answerMs = Date.now() - start;
  if (!toolEvents.some((event) => event.name === "web_search" && event.status === "completed") || !toolEvents.some((event) => ["read_webpage", "browser_click", "browser_read"].includes(event.name ?? "") && event.status === "completed")) throw new Error("Research did not complete a real search and a successful browser page read");
  const answer = await chat.locator(".message-item.assistant").last().innerText();
  const links = await chat.locator(".message-item.assistant .chat-source-link").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, href: (element as HTMLAnchorElement).href })));
  summary.answer = answer;
  summary.sources = links;
  if (checkRedirects) {
    summary.webRedirectStatus = await app.evaluate(() => (globalThis as typeof globalThis & { webRedirectStatus?: number }).webRedirectStatus);
    if (summary.webRedirectStatus !== 302) throw new Error("The live redirect probe did not return HTTP 302");
  }
  await chat.screenshot({ path: join(artifacts, "chat-answer.png") });
  const answerCard = chat.locator(".message-item.assistant:not(.draft)").last();
  for (const button of await answerCard.getByRole("button", { name: "展开全文", exact: true }).all()) await button.click();
  await chat.locator(".message-list").hover();
  await chat.mouse.wheel(0, -1400);
  const command = answerCard.locator("code").filter({ hasText: "npm install" }).first();
  if (await command.count()) {
    const commandBox = await command.boundingBox();
    const listBox = await chat.locator(".message-list").boundingBox();
    if (commandBox && listBox) await chat.mouse.wheel(0, commandBox.y - listBox.y - 70);
    await command.evaluate((element) => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  await chat.screenshot({ path: join(artifacts, "chat-answer-steps.png") });
  if (!liveConfig) {
    const renderedCommand = await answerCard.locator(".chat-code-block").innerText();
    if (renderedCommand.trim() !== "npm install lodash\n\nnode index.mjs" || !(await answerCard.locator("strong").count()) || !(await answerCard.locator(".chat-inline-code").count())) throw new Error("Markdown commands and emphasis did not render");
  }
  await chat.mouse.wheel(0, 1400);
  await chat.screenshot({ path: join(artifacts, "chat-answer-sources.png") });
  const sourceLink = answerCard.locator(".chat-source-link").last();
  const expectedSourceUrl = await sourceLink.getAttribute("href");
  if (!expectedSourceUrl || !/^https?:\/\//i.test(expectedSourceUrl)) throw new Error("Retained source is not an HTTP(S) link");
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => { (globalThis as typeof globalThis & { openedSourceUrl?: string }).openedSourceUrl = url; };
  });
  await sourceLink.click();
  const openedSourceUrl = await app.evaluate(() => (globalThis as typeof globalThis & { openedSourceUrl?: string }).openedSourceUrl);
  if (openedSourceUrl !== expectedSourceUrl) throw new Error("Clicking a source did not reach the main-process external-link handler");
  summary.sourceClickOpenedExpectedUrl = openedSourceUrl;
  summary.windows = await app.evaluate(({ BrowserWindow, screen }) => ({ displays: screen.getAllDisplays().map((display) => display.workArea), windows: BrowserWindow.getAllWindows().map((window) => ({ url: window.webContents.getURL().startsWith("data:") ? "visible error fixture" : window.webContents.getURL(), bounds: window.getBounds(), visible: window.isVisible() })) }));
  if (!liveConfig) {
    const firstMessages = requests[0]?.messages ?? [];
    if (!firstMessages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"))) throw new Error("Ordinary screen toggle did not supply visual context");
    if (!requests.some((request) => request.messages.some((message) => message.role === "tool" && String(message.content).includes('"content":')))) throw new Error("No real page text returned to model stub");
  }
  await controls.getByRole("button", { name: "关闭屏幕感知", exact: true }).click();
  await chat.getByTestId("chat-message-input").fill("为什么需要安装这个包？");
  await chat.getByTestId("chat-send-button").click();
  await chat.locator(".message-item.assistant:not(.draft)").nth(1).waitFor({ timeout: 90_000 });
  await chat.screenshot({ path: join(artifacts, "chat-followup.png") });
  summary.followup = await chat.locator(".message-item.assistant:not(.draft)").nth(1).innerText();
  await chat.getByTestId("chat-message-input").fill(liveConfig ? "请继续联网搜索并详细解释 Node 模块解析的全部规则。" : "STOP_PROBE");
  await chat.getByTestId("chat-send-button").click();
  await chat.waitForFunction(() => !(document.querySelector('[data-testid="chat-stop-button"]') as HTMLButtonElement)?.disabled);
  if (!liveConfig) { while (!stopRequestStarted) await new Promise((resolve) => setTimeout(resolve, 50)); }
  else await chat.getByTestId("chat-tool-status").waitFor({ timeout: 90_000 });
  const stopAt = Date.now();
  await chat.getByTestId("chat-stop-button").click();
  await chat.waitForFunction(() => (document.querySelector('[data-testid="chat-stop-button"]') as HTMLButtonElement)?.disabled);
  summary.stopUiMs = Date.now() - stopAt;
  await chat.screenshot({ path: join(artifacts, "chat-stopped.png") });
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!liveConfig && !stopRequestClosed) throw new Error("Stop did not close the provider request");
  const rawSession = await readFile(join(temp, "sessions", "desktop-main-session.jsonl"), "utf8");
  if (rawSession.includes("data:image/") || rawSession.includes("STOP_PROBE") || rawSession.includes('"tool_call_id"')) throw new Error("Temporary data or interrupted turn leaked into session");
  if (!links.some((link) => rawSession.includes(link.href))) throw new Error("Verified source link was not saved with the completed answer");
  await controls.reload();
  await controls.getByRole("button", { name: "开启屏幕感知", exact: true }).waitFor();
  summary.sourceSavedAndScreenRemainsOffAfterReload = true;
  summary.taskPathPassed = true;
  summary.ok = summary.nonFallbackModelPixels === true;
  if (!summary.ok) process.exitCode = 1;
} catch (error) {
  summary.error = error instanceof Error ? error.message : String(error);
  if (app) for (const page of app.windows()) {
    const roleName = new URL(page.url()).searchParams.get("window");
    if (["pet", "controls", "chat"].includes(roleName ?? "")) await page.screenshot({ path: join(artifacts, `failure-${roleName}.png`) }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  summary.toolEvents = toolEvents;
  summary.toolResults = requests.flatMap((request) => request.messages.filter((message) => message.role === "tool").map((message) => {
    const result = JSON.parse(String(message.content));
    return result.error ? { error: result.error } : { url: result.url, resultCount: result.results?.length, contentLength: result.content?.length };
  }));
  await writeFile(join(artifacts, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await app?.close().catch(() => {});
  await rm(configPath, { force: true });
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function role(app: ElectronApplication, name: string, selector: string): Promise<Page> {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    const page = app.windows().find((page) => page.url().includes(`window=${name}`));
    if (page) { await page.waitForSelector(selector); return page; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No ${name} window`);
}
