# Technical Reference Projects

This document records external projects that agents may consult for Greyfield. These references are not a license to copy code or expand V1 scope. Use them to learn product patterns, integration contracts, and failure cases.

When implementing Greyfield V1, keep the source of truth in `packages/dev-harness/v1-features.json`.

## Reference Map

| Project | What It Is | Useful Lessons | Do Not Copy Blindly |
| --- | --- | --- | --- |
| Zao-chen/ZcChat2 | C++/Qt AI desktop pet with Galgame-style character performance | Character import flow, streaming model/TTS response, voice wake/direct chat/interruption, long-term memory compression, asset/plugin format, lightweight desktop footprint | Do not import desktop control, multimodal, plugin marketplace, or Qt/C++ rewrite into V1 |
| Zao-chen/ZcChat | Earlier Galgame-style AI desktop pet | Long-term memory through Letta, VITS voice synthesis integration, voice input/wake/interruption, strong character-expression loop | It intentionally avoids Live2D in favor of Galgame sprites; Greyfield V1 is explicitly Live2D |
| log159/LogChat | AI chat client reportedly combining LLM/TTS/STT/Live2D | Treat as a product-category reference for combined chat plus Live2D plus voice | The GitHub URL was inaccessible during review; do not depend on it as code source until the repository is verified locally |
| letta-ai/letta | Stateful-agent and memory platform | Memory blocks, persona/human separation, long-running stateful agent ideas, TS/Python client boundary | V1 should not outsource core memory to an opaque service or introduce self-improving agents |
| Artrajz/vits-simple-api | HTTP API for VITS/Bert-VITS2/GPT-SoVITS TTS | TTS service adapter shape: speakers list, model loading, language selection, audio format, streaming output, API key option | Do not make V1 require Python model setup, CUDA, admin panel, or large model downloads |
| ahmetoner/whisper-asr-webservice | Dockerized Whisper ASR REST service | ASR service adapter shape: CPU/GPU modes, model selection, VAD filtering, output formats, REST API, model cache | Do not make microphone acceptance depend on a heavy Docker service; keep fake/local adapters |
| Liniyous/ElaWidgetTools | Fluent-UI component library for Qt Widgets | Desktop settings/control-window patterns, modern native-looking widget vocabulary | Greyfield uses Electron/Vue in V1; do not introduce Qt just for UI styling |
| nlohmann/json | Modern C++ JSON library | If a future native C++ helper is added, prefer a proven JSON parser over ad hoc string parsing | Current TS packages should use typed schemas and normal JS/TS JSON APIs, not a C++ dependency |

## ZcChat / ZcChat2 Product Lessons

ZcChat and ZcChat2 are the most relevant references because they are explicitly AI desktop pet projects.

Use these lessons:

- AI desktop pet is a character performance product, not just a chat transport.
- Model response and voice synthesis should stream for faster perceived response.
- Voice interaction needs wake/direct chat/interruption paths.
- Character assets need an importable format, not hardcoded one-off paths.
- Long-term memory must be compressed or summarized; unbounded history is not viable.
- Character configuration should bind persona, visual body, voice, and model/provider settings.
- Tray/settings are expected because the pet surface must stay minimal.

Keep these boundaries:

- Greyfield V1 stays Live2D-first. Galgame standing art is a reference for expression staging, not a replacement for real `.model3.json` acceptance.
- Greyfield V1 does not include desktop control, screen reading, browser control, multimodal vision, plugin stores, or generalized system-level action.
- Do not copy GPL code into this repository without an explicit license decision. ZcChat2 and ZcChat are GPL-3.0 projects.

Sources:

