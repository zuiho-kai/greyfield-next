# 05 补充验收与回写检查

## 目标

为每个任务补充统一的验收方式，并确保主 Todo 文件被正确更新。

## 任务范围

- 为每个子任务确认验收动作。
- 检查脚本执行后是否回写主 Todo。
- 补充失败中止规则。

## 输入

- `plans/00-todo.md`
- `plans/01-window-runtime.md`
- `plans/02-pet-controller.md`
- `plans/03-bubble-controller.md`
- `plans/04-app-shell.md`
- `scripts/run-cursor-tasks.ps1`

## 输出

- 一套统一的验收清单。
- 明确的 Todo 回写规则。

## 依赖

- `04-app-shell.md`

## 完成标准

- 脚本执行记录能更新总 Todo。
- 失败任务会中止并标记阻塞。
- 每个任务都有最小可重复验收动作。

## 验收方法

- 手动检查 Todo 文件状态流转。
- 通过脚本执行一轮模拟任务。
