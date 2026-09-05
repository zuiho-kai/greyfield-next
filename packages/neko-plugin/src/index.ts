import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { NekoBrowserTools } from "./browser-tools";
import { terminateChild } from "./process-lifecycle";
import type { WebTools, WebSource } from "../../core-runtime/src/web-tools";

export const NEKO_REVISION = "e1fa3482509132532a242d841b98d55ba03d4c4b";
export interface NekoPluginState {
  status: "not-installed" | "installing" | "stopped" | "starting" | "connecting" | "ready" | "error";
  message: string;
}
export type NekoPluginEvent =
  | { type: "state"; state: NekoPluginState }
  | { type: "audio"; speechId: string; data: Uint8Array }
  | { type: "interrupt"; speechId?: string }
  | { type: "research"; name: string; status: "running" | "done" | "error"; sources?: WebSource[]; message?: string; resultText?: string }
  | { type: "message"; data: Record<string, unknown> };

const sourceDirectories = ["app", "brain", "config", "deps", "local_server", "main_logic", "main_routers", "memory", "utils", "plugin", "templates", "static/app"];

/** Installs and hosts the unmodified, pinned official runtime. No provider emulation. */
export class NekoPlugin {
  readonly sourcePath: string;
  private children: ChildProcess[] = [];
  private operations = new Set<ChildProcess>();
  private socket?: WebSocket;
  private generation = 0;
  private audioHeaders: string[] = [];
  private interruptedSpeech = new Set<string>();
  private activeSpeechId?: string;
  private responseMessageSpeechId?: string;
  private state: NekoPluginState;
  private browserTools?: NekoBrowserTools;
  private closeBrowserTools?: () => Promise<void>;

  constructor(private readonly options: { root: string; sourcePath?: string; uvPath?: string; createBrowserTools?: () => WebTools; emit(event: NekoPluginEvent): void }) {
    this.sourcePath = options.sourcePath ?? join(options.root, "runtime");
    this.state = { status: this.installed ? "stopped" : "not-installed", message: "N.E.K.O 原版实时语音" };
  }

