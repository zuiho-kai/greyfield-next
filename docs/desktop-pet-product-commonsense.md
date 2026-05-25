# Desktop Pet Product Commonsense

This note gives development and QA agents a product baseline for a Live2D desktop pet. Read it before changing desktop window behavior, Live2D rendering, model import, touch reactions, chat, voice, memory, or tests.

It is not a feature roadmap. It is a guardrail against basic category mistakes.

## One-Sentence Category Definition

A desktop pet is a persistent character presence on the user's desktop. It must feel alive while staying out of the user's way.

Do not reduce the product to a normal chat window with an avatar. The core surface is the character body living on the desktop: visible, movable, reactive, recoverable from tray/settings, and low-disruption during normal computer use.

## Non-Negotiable Desktop Pet Facts

These are basic desktop-pet facts. If an implementation violates them, treat it as a category failure, not a minor styling bug.

- The pet window is not a web page from the user's point of view. Electron, WebGL, Pixi, and Vue may be implementation details, but the visible product must not look or behave like a browser tab, web app panel, or rectangular page.
- The pet surface must have a real transparent background. No white page, black canvas rectangle, fake checkerboard, visible app background, or CSS gradient behind the model in the pet window.
- The pet window must not show scrollbars. A scrollbar around the Live2D model means the renderer is behaving like a web document instead of a desktop overlay.
- Transparent pixels are not interaction targets. Empty space around the model should pass mouse clicks to the app below, unless an explicit visible control is present.
- Model pixels and explicit handles are interaction targets. They may allow touch reactions, dragging, scaling, context menu, or other pet commands.
- The pet must be draggable when unlocked. If the model appears on screen but cannot be moved without opening a separate settings panel, the desktop-pet interaction is broken.
- Dragging must move the desktop pet/window, not scroll a page, select text, resize an HTML container, or only move the Live2D model inside a fixed browser-like frame.
- Click-through must be reversible without restarting. Users need a tray/menu/hotkey/settings path to get control back.
- A transparent full-window overlay that blocks the desktop is a serious bug, even if the model itself looks correct.
- The pet shell and the settings/chat shell are different surfaces. Settings can be a normal utility window; the pet itself must remain frameless, transparent, and low-disruption.

### Common Bad Outputs

Reject these outputs during review:

- "Live2D embedded in a web page": the character appears inside a normal rectangular page, web layout, or browser-like shell.
- "Live2D in a scrollable window": the character is inside a container with vertical or horizontal scrollbars.
- "Transparent-looking but click-blocking": the background looks transparent, but clicking empty space around the model does not reach the app below.
- "Static window pet": the character renders, but the user cannot drag or reposition it from the pet surface.
- "Frame pet": the pet has OS title bar chrome, resize borders, browser navigation, or a visible app panel around the character.
- "Model-only movement": dragging changes model offset inside the window but leaves an invisible window blocking the old rectangle.

## Reference Archetypes

### AIRI-like AI Companion

AIRI is closer to an AI virtual companion platform than a simple mascot. The relevant lessons for Greyfield V1 are:

- The desktop surface is called a Tamagotchi-style stage.
- It combines a character body with chat, voice, model switching, settings, and provider configuration.
- It treats Live2D and VRM as character bodies, with model settings such as scale, position, mouse tracking, idle animation, frame rate, auto blink, expressions, and cache reset.
- It exposes operations through the main character window and system tray: move, settings, chat, refresh, dark mode, topmost toggle, hover-to-hide/click-through style behavior, size presets, screen alignment, subtitles, and quit.
- Its AI path involves LLM providers, TTS, STT, API keys, service selection, and local/cloud distinctions. That means provider setup and credential safety are first-class UX concerns, not hidden implementation details.

Relevant sources:

