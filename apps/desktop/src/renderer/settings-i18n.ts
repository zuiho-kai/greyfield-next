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
  | "field.bubble"
  | "field.rememberedMoments"
  | "field.betterMemory"
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
  | "toggle.lock";

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
  "field.bubble": "Bubble",
  "field.rememberedMoments": "Remembered moments",
  "field.betterMemory": "Better memory",
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
  "toggle.lock": "Lock"
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
  "field.bubble": "气泡",
  "field.rememberedMoments": "主动记忆提醒",
  "field.betterMemory": "增强记忆",
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
  "toggle.lock": "锁定"
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