- [ZcChat2](https://github.com/Zao-chen/ZcChat2)
- [ZcChat](https://github.com/Zao-chen/ZcChat)

## LogChat Product Lessons

LogChat is useful mainly as a category pointer: a combined AI chat client with LLM, TTS, STT, and Live2D. During review on 2026-05-24, `https://github.com/log159/LogChat` returned 404, so agents should not cite it as inspected source code unless they can fetch the repository in the current environment.

Use these lessons:

- A desktop companion can combine chat, voice, and Live2D in one client.
- Support for multiple chat providers is expected by this category.
- A Windows user should not need to assemble a Python environment just to try the app.

Do not copy blindly:

- Do not use unverified mirrors or summaries as implementation truth.
- Do not turn Greyfield V1 into a general AI chat client with many utilities.

Source found:

- [Toolerific LogChat summary](https://toolerific.ai/ai-tools/opensource/log159-LogChat)

## Memory Reference: Letta

Letta is relevant because desktop pets become more compelling when they remember the user and themselves over time.

Use these lessons:

- Separate persona memory from human/user memory.
- Treat memory as editable state, not hidden prompt sludge.
- Build adapters so memory can be local, cloud, or fake in tests.
- Memory injection must be capped and summarized.
- Memory needs privacy controls: inspect, edit, export, delete.

Do not copy blindly:

- Do not introduce stateful autonomous agents into V1.
- Do not require a Letta API key for the basic desktop pet.
- Do not let memory mutation happen invisibly without audit/debug visibility.

Source:

- [Letta](https://github.com/letta-ai/letta)

## TTS Reference: vits-simple-api

VITS-style services are good references for voice adapter contracts.

A Greyfield TTS adapter should account for:

- Base URL.
- API key or no-auth mode.
- Speaker/model list endpoint.
- Selected speaker ID or voice ID.
- Language mode, including mixed-language text.
- Audio format such as wav, mp3, ogg, flac.
- Speed/length/noise parameters only when supported.
- Streaming response support when available.
- Health check and readable model-load errors.

Do not copy blindly:

- Heavy TTS services can require CUDA, large model files, and Python dependency setup. They are optional integrations, not V1 prerequisites.
- Admin panels and public-network exposure need security review.
- Voice cloning or reference-audio presets require consent and clear user controls.

Source:

- [vits-simple-api](https://github.com/Artrajz/vits-simple-api)

## ASR Reference: whisper-asr-webservice

Whisper services are good references for speech-to-text adapter contracts.

A Greyfield ASR adapter should account for:

- Base URL.
- Engine/model selection.
- CPU/GPU device selection.
- Audio upload format.
- Output format, with plain text and JSON as minimum expectations.
- VAD filtering options.
- Timeout and model-cache behavior.
- Readable errors for missing FFmpeg, missing model, unsupported audio, or service unavailable.

Do not copy blindly:

- Do not require Docker or GPU for V1 tests.
- Do not assume microphone access works just because a REST ASR endpoint exists.
- Do not send audio to a cloud/local service without an explicit visible capture state and user consent.

Source:

- [whisper-asr-webservice](https://github.com/ahmetoner/whisper-asr-webservice)

## UI Reference: ElaWidgetTools

ElaWidgetTools is relevant as a reference for native desktop utility windows, not for the pet window itself.

Use these lessons:

- Settings windows benefit from a conventional desktop vocabulary: app bar, icon buttons, switches, dialogs, menus, tabs, tables, logs, and message bars.
- A settings/control window may have normal UI chrome and dense controls.
- The pet surface is different: it must remain transparent, frameless, and low-disruption.

Do not copy blindly:

- Do not introduce Qt into the V1 Electron/Vue stack.
- Do not style the pet shell like a normal application page.

Source:

- [ElaWidgetTools](https://github.com/Liniyous/ElaWidgetTools)

## C++ Utility Reference: nlohmann/json

nlohmann/json is relevant only if Greyfield later adds native C++ helpers.

Use these lessons:

- Use proven structured parsers for structured data.
- Prefer simple, well-tested libraries over ad hoc JSON/string parsing.
- Keep native dependencies isolated behind narrow adapters.

Do not copy blindly:

- Current V1 TypeScript code should use typed schemas and existing JS/TS JSON APIs.
- Do not add native build complexity unless there is a clear performance or platform reason.

Source:

- [nlohmann/json](https://github.com/nlohmann/json)

## V1 Integration Rules

For Greyfield V1, references can inform implementation only if they preserve these constraints:

- Desktop pet shell remains real transparent, frameless, draggable, and click-through aware.
- Live2D acceptance requires a real `.model3.json` path and non-fallback rendering.
- LLM, TTS, and ASR providers stay behind adapters with fake-provider tests.
- Memory remains local/inspectable/editable in V1 unless a separate feature explicitly changes that.
- Heavy services such as Letta, VITS, and Whisper are optional integrations, not startup requirements.
- No desktop control, browser control, screen reading, multi-agent autonomy, or plugin marketplace in V1.