- [Project AIRI GitHub](https://github.com/moeru-ai/airi)
- [Project AIRI desktop manual, Chinese](https://airi.moeru.ai/docs/zh-Hans/docs/manual/tamagotchi/setup-and-use/)
- [Project AIRI desktop contributing note](https://airi.moeru.ai/docs/en/docs/contributing/tamagotchi)

### QQ Pet-like Care Game

QQ Pet was a Windows desktop virtual pet and social/care game, not just an animation overlay. Its baseline concepts were:

- A persistent desktop pet bound to a larger service/community.
- Care verbs: feed, clean, work, study, play games, marry, lay eggs, travel, complete tasks.
- Growth and attachment: levels, online time, long-term state, social sharing, paid membership/status.
- Emotional stickiness came from care, memory, time investment, and the user's feeling that the character had a continuing life.
- A failure mode was nagging or interfering too much. Some users remembered it as charming, some as annoying. Modern desktop pets need explicit controls for pause, hide, quiet mode, click-through, and quit.

Relevant sources:

- [QQ Pet summary](https://zh.wikipedia.org/wiki/QQ%E5%AE%A0%E7%89%A9)
- [QQ Pet operations list via IT Home](https://www.ithome.com/0/545/572.htm)
- [QQ Pet shutdown announcement coverage via cnBeta](https://www.cnbeta.com.tw/articles/tech/741695.htm)
- [GameRes analysis of virtual pet attachment](https://www.gameres.com/822188.html)

### Steam Desktop Mascot Pattern

Steam desktop mascot products show the current PC-user expectation set:

- The base app may be free, with paid official character DLC.
- Licensed characters matter. Users expect recognizable IP, polished voice lines, and character-specific motions.
- Character actions include sitting on windows, chasing or reacting to the mouse cursor, reacting to clicks/head pats, telling time or alarm events, and sometimes reacting to another game.
- Multi-character display and pair-specific interactions are a natural extension.
- The product must not disrupt normal work. Size, edge hiding, quiet behavior, and long-session comfort are part of the product, not polish.
- Steam Workshop or a similar import/subscription flow can turn character models, persona cards, and world books into user content.

Relevant sources:

- [Desktop Mate on Steam](https://store.steampowered.com/app/3301060/Desktop_Mate/)
- [AI Desktop Pet on Steam](https://store.steampowered.com/app/4227700/AI_Desktop_Pet/)

## Product Rules

### Presence

The character must have desktop presence:

- Transparent, frameless character window.
- Always-on-top behavior that can be toggled.
- Drag or move mode from the pet surface when unlocked.
- Recoverability from tray or settings if hidden or moved off-screen.
- Clear quit/close path.
- Stable size and position across restarts.
- Multi-monitor and DPI-aware positioning.
- No title bar, browser chrome, visible page frame, or document scrollbar in the pet window.

The character should not feel like a modal app. If it steals focus, blocks clicks, covers important UI, or cannot be dismissed quickly, it violates the category.

### Low Disruption

A desktop pet lives on top of the user's real work. Therefore:

- Pointer passthrough/click-through is mandatory when the pet is idle or locked.
- Interactive mode must be explicit or bounded to the visible character silhouette and visible controls.
- Hover-to-hide, edge tuck, opacity, scale, lock/unlock, and pause/quiet controls are expected.
- Voice, sound effects, alarms, and proactive messages must have volume, mute, and schedule controls.
- The app must never trap the user behind an invisible full-screen overlay.

Electron note: `BrowserWindow.setIgnoreMouseEvents(true)` passes mouse events to windows below, but it applies to the whole window. If the app needs only the character silhouette to be clickable, implement alpha or hit-area logic that toggles passthrough by visible model pixels instead of assuming transparent pixels are harmless.

Relevant source:

- [Electron BrowserWindow setIgnoreMouseEvents](https://www.electronjs.org/docs/api/browser-window)

### Alive Behavior

The character should have a minimum living loop even without AI:

- Idle breathing or idle motion.
- Auto blink.
- Cursor or gaze tracking.
- Touch/click reactions.
- Expression changes.
- Motion group selection.
- Mouth movement when speaking.
- A non-speaking idle state after response playback.

QA should reject a build where the model is merely a static PNG or fallback drawing unless the feature under test explicitly says fallback preview is allowed.

### Chat And Voice

For AI companion behavior:

- Text input should stream partial assistant output.
- TTS should start at sentence boundaries rather than waiting for the full response.
- Interrupt must stop generation, queued TTS, active playback, subtitles, and mouth-open animation.
- STT and microphone state must be visible and testable.
- API keys must never appear in logs, screenshots, exported sessions, or crash reports.
- Local/offline and cloud/provider modes must be explicit to the user.
- Conversation data and persona/memory data should have import, export, and delete paths before the product becomes sticky.

The character body should react to the conversation. A response with no expression, mouth, gaze, or motion change feels disconnected.

### Persona And Memory

The user is not only configuring a chatbot. They are configuring a character:

- Persona fields should include name, nickname, description, personality, scenario, greeting, boundaries, and voice/model binding.
- Memory should be scoped, inspectable, editable, and erasable.
- Recent session continuity should be capped. Infinite memory injection creates latency, privacy, and behavior drift problems.
- Character-specific reactions should be profile-driven, not hardcoded into the renderer.

### Care Loop

QQ Pet and Tamagotchi-style products teach a separate lesson from AI chat:

- Users attach to visible state changes over time: mood, hunger, cleanliness, energy, growth, affection, skills, gifts, travel, and milestones.
- Care verbs need feedback. If the user feeds, pats, cleans, or plays, the character should visibly respond.
- Neglect mechanics are risky on desktop. Use gentle signals and reversible states rather than punishing the user or spamming reminders.
- Long-term state must survive restarts. Losing pet state breaks trust.

V1 of Greyfield does not need a full care game, but agents should understand why touch, memory, and continuity matter.

### Live2D Asset Reality

Live2D models are structured runtime assets, not arbitrary images:

- `.model3.json` is the model settings manifest.
- `.moc3` is runtime model data.
- Textures are usually `.png`.
- `.physics3.json` contains physics settings.
- `.motion3.json` contains motion data.
- `.exp3.json` contains expression data.
- `.pose3.json` can be used for pose or part switching.

Model import must parse the manifest and resolve referenced files. Do not guess file paths by string hacks if a structured parser can do it.

Old Cubism models or random VTuber Studio zips may be missing files or contain unsupported structure. Import errors must be actionable: say which file is missing, unsupported, or unreadable.

Relevant sources:

- [Live2D file types and extensions](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)
- [AIRI model import notes](https://airi.moeru.ai/docs/zh-Hans/docs/manual/tamagotchi/setup-and-use/)

### License And Rights

Do not assume models, voices, character designs, or motions are free to redistribute.

- Live2D SDK publishing can require license review, especially for expandable applications.
- Sample models often have their own terms and may be demo-only.
- Steam-style character DLC usually depends on official IP licensing.
- Voice cloning requires user consent and clear boundaries.
- Workshop/user content needs moderation, reporting, and copyright policy before public release.

Relevant source:

- [Live2D expandable application publication license page](https://www.live2d.jp/chn/application-publication-license/)

## QA Checklist

### Desktop Shell

- Launch produces a transparent, frameless pet window, not a normal rectangular app.
- The pet window has no document scrollbars in any viewport, DPI scale, or model scale.
- The visible pet surface is the Live2D model and explicit controls only; there is no page/card/frame around it.
- Window remains recoverable from tray/settings after hide, click-through, move, resize, or off-screen placement.
- Always-on-top can be toggled.
- Locked or transparent idle areas do not block clicks to apps underneath.
- Interactive model pixels allow expected touches, drags, and buttons.
- Dragging while unlocked moves the desktop pet/window, not a scroll container or only the model inside a stale invisible window.
- Click-through can be turned back off from tray/settings without restarting.
- Close and quit behave differently only if the product clearly defines that difference.
- State persists across restart: position, size, model, provider settings, voice, and mute/quiet state.

### Live2D Stage

- A real `.model3.json` loads.
- The renderer proves non-transparent WebGL pixels and frame changes.
- Fallback preview is not counted as Live2D acceptance.
- Scale and position settings affect the real stage.
- Auto blink, gaze/cursor tracking, idle motion, expression, touch motion, and mouth-open can be triggered.
- Touch hit areas obey deterministic priority.
- Missing model files produce readable errors.

### Interaction

- Pat/click/touch changes expression or motion.
- Dragging the character does not trigger accidental touch reactions forever.
- Click-through can be toggled back without restarting.
- The character does not steal keyboard focus during normal typing in another app.
- Subtitles or speech bubbles do not cover the pet face or important controls.
- Long messages wrap and stay on screen.

### AI Runtime

- Fake providers can run the full text-to-response-to-stage-event path without network credentials.
- Streaming output appears before final response.
- Sentence-level TTS begins before full response completion.
- Interrupt stops future chunks, playback, subtitles, and mouth-open state.
- Provider errors leave the character in a sane idle/error state.
- Offline/local mode does not make network requests for core inference.
- API keys and prompts are not leaked in logs.

### Performance

- One character should not noticeably degrade normal desktop work.
- Frame rate and animation intensity should be configurable.
- Multi-character mode, if added later, must scale resource budgets explicitly.
- The app should idle cheaply when hidden, tucked, muted, or paused.

### Privacy And Data

- User can locate, export, and delete conversation/session data.
- User can reset provider credentials.
- Microphone capture has a visible state and explicit consent.
- Crash/usage analytics are opt-in or clearly controlled.
- Logs redact secrets.

## Common Agent Mistakes To Avoid

- Treating desktop pet as only a chat panel.
- Replacing Live2D with a static placeholder and calling the feature done.
- Letting transparent pixels block the user's desktop.
- Hiding all controls inside the pet body with no tray recovery path.
- Hardcoding one model's expression or motion names.
- Assuming every `.zip` contains a valid Cubism 3/4/5 model.
- Triggering TTS only after the full LLM response.
- Making interrupt stop text but not audio, subtitles, or mouth movement.
- Logging API keys, persona cards, full prompts, or conversation data.
- Adding browser control, desktop control, multi-agent systems, or livestream behavior into V1.
- Shipping a care loop that nags, punishes, or blocks work without clear quiet controls.

## Greyfield V1 Interpretation

For this repository, V1 should stay narrow:

- Real Live2D desktop pet window.
- Text input to streaming assistant response.
- Sentence-level TTS.
- Interruptible generation and playback.
- Persona, short memory, and recent session continuity.
- Deterministic fake providers and executable harness checks.

Do not add full QQ Pet-style economy, social systems, game control, screen reading, browser control, or long-running task orchestration until the core alive desktop companion loop is stable and tested.
