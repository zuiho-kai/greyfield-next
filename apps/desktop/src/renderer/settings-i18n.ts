import { normalizeGreyfieldLocale, type GreyfieldLocale } from "@greyfield/persistence/config-schema";

export type SettingsLocale = GreyfieldLocale;

export const settingsLocales: Array<{ value: SettingsLocale; label: string }> = [
  { value: "en-US", label: "English" },
  { value: "zh-CN", label: "简体中文" }
];

export type SettingsI18nKey =
  | "nav.label"
  | "nav.model"
  | "nav.voice"
  | "nav.window"
  | "nav.persona"
  | "nav.provider"
  | "nav.memory"
  | "nav.chat"
  | "app.status"
  | "settings.label"
  | "settings.language"
  | "section.persona"
  | "section.provider"
  | "section.voice"
  | "section.model"
  | "section.window"
  | "section.memoryExtraction"
  | "section.memoryLibrary"
  | "section.modelInfo"
  | "field.name"
  | "field.user"
  | "field.personality"
  | "field.speakingStyle"
  | "field.boundaries"
  | "field.greeting"
  | "field.provider"
  | "field.taskModelSlots"
  | "field.taskModelSlots.detail"
  | "field.baseUrl"
  | "field.apiKey"
  | "field.model"
  | "field.visionModel"
  | "field.asr"
  | "field.asrModel"
  | "field.tts"
  | "field.ttsModel"
  | "taskModel.chat.label"
  | "taskModel.chat.detail"
  | "taskModel.planner.label"
  | "taskModel.planner.detail"
  | "taskModel.utility.label"
  | "taskModel.utility.detail"
  | "taskModel.memory.label"
  | "taskModel.memory.detail"
  | "taskModel.vision.label"
  | "taskModel.vision.detail"
  | "taskModel.multimodal.label"
  | "taskModel.multimodal.detail"
  | "taskModel.voiceAsr.label"
  | "taskModel.voiceAsr.detail"
  | "taskModel.voiceTts.label"
  | "taskModel.voiceTts.detail"
  | "field.voice"
  | "field.speak"
  | "field.volume"
  | "field.mic"
  | "field.character"
  | "field.scale"
  | "field.windowLayerMode"
  | "field.bubble"
  | "field.rememberedMoments"
  | "field.proactivity"
  | "field.betterMemory"
  | "windowLayerMode.followClick"
  | "windowLayerMode.controlsFront"
  | "windowLayerMode.petFront"
  | "button.savePersona"
  | "button.saving"
  | "button.importModel"
  | "button.resetTransform"
  | "button.refreshMemory"
  | "button.refreshing"
  | "button.exportLibrary"
  | "button.clearSummary"
  | "button.clearAtoms"
  | "button.chat"
  | "status.on"
  | "status.off"
  | "status.bubbleOn"
  | "status.bubbleOff"
  | "status.proactivity"
  | "status.custom"
  | "status.loading"
  | "status.saving"
  | "status.saved"
  | "status.needsFix"
  | "status.ready"
  | "status.refreshing"
  | "status.notLoaded"
  | "status.enabled"
  | "status.idle"
  | "status.listening"
  | "status.thinking"
  | "status.speaking"
  | "status.interrupted"
  | "status.error"
  | "provider.fakePreview"
  | "provider.openaiCompatible"
  | "provider.localFallback"
  | "provider.savedApiKey"
  | "provider.preview.label"
  | "provider.preview.detail"
  | "provider.baseUrl.label"
  | "provider.baseUrl.detail"
  | "provider.apiKey.label"
  | "provider.apiKey.detail"
  | "provider.model.label"
  | "provider.model.detail"
  | "provider.visionModel.label"
  | "provider.visionModel.detail"
  | "provider.ready.label"
  | "provider.ready.detail"
  | "memory.standard.label"
  | "memory.standard.detail"
  | "memory.fallback.label"
  | "memory.betterUsed.label"
  | "memory.betterUsed.detail"
  | "memory.noSaved.label"
  | "memory.ready.label"
  | "memory.ready.detail"
  | "memory.needsProvider"
  | "memory.needsBaseUrl"
  | "memory.needsApiKey"
  | "memory.needsModel"
  | "memory.about.title"
  | "memory.about.detail"
  | "memory.status.loading"
  | "memory.status.loading.detail"
  | "memory.status.notLoaded"
  | "memory.status.notLoaded.detail"
  | "memory.status.empty"
  | "memory.status.empty.detail"
  | "memory.status.saved"
  | "memory.status.saved.detail"
  | "memory.manage.title"
  | "memory.manage.detail"
  | "memory.controls.title"
  | "memory.controls.detail"
  | "memory.advanced.summary"
  | "memory.savedMemories"
  | "memory.types.label"
  | "memory.type.summary"
  | "memory.type.facts"
  | "memory.type.fact"
  | "memory.type.preferences"
  | "memory.type.preference"
  | "memory.type.opinions"
  | "memory.type.opinion"
  | "memory.type.relationships"
  | "memory.type.relationship"
  | "memory.type.scenes"
  | "memory.type.scene"
  | "memory.type.promises"
  | "memory.type.promise"
  | "memory.type.memory"
  | "memory.stored"
  | "memory.stats.rawTurns"
  | "memory.stats.enabled"
  | "memory.stats.disabled"
  | "memory.state.enabled"
  | "memory.state.disabled"
  | "memory.source.drilldown"
  | "memory.source.kind.summary"
  | "memory.source.kind.atom"
  | "memory.source.close"
  | "memory.source.passage"
  | "memory.source.longShortened"
  | "memory.source.noOriginal"
  | "memory.source.none"
  | "memory.source.saved.one"
  | "memory.source.saved.many"
  | "memory.source.ready.one"
  | "memory.source.ready.many"
  | "memory.source.someReady"
  | "memory.source.unavailable.one"
  | "memory.source.unavailable.many"
  | "memory.source.heading.unavailable"
  | "memory.source.heading.assistant"
  | "memory.source.heading.user"
  | "memory.source.heading.system"
  | "memory.source.heading.event"
  | "memory.source.heading.conversation"
  | "memory.source.status.saved"
  | "memory.source.status.missing"
  | "memory.source.status.unavailable"
  | "memory.source.meta.availableWithTime"
  | "memory.source.meta.available"
  | "memory.source.meta.missingWithTime"
  | "memory.source.meta.missing"
  | "memory.source.meta.unavailableWithTime"
  | "memory.source.meta.unavailable"
  | "memory.source.body.missing"
  | "memory.source.body.empty"
  | "memory.recall.matched"
  | "memory.recall.cue"
  | "memory.recall.cueFallback"
  | "memory.recall.semantic"
  | "memory.field.text"
  | "memory.field.recallCues"
  | "memory.action.save"
  | "memory.action.enable"
  | "memory.action.disable"
  | "memory.action.delete"
  | "memory.action.export"
  | "memory.action.viewSource"
  | "memory.summaryMemory"
  | "memory.atomMemories"
  | "memory.summaryMemories"
  | "memory.meta.source"
  | "memory.meta.lastUsed"
  | "memory.meta.updated"
  | "memory.meta.group"
  | "memory.empty"
  | "memory.lastRecalled"
  | "memory.export.label"
  | "test.llm"
  | "test.llm.testing"
  | "test.voice"
  | "test.voice.testing"
  | "test.llm.status"
  | "test.llm.detail"
  | "test.succeeded"
  | "test.failed"
  | "test.voice.succeeded"
  | "test.voice.failed"
  | "test.provider.firstToken"
  | "test.provider.replied"
  | "voice.blocked.baseUrl"
  | "voice.blocked.apiKey"
  | "voice.blocked.ttsModel"
  | "voice.blocked.voice"
  | "voice.status.testing"
  | "voice.status.testingDetail"
  | "live2d.usingBundled"
  | "live2d.usingCustom"
  | "live2d.customModel"
  | "toggle.modelPassThrough"
  | "toggle.lock"
  | "chat.title"
  | "chat.settings"
  | "chat.visualObservation"
  | "chat.look"
  | "chat.frame.one"
  | "chat.frame.many"
  | "chat.observationAlt"
  | "chat.captureOnce"
  | "chat.observeLow"
  | "chat.observeNormal"
  | "chat.observeHigh"
  | "chat.startHigh"
  | "chat.endObservation"
  | "chat.clearObservation"
  | "chat.justNow"
  | "chat.message"
  | "chat.placeholder"
  | "chat.observationIdle"
  | "chat.voice.stopMic"
  | "chat.voice.transcribing"
  | "chat.voice"
  | "chat.status.generating.label"
  | "chat.status.generating.waiting"
  | "chat.status.generating.replying"
  | "chat.status.generating.speaking"
  | "chat.status.stopped.label"
  | "chat.status.stopped.detail"
  | "chat.status.failed.retryLabel"
  | "chat.status.failed.label"
  | "chat.status.failed.retryDetail"
  | "chat.status.failed.detail"
  | "chat.status.listening.detail"
  | "chat.status.waiting.label"
  | "chat.status.waiting.detail"
  | "chat.action.send"
  | "chat.action.retry"
  | "chat.action.stop"
  | "chat.action.stopped"
  | "controls.shell"
  | "controls.panel"
  | "controls.move"
  | "controls.expand"
  | "controls.collapse"
  | "controls.message"
  | "controls.placeholder"
  | "controls.send"
  | "controls.actions"
  | "controls.openSettings"
  | "controls.hide"
  | "controls.quit"
  | "controls.stop"
  | "controls.mic.start"
  | "controls.mic.stop"
  | "controls.mic.transcribing"
  | "controls.voice.on"
  | "controls.voice.off"
  | "controls.screenAwareness.on"
  | "controls.screenAwareness.off"
  | "controls.passThrough.on"
  | "controls.passThrough.off";