  getState(): NekoPluginState { return { ...this.state }; }
  private get pythonPath(): string { return join(this.sourcePath, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"); }
  private get installed(): boolean { return existsSync(this.pythonPath) && (Boolean(this.options.sourcePath) || existsSync(join(this.options.root, "installed-revision"))); }
  private setState(status: NekoPluginState["status"], message: string): void {
    this.state = { status, message }; this.options.emit({ type: "state", state: this.getState() });
  }

  async install(): Promise<void> {
    if (["installing", "starting", "connecting", "ready"].includes(this.state.status)) return;
    const generation = ++this.generation;
    this.setState("installing", "正在下载 N.E.K.O 官方运行时…");
    try {
      await mkdir(this.options.root, { recursive: true });
      if (generation !== this.generation) return;
      if (!existsSync(join(this.sourcePath, ".git"))) {
        await this.command("git", ["clone", "--filter=blob:none", "--no-checkout", "https://github.com/Project-N-E-K-O/N.E.K.O.git", this.sourcePath], this.options.root);
      }
      if (generation !== this.generation) return;
      await this.command("git", ["sparse-checkout", "set", ...sourceDirectories], this.sourcePath);
      if (generation !== this.generation) return;
      await this.command("git", ["checkout", "--detach", NEKO_REVISION], this.sourcePath);
      if (generation !== this.generation) return;
      this.setState("installing", "正在安装 Python 3.11 和官方语音依赖，首次安装需要几分钟…");
      const uv = this.options.uvPath ?? (process.platform === "win32" ? join(homedir(), ".local", "bin", "uv.exe") : "uv");
      await this.command(uv, ["sync", "--no-dev", "--python", "3.11"], this.sourcePath);
      if (generation !== this.generation) return;
      await writeFile(join(this.options.root, "installed-revision"), NEKO_REVISION);
      if (generation !== this.generation) return;
      this.setState("stopped", "已安装，点击启动连接原版语音服务");
    } catch (error) { if (generation === this.generation) this.setState("error", `安装失败：${errorText(error)}`); }
  }

  async start(): Promise<void> {
    if (["installing", "starting", "connecting", "ready"].includes(this.state.status)) return;
    const generation = ++this.generation;
    this.setState("starting", "正在启动 N.E.K.O 原版语音运行时…");
    try {
      await this.cleanup();
      if (generation !== this.generation) return;
      if (!existsSync(this.pythonPath)) throw new Error("请先安装插件。");
      const revision = await this.command("git", ["rev-parse", "HEAD"], this.sourcePath);
      if (generation !== this.generation) return;
      if (revision.trim() !== NEKO_REVISION) throw new Error("N.E.K.O 源码版本不匹配，请重新安装插件。");
      await this.command("git", ["diff", "--quiet", "HEAD", "--"], this.sourcePath);
      if (generation !== this.generation) return;
      const ports = [await freePort(), await freePort()];
      const servicePorts: Record<string, string> = {};
      for (const name of ["MONITOR_SERVER_PORT", "COMMENTER_SERVER_PORT", "TOOL_SERVER_PORT", "USER_PLUGIN_SERVER_PORT", "AGENT_MQ_PORT", "MAIN_AGENT_EVENT_PORT"]) {
        servicePorts[`NEKO_${name}`] = String(await freePort());
      }
      const localDataRoot = join(this.options.root, "local");
      const dataRoot = join(localDataRoot, "N.E.K.O");
      await mkdir(dataRoot, { recursive: true });
      if (generation !== this.generation) return;
      const env = { ...process.env, ...servicePorts, NEKO_INSTANCE_ID: randomUUID(), LOCALAPPDATA: localDataRoot, APPDATA: join(this.options.root, "roaming"), XDG_DATA_HOME: localDataRoot,
        PYTHONIOENCODING: "utf-8", NEKO_STORAGE_SELECTED_ROOT: dataRoot,
        NEKO_STORAGE_ANCHOR_ROOT: dataRoot, NEKO_MAIN_SERVER_PORT: String(ports[0]), NEKO_MEMORY_SERVER_PORT: String(ports[1]) };
      const launch = (module: string, args: string[] = []) => {
        if (generation !== this.generation) return;
        const child = spawn(this.pythonPath, ["-m", module, ...args], { cwd: this.sourcePath, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        this.children.push(child);
        for (const output of [child.stdout, child.stderr]) output?.on("data", (chunk) => {
          void appendFile(join(this.options.root, `${module.split(".").pop()}.log`), chunk).catch(() => undefined);
        });
        child.on("error", (error) => { if (generation === this.generation) this.fail(`运行时启动失败：${errorText(error)}`); });
        child.on("exit", (code) => { if (generation === this.generation) this.fail(`N.E.K.O 进程退出 (${code})`); });
        return child;
      };
      launch("app.memory_server", ["--enable-shutdown"]);
      launch("app.main_server");
      const base = `http://127.0.0.1:${ports[0]}`;
      const bootstrap = await this.waitHttp(`${base}/api/storage/location/bootstrap`, generation) as { selection_required?: boolean };
      if (generation !== this.generation) return;
      if (bootstrap.selection_required) {
        const selection = await fetch(`${base}/api/storage/location/select`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ selected_root: dataRoot, selection_source: "user_selected" }) });
        if (!selection.ok) throw new Error(`原版独立数据目录初始化失败 (${selection.status})`);
      }
      await this.waitHttp(`http://127.0.0.1:${ports[1]}/docs`, generation);
      const character = await this.waitHttp(`${base}/api/characters/current_catgirl`, generation) as { current_catgirl?: string };
      if (generation !== this.generation) return;
      if (!character.current_catgirl) throw new Error("原版运行时未返回当前角色。");
      // Official configuration API selects the official free profile, retaining its initialization.
      const configResponse = await fetch(`${base}/api/config/core_api`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coreApi: "free", assistApi: "free" }) });
      if (!configResponse.ok) throw new Error(`原版语音配置失败 (${configResponse.status})`);
      const configResult = await configResponse.json() as { success?: boolean; error?: string };
      if (configResult.success === false) throw new Error(`原版语音配置失败：${configResult.error ?? "unknown"}`);
      if (generation !== this.generation) return;
      if (this.options.createBrowserTools) {
        const browserTools = new NekoBrowserTools(this.options.createBrowserTools(), (event) => this.options.emit({ type: "research", ...event }));
        const close = await browserTools.register(base, character.current_catgirl);
        if (generation !== this.generation) { await close(); return; }
        this.browserTools = browserTools; this.closeBrowserTools = close;
      }
      this.setState("connecting", "运行时已启动，正在连接原版实时语音服务…");
      await this.connect(`${base.replace("http:", "ws:")}/ws/${encodeURIComponent(character.current_catgirl)}`, generation);
    } catch (error) { if (generation === this.generation) await this.fail(errorText(error)); }
  }

  private async connect(url: string, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    const socket = this.socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("原版实时语音连接超时，未收到 session_started。")), 90_000);
      const finish = (error?: Error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
      socket.onopen = () => {
        if (generation !== this.generation) return;
        this.send({ action: "voice_input_control", event: "lease_sync", owner: "core", hard_muted: false, focus_suppressed: false, engaged: true, lease_generation: 1 });
        this.send({ action: "start_session", input_type: "audio", new_session: true });
      };
      socket.onerror = () => { finish(new Error("无法连接 N.E.K.O 本地语音接口。")); if (this.state.status === "ready") void this.fail("原版语音连接发生错误。"); };
      socket.onclose = (event) => {
        finish(new Error(`N.E.K.O 语音连接关闭 (${event.code}) ${event.reason}`));
        if (generation === this.generation && this.state.status === "ready") void this.fail(`语音连接已断开 (${event.code}) ${event.reason}`);
      };
      socket.onmessage = (event) => {
        if (generation !== this.generation) return;
        if (event.data instanceof ArrayBuffer) {
          const speechId = this.audioHeaders.shift();
          if (speechId !== undefined && !this.interruptedSpeech.has(speechId)) this.options.emit({ type: "audio", speechId, data: new Uint8Array(event.data) });
          return;
        }
        let data: Record<string, unknown>;
        try { data = JSON.parse(String(event.data)); } catch { return; }
        // Every audio header still consumes its binary frame, even when cancelled.
        if (data.type === "audio_chunk") this.audioHeaders.push(String(data.speech_id ?? ""));
        const responseId = typeof data.turn_id === "string" ? data.turn_id : typeof data.speech_id === "string" ? data.speech_id : undefined;
        if (responseId) this.responseMessageSpeechId = responseId;
        // Original `turn end` has no ID. Associate it with the most recent
        // response event on this ordered socket (including cancelled audio_done).
        const owner = responseId ?? (data.type === "system" && data.data === "turn end" ? this.responseMessageSpeechId : undefined);
        if (owner && this.interruptedSpeech.has(owner)) return;
        if (responseId) this.activeSpeechId = responseId;
        this.options.emit({ type: "message", data });
        if (data.type === "user_activity") {
          this.browserTools?.cancel();
          const speechId = typeof data.interrupted_speech_id === "string" ? data.interrupted_speech_id : undefined;
          if (speechId) this.interruptedSpeech.add(speechId);
          this.options.emit({ type: "interrupt", speechId });
        }
        if (data.type === "session_started" && data.input_mode === "audio") {
          this.setState("ready", "语音已连接，可以开口；插话会停止旧声音"); finish();
        }
        if (data.type === "session_failed") finish(new Error("N.E.K.O 原版上游未能建立语音会话。"));
        if (data.type === "auto_close_mic") this.fail(String(data.message ?? "原版服务已结束本次语音会话。"));
      };
    });
  }

  sendPcm(pcm: Uint8Array, sampleRate: number): void {
    if (this.state.status !== "ready" || ![16000, 48000].includes(sampleRate)) return;
    const frame = new Uint8Array(8 + pcm.length);
    frame.set([78, 69, 75, 79]); new DataView(frame.buffer).setUint32(4, sampleRate, true); frame.set(pcm, 8);
    if ((this.socket?.bufferedAmount ?? 0) < 192_000) this.socket?.send(frame);
  }
  send(data: Record<string, unknown>): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data)); }
  reportError(message: string): Promise<void> { return this.fail(message); }
  interruptResearch(): void {
    this.browserTools?.cancel();
    // Tool-only native responses already carry a speech ID before any sound.
    // Ignore late audio for that cancelled response, including a spoken tool error.
    if (this.activeSpeechId) this.interruptedSpeech.add(this.activeSpeechId);
    this.options.emit({ type: "interrupt", speechId: this.activeSpeechId });
  }

  async stop(report = true): Promise<void> {
    const generation = ++this.generation;
    try { await this.cleanup(); }
    catch (error) {
      if (generation === this.generation) this.setState("error", `结束原版进程失败：${errorText(error)}`);
      return;
    }
    if (report && generation === this.generation) this.setState(this.installed ? "stopped" : "not-installed", "已停用，麦克风和插件进程已关闭");
  }

  private async cleanup(): Promise<void> {
    const closeBrowserTools = this.closeBrowserTools;
    this.closeBrowserTools = undefined; this.browserTools = undefined;
    await closeBrowserTools?.();
    this.send({ action: "pause_session" });
    this.socket?.close(); this.socket = undefined;
    this.audioHeaders = []; this.interruptedSpeech.clear(); this.activeSpeechId = undefined; this.responseMessageSpeechId = undefined;
    const children = new Set([...this.children, ...this.operations]);
    await Promise.all([...children].map(async (child) => {
      await terminateChild(child);
      this.children = this.children.filter((running) => running !== child);
      this.operations.delete(child);
    }));
  }

  private async fail(message: string): Promise<void> {
    await this.stop(false); this.setState("error", message);
  }
  private async waitHttp(url: string, generation: number): Promise<unknown> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && generation === this.generation) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (response.ok) return response.headers.get("content-type")?.includes("json") ? response.json() : {};
      } catch { /* wait for the official process to bind */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("N.E.K.O 本地运行时未就绪。");
  }
  private command(command: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      this.operations.add(child);
      let tail = "";
      child.stdout?.on("data", (chunk) => { tail = (tail + String(chunk)).slice(-1500); });
      child.stderr?.on("data", (chunk) => { tail = (tail + String(chunk)).slice(-1500); });
      child.on("error", (error) => { this.operations.delete(child); reject(error); });
      child.on("exit", (code) => { this.operations.delete(child); code === 0 ? resolve(tail) : reject(new Error(`${command} 退出 (${code})：${tail}`)); });
    });
  }
}

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = (server.address() as { port: number }).port; server.close(() => resolve(port)); });
  });
}
