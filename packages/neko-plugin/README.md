# N.E.K.O realtime voice in Greyfield

Greyfield owns the desktop pet and plugin entry. This package installs and launches the unmodified official N.E.K.O main and memory servers at commit `e1fa3482509132532a242d841b98d55ba03d4c4b`. The original project and its Apache-2.0 license remain in the installed checkout.

Open **Settings → 插件广场 → N.E.K.O 实时语音 → 安装插件 → 启动语音**. First installation needs Git and uv (`~/.local/bin/uv.exe` on Windows), downloads the official source, and runs `uv sync --no-dev --python 3.11`. It stores its source, venv and private data under the current Greyfield userData `plugins/neko` directory. No N.E.K.O window is opened. The selected profile uses the original official free service and its normal initialization; availability is determined by a real upstream session, not local HTTP health.

Only the pet renderer captures the microphone and plays returned PCM. Local speech onset stops existing playback promptly; the original runtime still handles transcription, turn boundaries and generation. Disable or Stop closes capture, playback, the WebSocket and both owned processes. Starting the app alone never opens the microphone.

You can ask the same voice session to research a webpage. Greyfield registers `research_web` through the original runtime's local tool API; the native model decides when to call it and speaks the returned findings in its own voice. The host uses installed Google Chrome and the existing provider's **utility** model to search and navigate, then returns actually read page text and sources. Configure that model service in Settings. No text transcription is sent to a second model unless the original voice model explicitly invokes the research tool.

Chrome uses its own profile and only research pages. Local speech onset cancels current research; Stop clears the registered tool, callback server, browser work and owned voice processes. Ordinary conversation does not launch Chrome. A research callback has 50 seconds; the original free runtime's 90-second silence limit remains unchanged. Source links in chat identify pages actually read, rather than search candidates.

This is follow-up work after frozen V1. N.E.K.O's necessary memory sidecar stays isolated; Greyfield persona and long-term memory are not synchronized into it.

Verification:

- `pnpm vitest run packages/audio-runtime/src/__tests__/realtime-audio.test.ts packages/neko-plugin/src/__tests__/lifecycle.test.ts`
- `pnpm typecheck`
- `pnpm build:desktop`, then `pnpm exec tsx packages/dev-harness/src/electron-neko-plugin-check.ts` with private `GREYFIELD_NEKO_CONFIG_PATH` (model config) and `GREYFIELD_NEKO_CHECK_AUDIO` (mono PCM16 WAV fixture).
- Optional `GREYFIELD_NEKO_SOURCE_PATH` reuses a pinned official checkout during development. Omit it to test the actual installation button.
- Set `GREYFIELD_NEKO_BROWSER_CHECK=1` for a spoken research fixture and use a real provider/utility model in the supplied private config. Optional `GREYFIELD_NEKO_BARGE_AUDIO` supplies a second ordinary utterance to interrupt a repeated browser task, and `GREYFIELD_BROWSER_TRACE_PATH` records actual Chrome page screenshots/text plus model stream metadata for inspection.

The focused Electron harness uses a simulated microphone with real official upstream replies and real WebAudio playback. It records two transcripts, speech source cancellation, new playback, mouth motion, released tracks, screenshots and window bounds in `.cache/neko-plugin-acceptance`. This does not establish room echo or subjective microphone quality.