const enUS: Record<SettingsI18nKey, string> = {
  "nav.label": "Settings sections",
  "nav.model": "Live2D",
  "nav.voice": "Voice",
  "nav.window": "Window",
  "nav.persona": "Persona",
  "nav.provider": "Model service",
  "nav.memory": "Memory",
  "nav.chat": "Chat",
  "app.status": "Status",
  "settings.label": "Settings",
  "settings.language": "Language",
  "section.persona": "Persona",
  "section.provider": "Model service",
  "section.voice": "Voice",
  "section.model": "Live2D avatar",
  "section.window": "Window",
  "section.memoryExtraction": "How memory works",
  "section.memoryLibrary": "Saved memories",
  "section.modelInfo": "Live2D",
  "field.name": "Name",
  "field.user": "User",
  "field.personality": "Personality",
  "field.speakingStyle": "Speaking style",
  "field.boundaries": "Boundaries",
  "field.greeting": "Greeting",
  "field.provider": "Service type",
  "field.taskModelSlots": "Task models",
  "field.taskModelSlots.detail": "Choose the model Greyfield uses for chat replies, visual understanding, and voice-related tasks.",
  "field.baseUrl": "Base URL",
  "field.apiKey": "API Key",
  "field.model": "Live2D model",
  "field.visionModel": "Vision model",
  "field.asr": "ASR",
  "field.asrModel": "ASR Model",
  "field.tts": "TTS",
  "field.ttsModel": "TTS Model",
  "taskModel.chat.label": "Chat reply",
  "taskModel.chat.detail": "Normal messages use this model. Test LLM checks this slot.",
  "taskModel.planner.label": "Planning / proactive",
  "taskModel.planner.detail": "Reserved for proactive planning and initiative decisions.",
  "taskModel.utility.label": "Tools / helper",
  "taskModel.utility.detail": "Reserved for small helper/tool tasks; not used by current V1 tools yet.",
  "taskModel.memory.label": "Memory",
  "taskModel.memory.detail": "Better memory can use this slot later; current extraction still falls back safely when provider config is incomplete.",
  "taskModel.vision.label": "Vision / VLM",
  "taskModel.vision.detail": "Screenshots and Screen awareness visual context use this model first.",
  "taskModel.multimodal.label": "Multimodal",
  "taskModel.multimodal.detail": "Fallback for visual turns when Vision is empty; reserved for richer image/audio tasks.",
  "taskModel.voiceAsr.label": "Voice ASR",
  "taskModel.voiceAsr.detail": "Voice transcription model slot; provider wiring stays in Voice settings.",
  "taskModel.voiceTts.label": "Voice TTS",
  "taskModel.voiceTts.detail": "Voice playback model slot; full ASR/TTS routing remains reserved.",
  "field.voice": "Voice",
  "field.speak": "Speak",
  "field.volume": "Volume",
  "field.mic": "Mic",
  "field.character": "Character",
  "field.scale": "Scale",
  "field.windowLayerMode": "Canvas layering",
  "field.bubble": "Bubble",
  "field.rememberedMoments": "Remembered moments",
  "field.proactivity": "Proactivity",
  "field.betterMemory": "Better memory",
  "windowLayerMode.followClick": "By click (default)",
  "windowLayerMode.controlsFront": "Input box stays in front",
  "windowLayerMode.petFront": "Model stays in front",
  "button.savePersona": "Save persona",
  "button.saving": "Saving...",
  "button.importModel": "Import Live2D model",
  "button.resetTransform": "Reset transform",
  "button.refreshMemory": "Refresh memory",
  "button.refreshing": "Refreshing...",
  "button.exportLibrary": "Export library",
  "button.clearSummary": "Clear summary memory",
  "button.clearAtoms": "Clear detailed memories",
  "button.chat": "Chat",
  "status.on": "On",
  "status.off": "Off",
  "status.bubbleOn": "Bubble on",
  "status.bubbleOff": "Bubble off",
  "status.proactivity": "Proactivity {level}/100",
  "status.custom": "Custom",
  "status.loading": "Loading",
  "status.saving": "Saving",
  "status.saved": "Saved",
  "status.needsFix": "Needs fix",
  "status.ready": "Ready",
  "status.refreshing": "Refreshing",
  "status.notLoaded": "Not loaded",
  "status.enabled": "enabled",
  "status.idle": "Idle",
  "status.listening": "Listening",
  "status.thinking": "Thinking",
  "status.speaking": "Speaking",
  "status.interrupted": "Interrupted",
  "status.error": "Error",
  "provider.fakePreview": "Fake preview",
  "provider.openaiCompatible": "OpenAI-compatible",
  "provider.localFallback": "Local fallback",
  "provider.savedApiKey": "Saved API key",
  "provider.preview.label": "Preview",
  "provider.preview.detail": "Fake provider is active. Use OpenAI-compatible for a real LLM chat.",
  "provider.baseUrl.label": "Needs Base URL",
  "provider.baseUrl.detail": "OpenAI-compatible chat needs a Base URL such as https://host/v1.",
  "provider.apiKey.label": "Needs API key",
  "provider.apiKey.detail": "Add an API key before testing or chatting with the real provider.",
  "provider.model.label": "Needs model",
  "provider.model.detail": "Choose the provider model name before testing the LLM.",
  "provider.visionModel.label": "Vision not configured",
  "provider.visionModel.detail": "Screen awareness needs a Vision model. Leave it empty to keep screenshots unavailable instead of sending them to the Chat model.",
  "provider.ready.label": "Ready to test",
  "provider.ready.detail": "Provider settings are complete. Run Test LLM before a real chat.",
  "memory.standard.label": "Basic memory on",
  "memory.standard.detail": "Greyfield still saves simple local memories such as names, dates, and preferences.",
  "memory.fallback.label": "Using basic memory",
  "memory.betterUsed.label": "Remembered more detail",
  "memory.betterUsed.detail": "The last message also used the chat provider to notice richer details. Basic local memory stayed available.",
  "memory.noSaved.label": "Nothing new to remember",
  "memory.ready.label": "Ready to remember more detail",
  "memory.ready.detail": "Greyfield can use the chat provider to notice richer details when helpful. If it fails, basic local memory keeps running.",
  "memory.needsProvider": "Remember more details needs the OpenAI-compatible chat provider. Basic local memory stays on until the provider is ready.",
  "memory.needsBaseUrl": "Remember more details needs a chat provider Base URL. Basic local memory stays on until the provider is ready.",
  "memory.needsApiKey": "Remember more details needs a saved API key. Basic local memory stays on until the provider is ready.",
  "memory.needsModel": "Remember more details needs a memory model name. Basic local memory stays on until the provider is ready.",
  "memory.about.title": "What this is",
  "memory.about.detail": "Greyfield saves small reminders from local chats so later replies can feel more continuous.",
  "memory.status.loading": "Refreshing saved memories",
  "memory.status.loading.detail": "Greyfield is checking the latest local memory for this character.",
  "memory.status.notLoaded": "Saved memories not loaded",
  "memory.status.notLoaded.detail": "Refresh to load the current memory library for this character.",
  "memory.status.empty": "No memories yet",
  "memory.status.empty.detail": "After a few chats, Greyfield can keep useful details like your preferences, plans, and recurring context here.",
  "memory.status.saved": "{count} memories saved",
  "memory.status.saved.detail": "Greyfield can reuse these details in later chats. Open any item if you want to review or change it.",
  "memory.manage.title": "What you can do",
  "memory.manage.detail": "Open a memory to review its source, edit it, turn it off, or delete it. Detailed memories can also be exported one by one.",
  "memory.controls.title": "Advanced memory controls",
  "memory.controls.detail": "Exports include memory text and related messages. Delete and clear remove this library only, not raw chat history; provider credentials stay out.",
  "memory.advanced.summary": "Show advanced details",
  "memory.savedMemories": "Saved memories",
  "memory.types.label": "Memory groups",
  "memory.type.summary": "Summary",
  "memory.type.facts": "Facts",
  "memory.type.fact": "Fact",
  "memory.type.preferences": "Preferences",
  "memory.type.preference": "Preference",
  "memory.type.opinions": "Opinions",
  "memory.type.opinion": "Opinion",
  "memory.type.relationships": "Relationships",
  "memory.type.relationship": "Relationship",
  "memory.type.scenes": "Scenes",
  "memory.type.scene": "Scene",
  "memory.type.promises": "Promises",
  "memory.type.promise": "Promise",
  "memory.type.memory": "Memory",
  "memory.stored": "{count} stored",
  "memory.stats.rawTurns": "Raw turns {count}",
  "memory.stats.enabled": "Enabled {count}",
  "memory.stats.disabled": "Disabled {count}",
  "memory.state.enabled": "Enabled",
  "memory.state.disabled": "Disabled",
  "memory.source.drilldown": "Memory details",
  "memory.source.kind.summary": "Summary memory source",
  "memory.source.kind.atom": "{type} memory source",
  "memory.source.close": "Close",
  "memory.source.passage": "Source passage {index}",
  "memory.source.longShortened": "Long source shortened for display.",
  "memory.source.noOriginal": "No original message is linked to this memory.",
  "memory.source.none": "No saved source",
  "memory.source.saved.one": "1 saved source",
  "memory.source.saved.many": "{count} saved sources",
  "memory.source.ready.one": "1 source passage ready",
  "memory.source.ready.many": "{count} source passages ready",
  "memory.source.someReady": "{available} of {total} source passages ready",
  "memory.source.unavailable.one": "1 saved source unavailable here",
  "memory.source.unavailable.many": "{count} saved sources unavailable here",
  "memory.source.heading.unavailable": "Original message unavailable",
  "memory.source.heading.assistant": "From Greyfield",
  "memory.source.heading.user": "From you",
  "memory.source.heading.system": "From a local system note",
  "memory.source.heading.event": "From an app event",
  "memory.source.heading.conversation": "From the conversation",
  "memory.source.status.saved": "Saved locally",
  "memory.source.status.missing": "Original message not found",
  "memory.source.status.unavailable": "Not available in this session",
  "memory.source.meta.availableWithTime": "Saved from conversation on {timestamp}",
  "memory.source.meta.available": "Saved from the local conversation",
  "memory.source.meta.missingWithTime": "Greyfield remembers the source from {timestamp}",
  "memory.source.meta.missing": "Greyfield saved a source link for this memory",
  "memory.source.meta.unavailableWithTime": "Greyfield remembers a source from another local session on {timestamp}",
  "memory.source.meta.unavailable": "Greyfield saved a source link from another local session",
  "memory.source.body.missing": "The original message is not available in this local session store.",
  "memory.source.body.empty": "No message text is saved for this source.",
  "memory.recall.matched": "Matched this memory",
  "memory.recall.cue": "Matched recall cue \"{cue}\"",
  "memory.recall.cueFallback": "Matched a recall cue",
  "memory.recall.semantic": "Semantic match",
  "memory.field.text": "Remembered text",
  "memory.field.recallCues": "Words to bring this back",
  "memory.action.save": "Save",
  "memory.action.enable": "Enable",
  "memory.action.disable": "Disable",
  "memory.action.delete": "Delete",
  "memory.action.export": "Export",
  "memory.action.viewSource": "Open details",
  "memory.summaryMemory": "Summary memory",
  "memory.atomMemories": "Atom memories",
  "memory.summaryMemories": "Summary memories",
  "memory.meta.source": "Source",
  "memory.meta.lastUsed": "Last used",
  "memory.meta.updated": "Updated",
  "memory.meta.group": "Group",
  "memory.empty": "No memories yet.",
  "memory.lastRecalled": "Last recalled memory",
  "memory.export.label": "Memory library export",
  "test.llm": "Test LLM",
  "test.llm.testing": "Testing...",
  "test.voice": "Test Voice",
  "test.voice.testing": "Testing voice...",
  "test.llm.status": "Testing LLM",
  "test.llm.detail": "Sending a small prompt. This should finish in a moment.",
  "test.succeeded": "Test succeeded",
  "test.failed": "Test failed",
  "test.voice.succeeded": "Voice test succeeded",
  "test.voice.failed": "Voice test failed",
  "test.provider.firstToken": "Received first token: {token}. Real chat can use this provider.",
  "test.provider.replied": "The provider replied. Real chat can use this provider.",
  "voice.blocked.baseUrl": "OpenAI-compatible voice needs a Base URL before testing.",
  "voice.blocked.apiKey": "Voice test needs an API key.",
  "voice.blocked.ttsModel": "Choose the TTS model name before testing voice.",
  "voice.blocked.voice": "Choose the voice before testing.",
  "voice.status.testing": "Testing voice",
  "voice.status.testingDetail": "Testing voice playback...",
  "live2d.usingBundled": "Using bundled model: {label}.",
  "live2d.usingCustom": "Using custom model: {path}",
  "live2d.customModel": "Custom model",
  "toggle.modelPassThrough": "Model Pass Through",
  "toggle.lock": "Lock",
  "chat.title": "Chat",
  "chat.settings": "Settings",
  "chat.visualObservation": "Visual observation",
  "chat.look": "Look",
  "chat.frame.one": "1 frame",
  "chat.frame.many": "{count} frames",
  "chat.observationAlt": "Temporary observation preview",
  "chat.captureOnce": "Shot",
  "chat.observeLow": "Low",
  "chat.observeNormal": "Mid",
  "chat.observeHigh": "High",
  "chat.startHigh": "High",
  "chat.endObservation": "End",
  "chat.clearObservation": "Clear",
  "chat.justNow": "just now",
  "chat.message": "Message",
  "chat.placeholder": "Type your message...",
  "chat.observationIdle": "Screenshots are temporary and only sent after you confirm with a message.",
  "chat.voice.stopMic": "Stop Mic",
  "chat.voice.transcribing": "Transcribing",
  "chat.voice": "Voice",
  "chat.status.generating.label": "Generating",
  "chat.status.generating.waiting": "Waiting for the reply to start.",
  "chat.status.generating.replying": "Greyfield is replying. Stop stays available while this runs.",
  "chat.status.generating.speaking": "Greyfield is still speaking. Stop will interrupt the current voice playback.",
  "chat.status.stopped.label": "Stopped",
  "chat.status.stopped.detail": "The last reply was stopped. Send again when ready.",
  "chat.status.failed.retryLabel": "Retry ready",
  "chat.status.failed.label": "Failed",
  "chat.status.failed.retryDetail": "The failed message is back in the message box.",
  "chat.status.failed.detail": "Something went wrong. Check the message above, then try again.",
  "chat.status.listening.detail": "Listening for input.",
  "chat.status.waiting.label": "Waiting",
  "chat.status.waiting.detail": "Ready for your next message.",
  "chat.action.send": "Send",
  "chat.action.retry": "Retry",
  "chat.action.stop": "Stop",
  "chat.action.stopped": "Stopped",
  "controls.shell": "Greyfield desktop controls",
  "controls.panel": "Desktop pet controls",
  "controls.move": "Move desktop controls",
  "controls.expand": "Expand controls",
  "controls.collapse": "Collapse controls",
  "controls.message": "Desktop message",
  "controls.placeholder": "Message Greyfield...",
  "controls.send": "Send message",
  "controls.actions": "Desktop pet quick actions",
  "controls.openSettings": "Open Settings",
  "controls.hide": "Hide controls",
  "controls.quit": "Quit Greyfield and stop background processes",
  "controls.stop": "Stop reply or voice",
  "controls.mic.start": "Start microphone input",
  "controls.mic.stop": "Stop microphone input",
  "controls.mic.transcribing": "Transcribing microphone input",
  "controls.voice.on": "Turn voice output on",
  "controls.voice.off": "Turn voice output off",
  "controls.screenAwareness.on": "Turn Screen awareness on",
  "controls.screenAwareness.off": "Turn Screen awareness off",
  "controls.passThrough.on": "Model is click-through; use tray or settings to restore if needed",
  "controls.passThrough.off": "Make model click-through"
};

