# 04 将 `App.vue` 收敛成纯装配层

## 目标

把 `App.vue` 缩成窗口装配层，尽量只保留模板、路由式分支和少量页面级连接逻辑。

## 任务范围

- 清理 `App.vue` 中残留的业务处理函数。
- 把动作转发给 controller 或 runtime helper。
- 保留模板分支：Pet / Controls / Chat / Settings。

## 输入

- `apps/desktop/src/renderer/App.vue`
- `plans/01-window-runtime.md`
- `plans/02-pet-controller.md`
- `plans/03-bubble-controller.md`

## 输出

- 一个明显更薄的 `App.vue`。
- 页面职责更清楚。

## 依赖

- `01-window-runtime.md`
- `02-pet-controller.md`
- `03-bubble-controller.md`

## 完成标准

- `App.vue` 不再承担大段状态和交互逻辑。
- 页面间切换仍正常。
- 现有功能不回退。

## 验收方法

- 打开每个窗口角色。
- 确认按钮、输入、菜单、拖动、设置入口仍可用。
