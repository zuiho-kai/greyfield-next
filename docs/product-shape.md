# Greyfield Next Product Shape

This document is a hard product constraint for V1. A passing Live2D renderer is not enough; the app must behave like a standard desktop Live2D pet.

## Window Surfaces

Greyfield V1 has separate surfaces:

- `pet window`: transparent, frameless, always-on-top, no page frame, no settings panel, no document scrollbar. It renders only the Live2D model, speech bubble, and very small visible pet controls when needed.
- `settings window`: normal utility window for model, provider, voice, microphone, persona, persistence, and QA controls.
- `chat window`: normal conversation window for complete history and longer input. The pet window only shows short bubble text.

Tray and model context menus must be able to open settings, open chat, toggle model pass-through, hide the model, and quit.

## Hit Regions

The `Live2D area` is the whole transparent pet window/canvas.

The `model mask region` is the current frame's visible model pixels. It is a subset of the Live2D area and is determined from alpha hit testing, not from the window rectangle.

Default behavior:

- Transparent pixels pass mouse events through to the app underneath.
- Visible model pixels do not pass through. They can receive touch, drag, wheel, and right-click menu events.
- `Model Pass Through` makes visible model pixels pass through as well. It is display-only mode and must be reversible from tray/settings.

Electron main must not decide model business logic. Renderer sends:

- `window:set-hit-test` with the current renderer alpha hit result.
- `window:set-shape` only for explicit native-shape experiments, not the V1 default path.

On Windows V1, the primary path is dynamic `BrowserWindow.setIgnoreMouseEvents(passthrough, { forward: true })` driven by renderer alpha hit testing. This preserves the visual transparent window without clipping the Live2D model.

`BrowserWindow.setShape(rects)` is not the default path on Windows. It can clip the visible pet window, create jagged alpha edges, desync from animated Live2D motion, and cause DPI-related bounds drift during drag. It is available only behind `GREYFIELD_ENABLE_NATIVE_SHAPE=1` for future experiments.

The future ideal is a split visual/input architecture: one smooth transparent visual window plus a separate input region/window or native helper. That is outside the immediate V1 stabilization path.

## Dragging

Left-drag on the model mask region moves the pet window.

Dragging rules:

- Drag starts only from visible model pixels.
- Dragging moves `window.x/y`.
- Dragging must never write `live2d.scale`, `live2d.x`, or `live2d.y`.
- Dragging must preserve native window width/height; DPI rounding must be corrected in main.
- Dragging must release on pointer up, pointer cancel, window blur, or timeout recovery.
- Transparent area dragging does nothing because transparent area should pass through.

This separation exists because the previous generation created high-risk bugs where dragging caused resize/scale drift or locked the desktop.

## Wheel Scale

Wheel scaling is allowed in V1, but only on visible model pixels.

Rules:

- Scale range is bounded, currently `0.4..2.0`.
- Wheel input is throttled to avoid accidental runaway scale changes.
- Wheel scaling is disabled while dragging.
- Wheel scaling is disabled when `Model Pass Through` is enabled.
- Wheel scaling writes only `live2d.scale`.

## Speech Bubble

Speech bubble is enabled by default and can be disabled in settings.

Rules:

- Bubble appears in the pet window, anchored to the model mask region.
- Default side is upper-right.
- If the model is near the right edge, the bubble flips to upper-left.
- If top or bottom space is insufficient, the bubble clamps inside the screen/work area.
- Bubble shows short streaming text or the latest short reply only. Full conversation history belongs in the chat window.

## Reference Boundaries

- AIRI is the reference for settings/chat/menu feel and Electron stage/runtime separation.
- DigitalMate2D is the reference for desktop pet interaction: model context menu, tray menu, model body interaction, and wheel scaling.
- Old Greyfield is only a vision and failure-retro source. Do not copy its UX or implementation patterns into V1.
- ZcChat2 is the closest interaction implementation reference: alpha hit testing plus platform input-region shaping, with a temporary full-window region during drag.
- AIRI's desktop overlay is useful for visual-only overlay behavior, but it uses whole-window pass-through and is not sufficient by itself for an interactive desktop pet.

## Acceptance Rule

Live2D rendering is not desktop-pet acceptance. V1 desktop-pet acceptance requires transparent shell, model alpha hit testing, transparent-area pass-through, model drag, bounded wheel scale, context/tray recovery, and speech bubble placement.
