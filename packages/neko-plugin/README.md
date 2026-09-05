# N.E.K.O realtime voice in Greyfield

Greyfield owns the desktop pet and plugin entry. This package installs and launches the unmodified official N.E.K.O main and memory servers at commit `e1fa3482509132532a242d841b98d55ba03d4c4b`. The original project and its Apache-2.0 license remain in the installed checkout.

Open **Settings → 插件广场 → N.E.K.O 实时语音 → 安装插件 → 启动语音**. First installation needs Git and uv (`~/.local/bin/uv.exe` on Windows), downloads the official source, and runs `uv sync --no-dev --python 3.11`. It stores its source, venv and private data under the current Greyfield userData `plugins/neko` directory. No N.E.K.O window is opened. The selected profile uses the original official free service and its normal initialization; availability is determined by a real upstream session, not local HTTP health.

Only the pet renderer captures the microphone and plays returned PCM. Local speech onset stops existing playback promptly; the original runtime still handles transcription, turn boundaries and generation. Disable or Stop closes capture, playback, the WebSocket and both owned processes. Starting the app alone never opens the microphone.

This is follow-up work after frozen V1. N.E.K.O's necessary memory sidecar stays isolated; Greyfield persona, tool calls and long-term memory are not synchronized into it.

Verification:

- `pnpm vitest run packages/audio-runtime/src/__tests__/realtime-audio.test.ts packages/neko-plugin/src/__tests__/lifecycle.test.ts`
- `pnpm typecheck`
- `pnpm build:desktop`, then `pnpm exec tsx packages/dev-harness/src/electron-neko-plugin-check.ts` with private `GREYFIELD_NEKO_CONFIG_PATH` (model config) and `GREYFIELD_NEKO_CHECK_AUDIO` (mono PCM16 WAV fixture).
- Optional `GREYFIELD_NEKO_SOURCE_PATH` reuses a pinned official checkout during development. Omit it to test the actual installation button.

The focused Electron harness uses a simulated microphone with real official upstream replies and real WebAudio playback. It records two transcripts, speech source cancellation, new playback, mouth motion, released tracks, screenshots and window bounds in `.cache/neko-plugin-acceptance`. This does not establish room echo or subjective microphone quality.
