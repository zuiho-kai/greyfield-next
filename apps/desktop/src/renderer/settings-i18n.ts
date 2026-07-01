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
  | "field.baseUrl"
  | "field.apiKey"
  | "field.model"
  | "field.asr"
  | "field.asrModel"
  | "field.tts"
  | "field.ttsModel"
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
  | "memory.controls.title"
  | "memory.controls.detail"
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
  "nav.model": "Model",
  "nav.voice": "Voice",
  "nav.window": "Window",
  "nav.persona": "Persona",
  "nav.memory": "Memory",
  "nav.chat": "Chat",
  "app.status": "Status",
  "settings.label": "Settings",
  "settings.language": "Language",
  "section.persona": "Persona",
  "section.provider": "Provider",
  "section.voice": "Voice",
  "section.model": "Live2D",
  "section.window": "Window",
  "section.memoryExtraction": "Memory extraction",
  "section.memoryLibrary": "Memory Library",
  "section.modelInfo": "Live2D",
  "field.name": "Name",
  "field.user": "User",
  "field.personality": "Personality",
  "field.speakingStyle": "Speaking style",
  "field.boundaries": "Boundaries",
  "field.greeting": "Greeting",
  "field.provider": "Provider",
  "field.baseUrl": "Base URL",
  "field.apiKey": "API Key",
  "field.model": "Model",
  "field.asr": "ASR",
  "field.asrModel": "ASR Model",
  "field.tts": "TTS",
  "field.ttsModel": "TTS Model",
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
  "button.importModel": "Import local model",
  "button.resetTransform": "Reset transform",
  "button.refreshMemory": "Refresh memory",
  "button.refreshing": "Refreshing...",
  "button.exportLibrary": "Export library",
  "button.clearSummary": "Clear summary memory",
  "button.clearAtoms": "Clear current role atoms",
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
  "provider.ready.label": "Ready to test",
  "provider.ready.detail": "Provider settings are complete. Run Test LLM before a real chat.",
  "memory.standard.label": "Standard memory",
  "memory.standard.detail": "Better extraction is off. Greyfield still saves simple local memories such as names, dates, and preferences.",
  "memory.fallback.label": "Standard fallback",
  "memory.betterUsed.label": "Better memory used",
  "memory.betterUsed.detail": "The last message was checked with the chat provider. Standard local memory stayed available.",
  "memory.noSaved.label": "No memory saved",
  "memory.ready.label": "Ready for better memory",
  "memory.ready.detail": "Greyfield can use the chat provider to notice richer memories. If it fails, standard local memory keeps running.",
  "memory.needsProvider": "Better extraction needs the OpenAI-compatible chat provider. Standard local memory stays on until the provider is ready.",
  "memory.needsBaseUrl": "Better extraction needs a chat provider Base URL. Standard local memory stays on until the provider is ready.",
  "memory.needsApiKey": "Better extraction needs a saved API key. Standard local memory stays on until the provider is ready.",
  "memory.needsModel": "Better extraction needs a chat model name. Standard local memory stays on until the provider is ready.",
  "memory.controls.title": "Local memory controls",
  "memory.controls.detail": "Exports include memory text and source turns. Delete and clear remove library memories, not raw chat history; provider credentials stay out.",
  "memory.types.label": "Memory types",
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
  "memory.source.drilldown": "Memory source drilldown",
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
  "memory.field.text": "Memory text",
  "memory.field.recallCues": "Recall cues",
  "memory.action.save": "Save",
  "memory.action.enable": "Enable",
  "memory.action.disable": "Disable",
  "memory.action.delete": "Delete",
  "memory.action.export": "Export",
  "memory.action.viewSource": "View source",
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
  "nav.model": "模型",
  "nav.voice": "语音",
  "nav.window": "窗口",
  "nav.persona": "人格",
  "nav.memory": "记忆",
  "nav.chat": "聊天",
  "app.status": "状态",
  "settings.label": "设置",
  "settings.language": "语言",
  "section.persona": "人格",
  "section.provider": "模型服务",
  "section.voice": "语音",
  "section.model": "Live2D 模型",
  "section.window": "窗口",
  "section.memoryExtraction": "记忆提取",
  "section.memoryLibrary": "记忆库",
  "section.modelInfo": "Live2D",
  "field.name": "名字",
  "field.user": "称呼用户",
  "field.personality": "性格",
  "field.speakingStyle": "说话风格",
  "field.boundaries": "边界",
  "field.greeting": "问候语",
  "field.provider": "服务",
  "field.baseUrl": "Base URL",
  "field.apiKey": "API Key",
  "field.model": "模型",
  "field.asr": "ASR",
  "field.asrModel": "ASR 模型",
  "field.tts": "TTS",
  "field.ttsModel": "TTS 模型",
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
  "button.importModel": "导入本地模型",
  "button.resetTransform": "重置位置",
  "button.refreshMemory": "刷新记忆",
  "button.refreshing": "刷新中...",
  "button.exportLibrary": "导出记忆库",
  "button.clearSummary": "清空摘要记忆",
  "button.clearAtoms": "清空当前角色原子记忆",
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
  "provider.ready.label": "可以测试",
  "provider.ready.detail": "模型服务配置已完整。真实聊天前建议先运行 Test LLM。",
  "memory.standard.label": "标准记忆",
  "memory.standard.detail": "增强提取已关闭。Greyfield 仍会保存名字、日期、偏好等简单本地记忆。",
  "memory.fallback.label": "标准兜底",
  "memory.betterUsed.label": "已使用增强记忆",
  "memory.betterUsed.detail": "上一条消息已交给聊天服务判断记忆；标准本地记忆仍可用。",
  "memory.noSaved.label": "未保存记忆",
  "memory.ready.label": "增强记忆就绪",
  "memory.ready.detail": "Greyfield 可以用聊天服务发现更丰富的记忆；失败时会继续使用标准本地记忆。",
  "memory.needsProvider": "增强提取需要 OpenAI 兼容聊天服务。在服务就绪前，标准本地记忆会继续开启。",
  "memory.needsBaseUrl": "增强提取需要聊天服务 Base URL。在服务就绪前，标准本地记忆会继续开启。",
  "memory.needsApiKey": "增强提取需要已保存的 API key。在服务就绪前，标准本地记忆会继续开启。",
  "memory.needsModel": "增强提取需要聊天模型名称。在服务就绪前，标准本地记忆会继续开启。",
  "memory.controls.title": "本地记忆控制",
  "memory.controls.detail": "导出只包含记忆文本和来源轮次。删除和清空只移除记忆库内容，不删除原始聊天历史；服务凭据不会导出。",
  "memory.types.label": "记忆类型",
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
  "memory.source.drilldown": "记忆来源详情",
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
  "memory.field.text": "记忆文本",
  "memory.field.recallCues": "召回线索",
  "memory.action.save": "保存",
  "memory.action.enable": "启用",
  "memory.action.disable": "禁用",
  "memory.action.delete": "删除",
  "memory.action.export": "导出",
  "memory.action.viewSource": "查看来源",
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
