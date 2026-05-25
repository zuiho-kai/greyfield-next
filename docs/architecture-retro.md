# Architecture Retro: 2026-05-25

This note records the architecture review after the desktop pet interaction fixes. The goal is to prevent Greyfield Next from repeating the old pattern: many named modules, but weak runtime ownership.

## What Was Going Wrong

- The renderer still had enough code to construct a real LLM runtime when configured. That meant the desktop app had two possible runtime owners: renderer and Electron main.
- API keys were redacted only at the broadcast surface. Without a renderer-safe config type, later code could accidentally treat masked settings as raw provider settings.
- `RuntimeService` could accept a second text input while the first provider stream was still active. Stop would then target whichever runtime was most recently stored, leaving older streams alive.
- Electron main is still too large. Window creation, tray, drag, shape, model selection, settings, runtime IPC, and menus live in one file. It has not collapsed yet, but this is the next pressure point.

## What Changed

- Renderer desktop runtime is now UI-only for hosted Electron mode. It sends `runtime:input` and consumes `runtime:event`; it no longer imports or constructs `GreyfieldRuntime`, provider implementations, session stores, memory stores, or TTS providers.
- Browser/no-host preview remains fake-only. Even if OpenAI-compatible settings are present, renderer preview does not call `fetch`.
- `settings:changed` now uses `RendererGreyfieldConfig`. Renderer sees `provider.hasApiKey` plus an empty or masked `provider.apiKey`, not the raw secret.
- Renderer state stores only API-key presence from settings broadcasts. It does not keep the masked placeholder as `providerApiKey`, so `getConfigSnapshot()` will not turn a mask back into a config value.
- `RuntimeService` now interrupts the active text run before accepting a newer text input. This prevents concurrent provider streams in the V1 desktop path.
- Focused tests cover redaction, fake-only renderer preview, masked-key update behavior, and main runtime single-flight interruption.

## Remaining Architecture Debt

- Split `apps/desktop/src/main/index.ts` into small controllers: windows, tray/menu, pet input, model selection, settings IPC, runtime IPC.
- Consider replacing the string mask sentinel with a tagged renderer settings object if provider settings become more complex.
- Move Electron runtime session/memory from in-memory fake stores to persistence-backed stores before claiming recent context continuity in the packaged app.
- Keep native window shape behind `GREYFIELD_ENABLE_NATIVE_SHAPE=1`; do not mix shape experiments into the default pet interaction path.

## Guardrail

A module boundary only counts if there is one owner for each side effect. For V1:

- Real provider calls: Electron main runtime only.
- Live2D visual/input decisions: renderer stage only.
- Native window side effects: Electron main only.
- Config persistence: Electron main plus persistence package only.
- Fake providers: harness and no-host preview only.
