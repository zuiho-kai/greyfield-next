# Reference Solutions

Greyfield Next should copy constraints, not whole projects. This document records how the checked reference projects solve adjacent problems and what V1 should take from them.

## Desktop Pet Window

### AIRI

AIRI's desktop overlay is a visual overlay pattern: transparent, always-on-top, focusable false, and whole-window mouse pass-through with forwarded pointer movement. This is good for subtitles or passive stage overlays, but it is not enough for Greyfield's default pet mode because the model body must remain draggable and clickable while transparent pixels pass through.

Greyfield takeaway:

- Use AIRI for stage/runtime separation and settings/chat surface style.
- Do not use AIRI's whole-window pass-through as the only pet interaction model.

### ZcChat2

ZcChat2 is the closest match for the pet-body interaction problem. Its tachie window keeps a translucent frameless topmost surface, samples alpha to decide whether a click hits the character, and uses platform input-region shaping where that path is visually safe. The important idea is not "always shape the visible window"; it is "separate visual rendering from hit semantics as much as the platform allows."

Greyfield takeaway:

- Use final-frame alpha, not rectangle bounds, as the model mask.
- Prefer input-only semantics. Do not let an OS mask visually cut the model.
- Keep window movement separate from model scale and transform.

### ZcChat

Older ZcChat has useful product structure: separate character/tachie window, dialog window, tray menu, and settings-style UI. Its interaction model is less robust than ZcChat2, so it is a UX topology reference rather than the main implementation reference.

## Settings Shell

### ElaWidgetTools

ElaWidgetTools is useful as a desktop settings-shell reference: custom app bar, navigation, menus, stacked pages, and polished utility-window composition. It does not solve pet alpha hit testing.

Greyfield takeaway:

- Use it as inspiration for the settings window surface.
- Keep pet-window transparency and input shaping in the Electron stage path.

## Agent, Memory, ASR, TTS Boundaries

### Letta

Letta's useful lesson is strict runtime boundaries: agent state, memory blocks, tools, sources, secrets, and sandbox config are modeled separately. Greyfield V1 should keep persona and short memory typed and isolated, while tools/sandbox stay out of the desktop main process.

### vits-simple-api

vits-simple-api keeps TTS model families behind typed config and manager/adaptor boundaries. Greyfield should treat TTS as a provider service with streaming/segmentation behavior outside Electron main.

### whisper-asr-webservice

whisper-asr-webservice uses an engine selection boundary for ASR backends. Greyfield should keep ASR behind an adapter/factory and avoid mixing microphone, transcription, and UI decisions in one object.

### nlohmann/json

nlohmann/json is useful as a config discipline reference: structured conversions, explicit access patterns, and serious tests around serialization. Greyfield config should stay schema-checked and should avoid ad hoc string parsing.

## Current Decision

For Windows-first V1 pet interaction, Greyfield uses a ZcChat2-like product strategy but not the raw native-shape implementation as the default:

- renderer samples final alpha to decide model hit semantics;
- main applies `BrowserWindow.setIgnoreMouseEvents(passthrough, { forward: true })` from renderer hit-test events;
- drag starts only when renderer alpha says the pointer is on the model;
- main moves the native window with width/height locked so DPI rounding cannot grow the pet;
- `Model Pass Through` uses whole-window `setIgnoreMouseEvents(true, { forward: true })`;
- native `BrowserWindow.setShape(rects)` is disabled by default and only enabled with `GREYFIELD_ENABLE_NATIVE_SHAPE=1`.

Reason: Electron `setShape` on Windows is not input-only. It can clip the visible transparent window, create jagged Live2D edges, desync from animated model motion, and drift native bounds during drag. V1 prioritizes a visually clean desktop pet plus stable drag over perfect OS-level transparent holes inside the model bounding area. A future split visual/input window can revisit finer input regions without cutting the Live2D surface.
