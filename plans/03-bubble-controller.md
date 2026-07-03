# 03 收口气泡控制器与 shape 刷新

## 目标

把气泡生命周期、文本格式化、锁定位置、淡出定时器等逻辑继续稳定化，并和宠物 shape 刷新建立清晰接口。

## 任务范围

- 气泡文本来源。
- 气泡显示/隐藏/淡出。
- 气泡位置锁定。
- 气泡 shape 对宠物窗口的影响。

## 输入

- `apps/desktop/src/renderer/use-speech-bubble-controller.ts`
- `apps/desktop/src/renderer/speech-bubble-source.ts`
- `apps/desktop/src/renderer/speech-bubble-text.ts`
- `apps/desktop/src/renderer/speech-bubble-placement.ts`

## 输出

- 更稳定的气泡 controller。
- 清晰的 shape 刷新回调接口。

## 依赖

- `02-pet-controller.md`

## 完成标准

- 气泡保持当前视觉行为。
- 淡出逻辑不散落在页面里。
- 宠物 shape 更新不依赖零散副作用。

## 验收方法

- 触发短回复。
- 触发长回复。
- 检查气泡停留与淡出。
- 检查气泡不破坏模型区域交互。
