import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NekoPlugin, NEKO_REVISION, type NekoPluginEvent } from "../../neko-plugin/src/index";

const root = process.env.GREYFIELD_NEKO_CHECK_ROOT;
const sourcePath = process.env.GREYFIELD_NEKO_SOURCE_PATH;
const audioPath = process.env.GREYFIELD_NEKO_CHECK_AUDIO;
if (!root || !sourcePath || !audioPath) throw new Error("Set GREYFIELD_NEKO_CHECK_ROOT, GREYFIELD_NEKO_SOURCE_PATH and GREYFIELD_NEKO_CHECK_AUDIO.");
const events: Array<Record<string, unknown>> = [];
let audioBytes = 0;
const audioChunks: Uint8Array[] = [];
let transcript = "";
let sessionStarted = false;
const plugin = new NekoPlugin({ root, sourcePath, emit(event: NekoPluginEvent) {
  if (event.type === "audio") { audioBytes += event.data.length; audioChunks.push(event.data); return; }
  if (event.type === "state") { console.log(JSON.stringify(event)); events.push({ ...event }); }
  if (event.type === "message") {
    const data = event.data;
    if (data.type === "session_started" && data.input_mode === "audio") sessionStarted = true;
    if (data.type === "user_transcript") transcript += String(data.text ?? "");
    if (["status", "session_started", "session_failed", "user_transcript", "user_activity"].includes(String(data.type))) {
      events.push({ ...data }); console.log(JSON.stringify(data));
    }
  }
} });
try {
  await plugin.start();
  if (plugin.getState().status !== "ready") throw new Error(plugin.getState().message);
  const wav = await readFile(audioPath);
  const rate = wav.readUInt32LE(24);
  let offset = 12;
  while (wav.toString("ascii", offset, offset + 4) !== "data" && offset < wav.length) offset += 8 + wav.readUInt32LE(offset + 4);
  const pcm = wav.subarray(offset + 8);
  // Fixture is mono PCM16. Resample to the official 48 kHz / 10 ms wire frames.
  const output = new Uint8Array(Math.ceil(pcm.length / 2 * 48000 / rate) * 2 + 48000 * 2 * 6);
  const view = new DataView(output.buffer);
  for (let index = 0; index < output.length / 2 - 48000 * 6; index++) view.setInt16(index * 2, pcm.readInt16LE(Math.min(pcm.length - 2, Math.floor(index * rate / 48000) * 2)), true);
  for (let position = 0; position < output.length; position += 960) {
    plugin.sendPcm(output.slice(position, position + 960), 48000);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && (!transcript || audioBytes === 0) && plugin.getState().status === "ready") await new Promise((resolve) => setTimeout(resolve, 300));
  if (!transcript || !audioBytes) throw new Error(`Original upstream incomplete: transcript=${Boolean(transcript)}, audioBytes=${audioBytes}`);
} catch (error) {
  events.push({ error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1;
} finally {
  await plugin.stop();
  const result = { revision: NEKO_REVISION, sessionStarted, transcript, audioBytes, stopped: plugin.getState().status === "stopped", events };
  await mkdir(root, { recursive: true }); await writeFile(join(root, "acceptance.json"), JSON.stringify(result, null, 2));
  if (audioBytes) {
    const header = Buffer.alloc(44);
    header.write("RIFF"); header.writeUInt32LE(36 + audioBytes, 4); header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write("data", 36); header.writeUInt32LE(audioBytes, 40);
    await writeFile(join(root, "original-neko-reply.wav"), Buffer.concat([header, ...audioChunks]));
  }
  console.log(JSON.stringify({ ...result, events: undefined }, null, 2));
}
