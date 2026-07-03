# 01 收敛窗口 runtime 状态层

## 目标

把 `apps/desktop/src/renderer/use-window-runtime-state.ts` 拆成更小的职责块，避免它继续变成第二个大入口。

## 任务范围

- 把 runtime bridge 初始化单独成块。
- 把 settings 同步监听单独成块。
- 把 open / hide / test / persona 这类 action 处理单独成块。
- 保留现有行为，不改变用户可见功能。

## 输入

- `apps/desktop/src/renderer/use-window-runtime-state.ts`
- `apps/desktop/src/renderer/desktop-runtime-bridge.ts`
- `apps/desktop/src/renderer/settings-input-patch.ts`

## 输出

- 更小的 composable 或 helper。
- `use-window-runtime-state.ts` 只负责组合。

## 依赖

- 无。

## 完成标准

- `use-window-runtime-state.ts` 明显缩短。
- 设置同步、动作处理、bridge 初始化的边界更清晰。
- 相关测试或 lint 检查通过。

## 验收方法

- 启动桌面端，确认 chat / settings / controls 仍可使用。
- 检查设置变更后状态仍同步。
- 检查 voice / persona / test LLM 入口可用。
