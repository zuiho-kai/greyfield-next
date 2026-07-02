import { describe, expect, it } from "vitest";
import { normalizeSettingsLocale, settingsT } from "../settings-i18n";

describe("settings i18n", () => {
  it("maps Settings labels in zh-CN", () => {
    expect(settingsT("zh-CN", "nav.model")).toBe("形象");
    expect(settingsT("zh-CN", "nav.provider")).toBe("模型服务");
    expect(settingsT("zh-CN", "section.model")).toBe("形象（Live2D）");
    expect(settingsT("zh-CN", "field.model")).toBe("Live2D 模型");
    expect(settingsT("zh-CN", "nav.window")).toBe("窗口");
    expect(settingsT("zh-CN", "section.memoryExtraction")).toBe("记忆方式");
    expect(settingsT("zh-CN", "field.windowLayerMode")).toBe("画布层级");
    expect(settingsT("zh-CN", "field.proactivity")).toBe("主动程度");
    expect(settingsT("zh-CN", "field.taskModelSlots.detail")).toContain("聊天回复、画面理解、语音相关任务");
    expect(settingsT("en-US", "nav.model")).toBe("Live2D");
    expect(settingsT("en-US", "nav.provider")).toBe("Model service");
    expect(settingsT("en-US", "section.model")).toBe("Live2D avatar");
    expect(settingsT("en-US", "field.taskModelSlots.detail")).toContain("chat replies, visual understanding");
    expect(settingsT("zh-CN", "status.proactivity", { level: 80 })).toBe("主动 80/100");
    expect(settingsT("zh-CN", "provider.preview.label")).toBe("预览模式");
    expect(settingsT("zh-CN", "windowLayerMode.followClick")).toBe("按点击决定（默认）");
  });

  it("falls back to zh-CN for unsupported locales", () => {
    expect(normalizeSettingsLocale("fr-FR")).toBe("zh-CN");
    expect(settingsT("fr-FR", "nav.window")).toBe("窗口");
  });

  it("formats translated status messages with values", () => {
    expect(settingsT("zh-CN", "test.provider.firstToken", { token: "pong" })).toBe(
      "收到首个 token：pong。真实聊天可以使用这个服务。"
    );
  });

  it("maps Memory Library control labels in zh-CN", () => {
    expect(settingsT("zh-CN", "memory.about.title")).toBe("记忆怎么被使用");
    expect(settingsT("zh-CN", "memory.about.detail")).toContain("从记忆库召回相关记忆文本");
    expect(settingsT("zh-CN", "memory.about.detail")).toContain("加入下一轮聊天提示词");
    expect(settingsT("zh-CN", "memory.status.saved", { count: 3 })).toBe("已保存 3 条记忆");
    expect(settingsT("zh-CN", "memory.controls.title")).toBe("高级记忆控制");
    expect(settingsT("zh-CN", "memory.stats.rawTurns", { count: 2 })).toBe("原始轮次 2");
    expect(settingsT("zh-CN", "memory.field.text")).toBe("记住的内容");
    expect(settingsT("zh-CN", "memory.field.recallCues")).toBe("帮助想起它的词");
    expect(settingsT("zh-CN", "memory.action.viewSource")).toBe("打开详情");
    expect(settingsT("zh-CN", "memory.empty")).toBe("暂无记忆。");
  });

  it("maps Chat and desktop control labels in zh-CN", () => {
    expect(settingsT("zh-CN", "chat.title")).toBe("聊天");
    expect(settingsT("zh-CN", "chat.action.send")).toBe("发送");
    expect(settingsT("zh-CN", "chat.status.waiting.detail")).toBe("可以继续发送下一条消息。");
    expect(settingsT("zh-CN", "chat.captureOnce")).toBe("截图");
    expect(settingsT("zh-CN", "chat.observeNormal")).toBe("中");
    expect(settingsT("zh-CN", "chat.clearObservation")).toBe("清除");
    expect(settingsT("en-US", "chat.captureOnce")).toBe("Shot");
    expect(settingsT("en-US", "chat.observeNormal")).toBe("Mid");
    expect(settingsT("en-US", "chat.clearObservation")).toBe("Clear");
    expect(settingsT("zh-CN", "controls.placeholder")).toBe("和 Greyfield 说话...");
    expect(settingsT("zh-CN", "controls.quit")).toBe("退出 Greyfield 并停止后台进程");
    expect(settingsT("zh-CN", "controls.stop")).toBe("停止回复或语音");
  });
});
