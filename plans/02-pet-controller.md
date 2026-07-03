# 02 拆分宠物窗口交互控制器

## 目标

把宠物窗口的拖动、缩放、命中、菜单、窗口 shape 相关逻辑从 `App.vue` 中完全移出。

## 任务范围

- 宠物命中测试。
- 宠物拖动。
- 宠物滚轮缩放。
- 宠物右键菜单。
- 宠物窗口 shape 记录与刷新。

## 输入

- `apps/desktop/src/renderer/App.vue`
- `apps/desktop/src/renderer/pet-interaction.ts`
- `apps/desktop/src/renderer/pet-window-shape.ts`

## 输出

- 独立的宠物窗口 controller。
- `App.vue` 只调用 controller 暴露的方法。

## 依赖

- `01-window-runtime.md`

## 完成标准

- `App.vue` 不再包含宠物交互实现细节。
- 宠物交互行为保持不变。
- shape 刷新仍与气泡和模型边界同步。

## 验收方法

- 拖动窗口。
- 缩放模型。
- 切换穿透。
- 打开右键菜单。
