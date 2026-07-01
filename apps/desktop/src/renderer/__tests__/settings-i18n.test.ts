import { describe, expect, it } from "vitest";
import { normalizeSettingsLocale, settingsT } from "../settings-i18n";

describe("settings i18n", () => {
  it("maps Settings labels in zh-CN", () => {
    expect(settingsT("zh-CN", "nav.window")).toBe("窗口");
    expect(settingsT("zh-CN", "section.memoryExtraction")).toBe("记忆提取");
    expect(settingsT("zh-CN", "field.windowLayerMode")).toBe("画布层级");
    expect(settingsT("zh-CN", "field.proactivity")).toBe("主动程度");
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
    expect(settingsT("zh-CN", "memory.controls.title")).toBe("本地记忆控制");
    expect(settingsT("zh-CN", "memory.stats.rawTurns", { count: 2 })).toBe("原始轮次 2");
    expect(settingsT("zh-CN", "memory.field.text")).toBe("记忆文本");
    expect(settingsT("zh-CN", "memory.field.recallCues")).toBe("召回线索");
    expect(settingsT("zh-CN", "memory.action.viewSource")).toBe("查看来源");
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
    expect(settingsT("zh-CN", "controls.stop")).toBe("停止回复或语音");
  });
});
