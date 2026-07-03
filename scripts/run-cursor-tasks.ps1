param(
  [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$DryRun,
  [string]$CursorAgentCommand = "cursor",
  [string]$CursorAgentArguments = "agent"
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$TodoPath = Join-Path $WorkspaceRoot "plans\00-todo.md"
$TaskDir = Join-Path $WorkspaceRoot "plans"

function Read-FileText {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  return Get-Content -LiteralPath $Path -Raw
}

function Write-FileText {
  param([string]$Path, [string]$Text)
  Set-Content -LiteralPath $Path -Value $Text -NoNewline -Encoding UTF8
}

function Update-TodoStatus {
  param([string]$TaskFile, [string]$Status, [string]$Note = "")

  $todo = Read-FileText -Path $TodoPath
  $leaf = Split-Path $TaskFile -Leaf
  $todo = $todo -replace [regex]::Escape("| ``$TaskFile`` | pending |"), "| ``$TaskFile`` | $Status |"
  $todo = $todo -replace [regex]::Escape("| $leaf | pending |"), "| $leaf | $Status |"
  $todo = $todo -replace [regex]::Escape("| $leaf | in_progress |"), "| $leaf | $Status |"
  $todo = $todo -replace [regex]::Escape("| $leaf | blocked |"), "| $leaf | $Status |"
  $todo = $todo -replace [regex]::Escape("| $leaf | done |"), "| $leaf | $Status |"
  if ($Note) {
    $todo = $todo -replace "- 下一步：.*", "- 下一步：$Note"
  }
  Write-FileText -Path $TodoPath -Text $todo
}

$Tasks = @(
  @{ File = Join-Path $TaskDir "01-window-runtime.md"; Prompt = "执行 01-window-runtime.md 并完成相应代码修改" },
  @{ File = Join-Path $TaskDir "02-pet-controller.md"; Prompt = "执行 02-pet-controller.md 并完成相应代码修改" },
  @{ File = Join-Path $TaskDir "03-bubble-controller.md"; Prompt = "执行 03-bubble-controller.md 并完成相应代码修改" },
  @{ File = Join-Path $TaskDir "04-app-shell.md"; Prompt = "执行 04-app-shell.md 并完成相应代码修改" },
  @{ File = Join-Path $TaskDir "05-verification.md"; Prompt = "执行 05-verification.md 并完成验收与回写检查" }
)

foreach ($task in $Tasks) {
  $taskFile = $task.File
  Write-Host "==> $($taskFile)"
  Update-TodoStatus -TaskFile $taskFile -Status "in_progress" -Note "完成当前任务后进入下一步"

  if ($DryRun) {
    Write-Host "DryRun: $($task.Prompt)"
    Update-TodoStatus -TaskFile $taskFile -Status "done" -Note "继续下一任务"
    continue
  }

  $cursorCmd = Get-Command $CursorAgentCommand -ErrorAction SilentlyContinue
  if (-not $cursorCmd) {
    throw "Cursor CLI not found. Install Cursor CLI or pass -CursorAgentCommand to match your environment."
  }

  $agentArgs = @()
  if ($CursorAgentArguments) {
    $agentArgs += $CursorAgentArguments.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
  }
  $agentArgs += @("--workspace", $WorkspaceRoot, "--prompt", $task.Prompt)
  & $cursorCmd.Source @agentArgs
  if ($LASTEXITCODE -ne 0) {
    Update-TodoStatus -TaskFile $taskFile -Status "blocked" -Note "修复失败后重试"
    exit $LASTEXITCODE
  }

  Update-TodoStatus -TaskFile $taskFile -Status "done" -Note "继续下一任务"
}

Write-Host "All tasks completed."