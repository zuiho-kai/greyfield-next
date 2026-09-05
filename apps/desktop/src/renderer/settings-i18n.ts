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
  | "nav.plugins"
  | "nav.memory"
  | "nav.chat"
  | "nav.startChat"
  | "nav.advanced"
  | "advanced.taskModels"
  | "advanced.settings"
  | "advanced.settings.close"
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
  | "field.screenAwarenessRefresh"
  | "field.screenAwarenessStale"
  | "field.screenAwarenessChangeThreshold"
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
  | "status.seconds"
  | "status.percent"
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
  | "experience.preview"
  | "experience.configure"
  | "experience.incomplete"
  | "experience.finishSetup"
  | "experience.untested"
  | "experience.testRequired"
  | "experience.testFailed"
  | "experience.retest"
  | "experience.test"
  | "experience.testing"
  | "experience.configured"
  | "voice.preview.fixedTranscript"
  | "voice.preview.fixedTranscriptShort"
  | "voice.realInput"
  | "memory.paused.label"
  | "memory.paused.detail"
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
  | "memory.core.title"
  | "memory.core.kindExplicit"
  | "memory.core.kindTopic"
  | "memory.core.strength"
  | "memory.profile.title"
  | "memory.profile.count"
  | "memory.profile.meta.id"
  | "memory.profile.meta.primaryName"
  | "memory.profile.meta.aliases"
  | "memory.profile.meta.localId"
  | "memory.profile.section.identity"
  | "memory.profile.section.relationship"
  | "memory.profile.section.stable"
  | "memory.profile.section.preference"
  | "memory.profile.section.recent"
  | "memory.profile.section.uncertain"
  | "memory.profile.maintenance.title"
  | "memory.profile.maintenance.detail"
  | "memory.profile.add.summary"
  | "memory.profile.field.category"
  | "memory.profile.field.key"
  | "memory.profile.field.value"
  | "memory.profile.placeholder.key"
  | "memory.profile.placeholder.value"
  | "memory.profile.action.create"
  | "memory.profile.category.allergy"
  | "memory.profile.category.importantDate"
  | "memory.profile.category.identity"
  | "memory.profile.category.preference"
  | "memory.profile.category.freeForm"
  | "memory.profile.category.freeFormFacts"
  | "memory.profile.emptySection"
  | "memory.profile.hidden.title"
  | "memory.profile.action.hide"
  | "memory.profile.action.restore"
  | "memory.profile.action.delete"
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
  | "test.provider.error.unauthorized"
  | "test.provider.error.forbidden"
  | "test.provider.error.notFound"
  | "test.provider.error.timeout"
  | "test.provider.error.stream"
  | "test.provider.error.empty"
  | "test.provider.error.generic"
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
  | "chat.message.expand"
  | "chat.message.collapse"
  | "chat.continuity.restored"
  | "chat.placeholder"
  | "chat.observationIdle"
  | "chat.screenAwareness.visionMissingNotice"
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
  "nav.plugins": "Plugins",
  "nav.memory": "Memory",
  "nav.chat": "Chat",
  "nav.startChat": "Start chatting",
  "nav.advanced": "Advanced settings",
  "advanced.taskModels": "Advanced task models",
  "advanced.settings": "Show advanced settings",
  "advanced.settings.close": "Hide advanced settings",
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
  "field.screenAwarenessRefresh": "Screen refresh",
  "field.screenAwarenessStale": "Screen context expires",
  "field.screenAwarenessChangeThreshold": "Screen change threshold",
  "field.betterMemory": "Memory model enhancement",
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
  "status.seconds": "{value}s",
  "status.percent": "{value}%",
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
  "experience.preview": "Preview mode",
  "experience.configure": "Configure real chat",
  "experience.incomplete": "Setup incomplete",
  "experience.finishSetup": "Finish setup",
  "experience.untested": "Configuration saved, test pending",
  "experience.testRequired": "Run Test LLM in Settings before treating this connection as ready.",
  "experience.testFailed": "Connection test failed",
  "experience.retest": "Test again",
  "experience.test": "Test connection",
  "experience.testing": "Testing connection",
  "experience.configured": "Real chat ready",
  "voice.preview.fixedTranscript": "Fixed-transcript preview",
  "voice.preview.fixedTranscriptShort": "Fixed text",
  "voice.realInput": "Microphone input",
  "memory.paused.label": "Long-term memory is paused",
  "memory.paused.detail": "The desktop runtime is not writing or recalling long-term memory. Recent message continuity is separate and remains bounded.",
  "memory.standard.label": "Long-term memory is available",
  "memory.standard.detail": "The desktop runtime can write and recall long-term memory for this character.",
  "memory.fallback.label": "Using local memory only",
  "memory.betterUsed.label": "New memory was organized",
  "memory.betterUsed.detail": "The Memory model helped turn the last chat into clearer long-term memory. Everything is still saved locally and can be reviewed or deleted.",
  "memory.noSaved.label": "Nothing new to remember",
  "memory.ready.label": "Memory model enhancement is on",
  "memory.ready.detail": "After each chat turn, Greyfield can ask the Memory model to organize clearer long-term memories. Saved memories stay local and remain under your control.",
  "memory.needsProvider": "To use the Memory model, switch to the OpenAI-compatible chat provider first. Local memory stays on.",
  "memory.needsBaseUrl": "To use the Memory model, add the chat provider Base URL first. Local memory stays on.",
  "memory.needsApiKey": "To use the Memory model, save an API key first. Local memory stays on.",
  "memory.needsModel": "To use the Memory model, choose a Memory model name first. Local memory stays on.",
  "memory.about.title": "Long-term memory is paused",
  "memory.about.detail": "This desktop runtime is not writing or recalling long-term memory. The bounded recent messages used for conversation continuity are separate from long-term memory. Existing developer management tools remain visible, but new memory extraction is unavailable.",
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
  "memory.source.body.missing": "Greyfield cannot find the original message on this device.",
  "memory.source.body.empty": "No message text is saved for this source.",
  "memory.recall.matched": "Used this memory",
  "memory.recall.cue": "Remembered because of \"{cue}\"",
  "memory.recall.cueFallback": "Remembered from a related word",
  "memory.recall.semantic": "Related to this chat",
  "memory.field.text": "Remembered text",
  "memory.field.recallCues": "Words to bring this back",
  "memory.action.save": "Save",
  "memory.action.enable": "Enable",
  "memory.action.disable": "Disable",
  "memory.action.delete": "Delete",
  "memory.core.title": "Long-term memories",
  "memory.core.kindExplicit": "Saved directly",
  "memory.core.kindTopic": "Organized from chats",
  "memory.core.strength": "Strength {value}%",
  "memory.profile.title": "Profile",
  "memory.profile.count": "{count} active notes",
  "memory.profile.meta.id": "Profile ID",
  "memory.profile.meta.primaryName": "Preferred name",
  "memory.profile.meta.aliases": "Aliases",
  "memory.profile.meta.localId": "local profile",
  "memory.profile.section.identity": "Identity",
  "memory.profile.section.relationship": "Relationships",
  "memory.profile.section.stable": "Stable facts",
  "memory.profile.section.preference": "Preferences",
  "memory.profile.section.recent": "Recent interactions",
  "memory.profile.section.uncertain": "Uncertain notes",
  "memory.profile.maintenance.title": "Maintenance note",
  "memory.profile.maintenance.detail": "This profile is a working memory for Greyfield. If it conflicts with the current chat, the current chat wins.",
  "memory.profile.add.summary": "Add to profile",
  "memory.profile.field.category": "Profile section",
  "memory.profile.field.key": "Item",
  "memory.profile.field.value": "Detail",
  "memory.profile.placeholder.key": "For example: preferred name, job, birthday",
  "memory.profile.placeholder.value": "For example: Chaoge, software engineer, 2026-01-15",
  "memory.profile.action.create": "Add",
  "memory.profile.category.allergy": "Health / allergy",
  "memory.profile.category.importantDate": "Important date",
  "memory.profile.category.identity": "Identity",
  "memory.profile.category.preference": "Preference",
  "memory.profile.category.freeForm": "Stable fact",
  "memory.profile.category.freeFormFacts": "Stable facts",
  "memory.profile.emptySection": "None yet",
  "memory.profile.hidden.title": "Hidden notes",
  "memory.profile.action.hide": "Hide",
  "memory.profile.action.restore": "Restore",
  "memory.profile.action.delete": "Delete",
  "memory.action.export": "Export",
  "memory.action.viewSource": "Open details",
  "memory.summaryMemory": "Summary memory",
  "memory.atomMemories": "Detailed memories",
  "memory.summaryMemories": "Summary memories",
  "memory.meta.source": "Source",
  "memory.meta.lastUsed": "Last used",
  "memory.meta.updated": "Updated",
  "memory.meta.group": "Group",
  "memory.empty": "No memories yet.",
  "memory.lastRecalled": "Last memory used",
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
  "test.provider.error.unauthorized": "Credentials were rejected. Check the API key and retry.",
  "test.provider.error.forbidden": "These credentials do not have access. Check permissions and retry.",
  "test.provider.error.notFound": "The Base URL or chat model was not found. Check both and retry.",
  "test.provider.error.timeout": "Connection timed out. Check the Base URL and network, then retry.",
  "test.provider.error.stream": "The provider returned an invalid stream. Retry, then check the Base URL if it continues.",
  "test.provider.error.empty": "The provider disconnected before the first reply token. Retry the test.",
  "test.provider.error.generic": "Connection test failed. Check the four chat settings and retry.",
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
  "chat.message.expand": "See more",
  "chat.message.collapse": "Collapse",
  "chat.continuity.restored": "Restored the latest {count} conversation messages (not long-term memory)",
  "chat.placeholder": "Type your message...",
  "chat.observationIdle": "Screenshots are temporary and only sent after you confirm with a message.",
  "chat.screenAwareness.visionMissingNotice": "Screen awareness needs a ready Vision model. This screenshot stayed temporary and was not sent to the Chat model.",
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
  "nav.plugins": "插件广场",
  "nav.memory": "记忆",
  "nav.chat": "聊天",
  "nav.startChat": "开始聊天",
  "nav.advanced": "高级设置",
  "advanced.taskModels": "高级任务模型",
  "advanced.settings": "展开高级设置",
  "advanced.settings.close": "收起高级设置",
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
  "field.screenAwarenessRefresh": "屏幕感知刷新",
  "field.screenAwarenessStale": "画面过期",
  "field.screenAwarenessChangeThreshold": "变化阈值",
  "field.betterMemory": "记忆模型增强",
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
  "status.seconds": "{value} 秒",
  "status.percent": "{value}%",
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
  "experience.preview": "试玩模式",
  "experience.configure": "配置真实聊天",
  "experience.incomplete": "配置未完成",
  "experience.finishSetup": "完成配置",
  "experience.untested": "配置已保存，待测试",
  "experience.testRequired": "请先在设置中运行 Test LLM，再把这个连接视为已就绪。",
  "experience.testFailed": "连接测试失败",
  "experience.retest": "重新测试",
  "experience.test": "测试连接",
  "experience.testing": "正在测试连接",
  "experience.configured": "真实聊天已就绪",
  "voice.preview.fixedTranscript": "固定转写试玩",
  "voice.preview.fixedTranscriptShort": "固定转写",
  "voice.realInput": "麦克风输入",
  "memory.paused.label": "长期记忆当前暂停",
  "memory.paused.detail": "当前桌面 runtime 不会写入或召回长期记忆；有界的最近对话消息连续性与长期记忆是两回事。",
  "memory.standard.label": "长期记忆可用",
  "memory.standard.detail": "当前桌面 runtime 可以为这个角色写入和召回长期记忆。",
  "memory.fallback.label": "暂时只用本地记忆",
  "memory.betterUsed.label": "已整理出新记忆",
  "memory.betterUsed.detail": "记忆模型刚刚把上一轮聊天整理成了更清楚的长期记忆。记忆仍保存在本地，也仍然可以查看、停用或删除。",
  "memory.noSaved.label": "这次没有新的记忆",
  "memory.ready.label": "记忆模型增强已开启",
  "memory.ready.detail": "每轮聊天结束后，Greyfield 可以请记忆模型把内容整理成更清楚的长期记忆。记忆仍保存在本地，也仍由你管理。",
  "memory.needsProvider": "要使用记忆模型，请先切换到 OpenAI 兼容聊天服务。本地记忆会继续开启。",
  "memory.needsBaseUrl": "要使用记忆模型，请先填写聊天服务 Base URL。本地记忆会继续开启。",
  "memory.needsApiKey": "要使用记忆模型，请先保存 API key。本地记忆会继续开启。",
  "memory.needsModel": "要使用记忆模型，请先填写记忆模型名称。本地记忆会继续开启。",
  "memory.about.title": "长期记忆当前暂停",
  "memory.about.detail": "当前桌面 runtime 不会写入或召回长期记忆。有界恢复的最近对话消息只用于连续聊天，不是长期记忆。已有开发管理工具仍可查看，但新的记忆抽取当前不可用。",
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
  "memory.source.body.missing": "这台电脑上找不到当时那条原始消息。",
  "memory.source.body.empty": "这个来源没有保存消息文本。",
  "memory.recall.matched": "用了这条记忆",
  "memory.recall.cue": "因为「{cue}」想起这条",
  "memory.recall.cueFallback": "因为相关词想起这条",
  "memory.recall.semantic": "和这次聊天相关",
  "memory.field.text": "记住的内容",
  "memory.field.recallCues": "帮助想起它的词",
  "memory.action.save": "保存",
  "memory.action.enable": "启用",
  "memory.action.disable": "禁用",
  "memory.action.delete": "删除",
  "memory.core.title": "长期记忆",
  "memory.core.kindExplicit": "直接记下",
  "memory.core.kindTopic": "从聊天整理",
  "memory.core.strength": "强度 {value}%",
  "memory.profile.title": "人物画像",
  "memory.profile.count": "已启用 {count} 条",
  "memory.profile.meta.id": "人物ID",
  "memory.profile.meta.primaryName": "主称呼",
  "memory.profile.meta.aliases": "别名",
  "memory.profile.meta.localId": "本地画像",
  "memory.profile.section.identity": "身份设定",
  "memory.profile.section.relationship": "关系设定",
  "memory.profile.section.stable": "稳定了解",
  "memory.profile.section.preference": "相处偏好",
  "memory.profile.section.recent": "近期互动",
  "memory.profile.section.uncertain": "不确定信息",
  "memory.profile.maintenance.title": "维护备注",
  "memory.profile.maintenance.detail": "自动画像仅供内部参考；若与当前对话冲突，以当前对话为准。",
  "memory.profile.add.summary": "手动补充画像",
  "memory.profile.field.category": "写入段落",
  "memory.profile.field.key": "条目",
  "memory.profile.field.value": "内容",
  "memory.profile.placeholder.key": "例如：主称呼、职业、生日",
  "memory.profile.placeholder.value": "例如：朝歌、软件工程师、2026-01-15",
  "memory.profile.action.create": "添加到画像",
  "memory.profile.category.allergy": "健康/过敏",
  "memory.profile.category.importantDate": "重要日期",
  "memory.profile.category.identity": "身份设定",
  "memory.profile.category.preference": "相处偏好",
  "memory.profile.category.freeForm": "稳定了解",
  "memory.profile.category.freeFormFacts": "稳定了解",
  "memory.profile.emptySection": "暂无",
  "memory.profile.hidden.title": "已隐藏条目",
  "memory.profile.action.hide": "从画像隐藏",
  "memory.profile.action.restore": "恢复",
  "memory.profile.action.delete": "删除",
  "memory.action.export": "导出",
  "memory.action.viewSource": "打开详情",
  "memory.summaryMemory": "摘要记忆",
  "memory.atomMemories": "详细记忆",
  "memory.summaryMemories": "摘要记忆",
  "memory.meta.source": "来源",
  "memory.meta.lastUsed": "上次使用",
  "memory.meta.updated": "更新时间",
  "memory.meta.group": "分组",
  "memory.empty": "暂无记忆。",
  "memory.lastRecalled": "上次用到的记忆",
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
  "test.provider.error.unauthorized": "凭据未通过，请检查 API Key 后重试。",
  "test.provider.error.forbidden": "当前凭据没有访问权限，请检查权限后重试。",
  "test.provider.error.notFound": "Base URL 或聊天模型不存在，请检查后重试。",
  "test.provider.error.timeout": "连接超时，请检查 Base URL 和网络后重试。",
  "test.provider.error.stream": "服务返回的流格式异常，请重试；持续失败时检查 Base URL。",
  "test.provider.error.empty": "服务在首个回复 token 前断开，请重新测试。",
  "test.provider.error.generic": "连接测试失败，请检查四项聊天配置后重试。",
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
  "chat.message.expand": "展开全文",
  "chat.message.collapse": "收起",
  "chat.continuity.restored": "已恢复最近 {count} 条对话消息（不是长期记忆）",
  "chat.placeholder": "输入你想说的话...",
  "chat.observationIdle": "截图是临时的，只会在你发送消息确认后一起发给模型。",
  "chat.screenAwareness.visionMissingNotice": "屏幕感知需要可用的 Vision model。本次截图保持临时，没有发送给 Chat model。",
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
