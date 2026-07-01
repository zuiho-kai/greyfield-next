param(
  [string]$WorkspaceRoot
)

$ErrorActionPreference = "Stop"

function Show-GreyfieldMessage {
  param(
    [string]$Title,
    [string]$Message,
    [int]$Icon = 64
  )

  try {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup($Message, 0, $Title, $Icon)
  } catch {
    Write-Error $Message
  }
}

function Fail-GreyfieldStop {
  param(
    [string]$Message,
    [string]$Detail = ""
  )

  $fullMessage = $Message
  if ($Detail) {
    $fullMessage = "$Message`r`n`r`n$Detail"
  }
  Show-GreyfieldMessage -Title "Greyfield stop failed" -Message $fullMessage -Icon 16
  exit 1
}

function Read-ShortLog {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  $text = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
  if (-not $text) {
    return ""
  }

  if ($text.Length -le 1200) {
    return $text.Trim()
  }

  return $text.Substring([Math]::Max(0, $text.Length - 1200)).Trim()
}

try {
  if (-not $WorkspaceRoot) {
    $WorkspaceRoot = Split-Path -Parent $PSScriptRoot
  }
  $WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)

  $packageJson = Join-Path $WorkspaceRoot "package.json"
  if (-not (Test-Path -LiteralPath $packageJson)) {
    Fail-GreyfieldStop "Could not find the Greyfield project root." "Current path: $WorkspaceRoot"
  }

  $pnpm = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
  if (-not $pnpm) {
    $pnpm = Get-Command "pnpm" -ErrorAction SilentlyContinue
  }
  if (-not $pnpm) {
    Fail-GreyfieldStop "pnpm was not found." "Install Node.js and pnpm first."
  }

  $cacheDir = Join-Path $WorkspaceRoot ".cache"
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
  $stdoutLog = Join-Path $cacheDir "greyfield-windows-stop.out.log"
  $stderrLog = Join-Path $cacheDir "greyfield-windows-stop.err.log"

  $process = Start-Process -FilePath $pnpm.Source -ArgumentList @("dev:live2d:stop") -WorkingDirectory $WorkspaceRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    $detail = Read-ShortLog -Path $stderrLog
    if (-not $detail) {
      $detail = Read-ShortLog -Path $stdoutLog
    }
    Fail-GreyfieldStop "Greyfield stop command failed." $detail
  }

  Show-GreyfieldMessage -Title "Greyfield stop requested" -Message "The stop command was sent. If Greyfield was not running, this result is normal."
  exit 0
} catch {
  Fail-GreyfieldStop "The Greyfield stop launcher hit an unexpected error." $_.Exception.Message
}
