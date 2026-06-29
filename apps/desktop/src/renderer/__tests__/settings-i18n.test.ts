import { describe, expect, it } from "vitest";
import { normalizeSettingsLocale, settingsT } from "../settings-i18n";

describe("settings i18n", () => {
  it("maps Settings labels in zh-CN", () => {
    expect(settingsT("zh-CN", "nav.window")).toBe("窗口");
    expect(settingsT("zh-CN", "section.memoryExtraction")).toBe("记忆提取");
    expect(settingsT("zh-CN", "provider.preview.label")).toBe("预览模式");
  });

  it("falls back to en-US for unsupported locales and missing zh-CN keys", () => {
    expect(normalizeSettingsLocale("fr-FR")).toBe("en-US");
    expect(settingsT("fr-FR", "nav.window")).toBe("Window");
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
});