const zhCN: Partial<Record<SettingsI18nKey, string>> = {
  "nav.label": "设置分区",
  "nav.model": "形象",
  "nav.voice": "语音",
  "nav.window": "窗口",
  "nav.persona": "人格",
  "nav.provider": "模型服务",
  "nav.memory": "记忆",
  "nav.chat": "聊天",
  "app.status": "状态",
  "settings.label": "设置",
  "settings.language": "语言",
  "section.persona": "人格",
  "section.provider": "模型服务",
  "section.voice": "语音",
  "section.model": "形象（Live2D）",
  "section.window": "窗口",
  "section.memoryExtraction": "记忆方式",
  "section.memoryLibrary": "已保存的记忆",
  "section.modelInfo": "Live2D",
  "field.name": "名字",
  "field.user": "称呼用户",
  "field.personality": "性格",
  "field.speakingStyle": "说话风格",
  "field.boundaries": "边界",
  "field.greeting": "问候语",
  "field.provider": "服务类型",
  "field.taskModelSlots": "任务模型",
  "field.taskModelSlots.detail": "设置 Greyfield 在聊天回复、画面理解、语音相关任务中使用的模型。",
  "field.baseUrl": "Base URL",
  "field.apiKey": "API Key",
  "field.model": "Live2D 模型",
  "field.visionModel": "视觉模型",
  "field.asr": "ASR",
  "field.asrModel": "ASR 模型",
  "field.tts": "TTS",
  "field.ttsModel": "TTS 模型",
  "taskModel.chat.label": "聊天回复",
  "taskModel.chat.detail": "普通聊天回复使用这个模型；测试 LLM 也检查这个槽位。",
  "taskModel.planner.label": "规划 / 主动性",
  "taskModel.planner.detail": "预留给主动规划和是否先开口的判断；视觉主动路径会优先使用视觉槽位。",
  "taskModel.utility.label": "工具 / 辅助",
  "taskModel.utility.detail": "预留给小型工具和辅助任务；当前 V1 工具还不会直接调用。",
  "taskModel.memory.label": "记忆",
  "taskModel.memory.detail": "预留给增强记忆模型；配置不完整或失败时仍诚实退回基础记忆。",
  "taskModel.vision.label": "视觉 / VLM",
  "taskModel.vision.detail": "截图和 Screen awareness 的画面上下文优先走这个模型。",
  "taskModel.multimodal.label": "多模态",
  "taskModel.multimodal.detail": "视觉槽位留空时作为画面输入的备选；更完整的图像/音频任务仍是预留。",
  "taskModel.voiceAsr.label": "语音 ASR",
  "taskModel.voiceAsr.detail": "语音转文字模型槽位；provider 开关仍在语音设置里。",
  "taskModel.voiceTts.label": "语音 TTS",
  "taskModel.voiceTts.detail": "语音播放模型槽位；完整语音 provider 路由暂不扩展。",
  "field.voice": "音色",
  "field.speak": "朗读",
  "field.volume": "音量",
  "field.mic": "麦克风",
  "field.character": "角色文件",
  "field.scale": "缩放",
  "field.windowLayerMode": "画布层级",
  "field.bubble": "气泡",
  "field.rememberedMoments": "主动记忆提醒",
  "field.proactivity": "主动程度",
  "field.betterMemory": "增强记忆",
  "windowLayerMode.followClick": "按点击决定（默认）",
  "windowLayerMode.controlsFront": "输入框永远在前",
  "windowLayerMode.petFront": "模型永远在前",
  "button.savePersona": "保存人格",
  "button.saving": "保存中...",
  "button.importModel": "导入 Live2D 模型",
  "button.resetTransform": "重置位置",
  "button.refreshMemory": "刷新记忆",
  "button.refreshing": "刷新中...",
  "button.exportLibrary": "导出记忆库",
  "button.clearSummary": "清空摘要记忆",
  "button.clearAtoms": "清空详细记忆",
  "button.chat": "聊天",
  "status.on": "开启",
  "status.off": "关闭",
  "status.bubbleOn": "气泡开启",
  "status.bubbleOff": "气泡关闭",
  "status.proactivity": "主动 {level}/100",
  "status.custom": "自定义",
  "status.loading": "加载中",
  "status.saving": "保存中",
  "status.saved": "已保存",
  "status.needsFix": "需要修正",
  "status.ready": "就绪",
  "status.refreshing": "刷新中",
  "status.notLoaded": "未加载",
  "status.enabled": "已启用",
  "status.idle": "空闲",
  "status.listening": "聆听中",
  "status.thinking": "思考中",
  "status.speaking": "说话中",
  "status.interrupted": "已停止",
  "status.error": "错误",
  "provider.fakePreview": "本地预览",
  "provider.openaiCompatible": "OpenAI 兼容",
  "provider.localFallback": "本地兜底",
  "provider.savedApiKey": "已保存 API key",
  "provider.preview.label": "预览模式",
  "provider.preview.detail": "当前使用本地假服务。要真实聊天，请切换到 OpenAI 兼容服务。",
  "provider.baseUrl.label": "需要 Base URL",
  "provider.baseUrl.detail": "OpenAI 兼容聊天需要 Base URL，例如 https://host/v1。",
  "provider.apiKey.label": "需要 API key",
  "provider.apiKey.detail": "测试或真实聊天前，请先填写 API key。",
  "provider.model.label": "需要模型",
  "provider.model.detail": "测试 LLM 前，请先填写模型名称。",
  "provider.visionModel.label": "未配置视觉模型",
  "provider.visionModel.detail": "屏幕感知需要单独的视觉模型。留空时不会把截图发给聊天模型。",
  "provider.ready.label": "可以测试",
  "provider.ready.detail": "模型服务配置已完整。真实聊天前建议先运行 Test LLM。",
  "memory.standard.label": "基础记忆开启",
  "memory.standard.detail": "Greyfield 仍会保存名字、日期、偏好等简单本地记忆。",
  "memory.fallback.label": "正在使用基础记忆",
  "memory.betterUsed.label": "这次记住了更多细节",
  "memory.betterUsed.detail": "上一条消息也用聊天服务补充了更丰富的细节；基础本地记忆仍然可用。",
  "memory.noSaved.label": "这次没有新的记忆",
  "memory.ready.label": "已准备好记住更多细节",
  "memory.ready.detail": "Greyfield 可以在合适时用聊天服务发现更丰富的细节；失败时会继续使用基础本地记忆。",
  "memory.needsProvider": "“记住更多细节”需要 OpenAI 兼容聊天服务。在服务就绪前，基础本地记忆会继续开启。",
  "memory.needsBaseUrl": "“记住更多细节”需要聊天服务 Base URL。在服务就绪前，基础本地记忆会继续开启。",
  "memory.needsApiKey": "“记住更多细节”需要已保存的 API key。在服务就绪前，基础本地记忆会继续开启。",
  "memory.needsModel": "“记住更多细节”需要记忆模型名称。在服务就绪前，基础本地记忆会继续开启。",
  "memory.about.title": "这是什么",
  "memory.about.detail": "Greyfield 会把本地聊天里的小提醒存下来，让之后的回复更连贯。",
  "memory.status.loading": "正在刷新已保存的记忆",
  "memory.status.loading.detail": "Greyfield 正在检查这个角色当前的本地记忆。",
  "memory.status.notLoaded": "还没加载记忆",
  "memory.status.notLoaded.detail": "点一下刷新，就能载入这个角色当前的记忆库。",
  "memory.status.empty": "还没有记忆",
  "memory.status.empty.detail": "聊过几轮之后，这里会留下偏好、计划和常聊上下文等有用细节。",
  "memory.status.saved": "已保存 {count} 条记忆",
  "memory.status.saved.detail": "Greyfield 之后聊天时可以继续用这些细节。打开任意一条，就能查看或修改。",
  "memory.manage.title": "你可以做什么",
  "memory.manage.detail": "打开一条记忆后，可以查看它来自哪里、编辑、停用或删除。详细记忆也可以单独导出。",
  "memory.controls.title": "高级记忆控制",
  "memory.controls.detail": "导出只包含记忆文本和相关消息。删除和清空只会移除这份记忆库，不删除原始聊天历史；服务凭据不会导出。",
  "memory.advanced.summary": "查看高级详情",
  "memory.savedMemories": "已保存的记忆",
  "memory.types.label": "记忆分组",
  "memory.type.summary": "摘要",
  "memory.type.facts": "事实",
  "memory.type.fact": "事实",
  "memory.type.preferences": "偏好",
  "memory.type.preference": "偏好",
  "memory.type.opinions": "观点",
  "memory.type.opinion": "观点",
  "memory.type.relationships": "关系",
  "memory.type.relationship": "关系",
  "memory.type.scenes": "场景",
  "memory.type.scene": "场景",
  "memory.type.promises": "承诺",
  "memory.type.promise": "承诺",
  "memory.type.memory": "记忆",
  "memory.stored": "已保存 {count} 条",
  "memory.stats.rawTurns": "原始轮次 {count}",
  "memory.stats.enabled": "已启用 {count}",
  "memory.stats.disabled": "已禁用 {count}",
  "memory.state.enabled": "已启用",
  "memory.state.disabled": "已禁用",
  "memory.source.drilldown": "记忆详情",
  "memory.source.kind.summary": "摘要记忆来源",
  "memory.source.kind.atom": "{type}记忆来源",
  "memory.source.close": "关闭",
  "memory.source.passage": "来源片段 {index}",
  "memory.source.longShortened": "来源内容较长，已缩短显示。",
  "memory.source.noOriginal": "这条记忆没有关联原始消息。",
  "memory.source.none": "没有已保存来源",
  "memory.source.saved.one": "已保存 1 个来源",
  "memory.source.saved.many": "已保存 {count} 个来源",
  "memory.source.ready.one": "1 个来源片段可查看",
  "memory.source.ready.many": "{count} 个来源片段可查看",
  "memory.source.someReady": "{available}/{total} 个来源片段可查看",
  "memory.source.unavailable.one": "1 个已保存来源当前不可查看",
  "memory.source.unavailable.many": "{count} 个已保存来源当前不可查看",
  "memory.source.heading.unavailable": "原始消息不可用",
  "memory.source.heading.assistant": "来自 Greyfield",
  "memory.source.heading.user": "来自你",
  "memory.source.heading.system": "来自本地系统记录",
  "memory.source.heading.event": "来自应用事件",
  "memory.source.heading.conversation": "来自对话",
  "memory.source.status.saved": "已本地保存",
  "memory.source.status.missing": "找不到原始消息",
  "memory.source.status.unavailable": "当前会话不可查看",
  "memory.source.meta.availableWithTime": "保存自 {timestamp} 的对话",
  "memory.source.meta.available": "保存自本地对话",
  "memory.source.meta.missingWithTime": "Greyfield 记得 {timestamp} 的来源",
  "memory.source.meta.missing": "Greyfield 为这条记忆保存了来源链接",
  "memory.source.meta.unavailableWithTime": "Greyfield 记得另一个本地会话在 {timestamp} 的来源",
  "memory.source.meta.unavailable": "Greyfield 保存了另一个本地会话的来源链接",
  "memory.source.body.missing": "原始消息不在当前本地会话存储中。",
  "memory.source.body.empty": "这个来源没有保存消息文本。",
  "memory.recall.matched": "命中这条记忆",
  "memory.recall.cue": "命中召回线索「{cue}」",
  "memory.recall.cueFallback": "命中召回线索",
  "memory.recall.semantic": "语义匹配",
  "memory.field.text": "记住的内容",
  "memory.field.recallCues": "帮助想起它的词",
  "memory.action.save": "保存",
  "memory.action.enable": "启用",
  "memory.action.disable": "禁用",
  "memory.action.delete": "删除",
  "memory.action.export": "导出",
  "memory.action.viewSource": "打开详情",
  "memory.summaryMemory": "摘要记忆",
  "memory.atomMemories": "原子记忆",
  "memory.summaryMemories": "摘要记忆",
  "memory.meta.source": "来源",
  "memory.meta.lastUsed": "上次使用",
  "memory.meta.updated": "更新时间",
  "memory.meta.group": "分组",
  "memory.empty": "暂无记忆。",
  "memory.lastRecalled": "上次召回的记忆",
  "memory.export.label": "记忆库导出",
  "test.llm": "测试 LLM",
  "test.llm.testing": "测试中...",
  "test.voice": "测试语音",
  "test.voice.testing": "测试语音中...",
  "test.llm.status": "正在测试 LLM",
  "test.llm.detail": "正在发送一个小提示词，通常很快完成。",
  "test.succeeded": "测试成功",
  "test.failed": "测试失败",
  "test.voice.succeeded": "语音测试成功",
  "test.voice.failed": "语音测试失败",
  "test.provider.firstToken": "收到首个 token：{token}。真实聊天可以使用这个服务。",
  "test.provider.replied": "服务已回复。真实聊天可以使用这个服务。",
  "voice.blocked.baseUrl": "OpenAI 兼容语音测试需要先填写 Base URL。",
  "voice.blocked.apiKey": "语音测试需要 API key。",
  "voice.blocked.ttsModel": "语音测试前请先填写 TTS 模型名称。",
  "voice.blocked.voice": "语音测试前请先选择音色。",
  "voice.status.testing": "正在测试语音",
  "voice.status.testingDetail": "正在测试语音播放...",
  "live2d.usingBundled": "正在使用内置模型：{label}。",
  "live2d.usingCustom": "正在使用自定义模型：{path}",
  "live2d.customModel": "自定义模型",
  "toggle.modelPassThrough": "模型穿透",
  "toggle.lock": "锁定",
  "chat.title": "聊天",
  "chat.settings": "设置",
  "chat.visualObservation": "视觉观察",
  "chat.look": "观察",
  "chat.frame.one": "1 帧",
  "chat.frame.many": "{count} 帧",
  "chat.observationAlt": "临时观察预览",
  "chat.captureOnce": "截图",
  "chat.observeLow": "低",
  "chat.observeNormal": "中",
  "chat.observeHigh": "高",
  "chat.startHigh": "高",
  "chat.endObservation": "结束",
  "chat.clearObservation": "清除",
  "chat.justNow": "刚刚",
  "chat.message": "消息",
  "chat.placeholder": "输入你想说的话...",
  "chat.observationIdle": "截图是临时的，只会在你发送消息确认后一起发给模型。",
  "chat.voice.stopMic": "停止麦克风",
  "chat.voice.transcribing": "转写中",
  "chat.voice": "语音",
  "chat.status.generating.label": "生成中",
  "chat.status.generating.waiting": "正在等待回复开始。",
  "chat.status.generating.replying": "Greyfield 正在回复，期间可以随时停止。",
  "chat.status.generating.speaking": "Greyfield 还在说话，停止会中断当前语音播放。",
  "chat.status.stopped.label": "已停止",
  "chat.status.stopped.detail": "上一条回复已停止，可以继续发送。",
  "chat.status.failed.retryLabel": "可重试",
  "chat.status.failed.label": "失败",
  "chat.status.failed.retryDetail": "失败的消息已回到输入框。",
  "chat.status.failed.detail": "发生错误。先查看上方信息，再重试。",
  "chat.status.listening.detail": "正在听你说话。",
  "chat.status.waiting.label": "等待中",
  "chat.status.waiting.detail": "可以继续发送下一条消息。",
  "chat.action.send": "发送",
  "chat.action.retry": "重试",
  "chat.action.stop": "停止",
  "chat.action.stopped": "已停止",
  "controls.shell": "Greyfield 桌面控制条",
  "controls.panel": "桌宠控制条",
  "controls.move": "移动控制条",
  "controls.expand": "展开控制条",
  "controls.collapse": "收起控制条",
  "controls.message": "桌面消息",
  "controls.placeholder": "和 Greyfield 说话...",
  "controls.send": "发送消息",
  "controls.actions": "桌宠快捷操作",
  "controls.openSettings": "打开设置",
  "controls.hide": "隐藏控制条",
  "controls.quit": "退出 Greyfield 并停止后台进程",
  "controls.stop": "停止回复或语音",
  "controls.mic.start": "开始麦克风输入",
  "controls.mic.stop": "停止麦克风输入",
  "controls.mic.transcribing": "正在转写麦克风输入",
  "controls.voice.on": "开启语音输出",
  "controls.voice.off": "关闭语音输出",
  "controls.screenAwareness.on": "开启屏幕感知",
  "controls.screenAwareness.off": "关闭屏幕感知",
  "controls.passThrough.on": "模型当前会穿透点击；必要时用托盘或设置恢复",
  "controls.passThrough.off": "让模型穿透点击"
};

const dictionaries: Record<SettingsLocale, Partial<Record<SettingsI18nKey, string>>> = {
  "en-US": enUS,
  "zh-CN": zhCN
};

export function normalizeSettingsLocale(locale: string | undefined): SettingsLocale {
  return normalizeGreyfieldLocale(locale);
}

export function settingsT(locale: string | undefined, key: SettingsI18nKey, values: Record<string, string | number> = {}): string {
  const normalized = normalizeSettingsLocale(locale);
  const template = dictionaries[normalized][key] ?? enUS[key] ?? key;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}
