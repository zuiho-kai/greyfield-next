# 总 Todo 计划

> 目标：将当前大型桌面端重构拆成可执行、可追踪、可顺序执行的任务。

## 使用说明

- 这个文件是唯一的总入口。
- 每个子任务都有对应的顺序 Markdown 文件。
- 状态只使用以下值：`pending`、`in_progress`、`blocked`、`done`。
- 完成一个任务后，优先更新本文件，再进入下一个任务。

## 任务清单

| 顺序 | 任务 | 文件 | 状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 01 | 收敛窗口 runtime 状态层 | `plans/01-window-runtime.md` | pending | 无 |
| 02 | 拆分宠物窗口交互控制器 | `plans/02-pet-controller.md` | pending | 01 |
| 03 | 收口气泡控制器与 shape 刷新 | `plans/03-bubble-controller.md` | pending | 02 |
| 04 | 将 `App.vue` 收敛成纯装配层 | `plans/04-app-shell.md` | pending | 01-03 |
| 05 | 补充验收与回写检查 | `plans/05-verification.md` | pending | 04 |

## 当前进展

- 当前阶段：准备拆分
- 已完成：无
- 阻塞项：无
- 下一步：先执行 `01-window-runtime`。

## 进度更新规则

每次任务完成后，请更新：

1. 该任务自己的状态
2. 这里的总表
3. 当前进展摘要
4. 如有阻塞，写明原因与恢复条件

## 快速导航

- [01 收敛窗口 runtime 状态层](./01-window-runtime.md)
- [02 拆分宠物窗口交互控制器](./02-pet-controller.md)
- [03 收口气泡控制器与 shape 刷新](./03-bubble-controller.md)
- [04 将 `App.vue` 收敛成纯装配层](./04-app-shell.md)
- [05 补充验收与回写检查](./05-verification.md)
