param(
  [string]$WorkspaceRoot
)

$ErrorActionPreference = "Stop"

function Show-GreyfieldMessage {
  param(
    [string]$Title,
    [string]$Message,
    [int]$Icon = 48
  )

  try {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup($Message, 0, $Title, $Icon)
  } catch {
    Write-Error $Message
  }
}

function Fail-GreyfieldLaunch {
  param(
    [string]$Message,
    [string]$Detail = ""
  )

  $fullMessage = $Message
  if ($Detail) {
    $fullMessage = "$Message`r`n`r`n$Detail"
  }
  Show-GreyfieldMessage -Title "Greyfield launch failed" -Message $fullMessage -Icon 16
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

function Test-TcpPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(250, $false)) {
      return $false
    }
    $client.EndConnect($connect)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

try {
  if (-not $WorkspaceRoot) {
    $WorkspaceRoot = Split-Path -Parent $PSScriptRoot
  }
  $WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)

  if ($env:OS -ne "Windows_NT") {
    Fail-GreyfieldLaunch "This launcher only supports Windows." "Use pnpm dev:live2d on other platforms."
  }

  $packageJson = Join-Path $WorkspaceRoot "package.json"
  if (-not (Test-Path -LiteralPath $packageJson)) {
    Fail-GreyfieldLaunch "Could not find the Greyfield project root." "Current path: $WorkspaceRoot"
  }

  $pnpm = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
  if (-not $pnpm) {
    $pnpm = Get-Command "pnpm" -ErrorAction SilentlyContinue
  }
  if (-not $pnpm) {
    Fail-GreyfieldLaunch "pnpm was not found." "Install Node.js and pnpm, then run pnpm install once in the project root."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceRoot "node_modules"))) {
    Fail-GreyfieldLaunch "Greyfield dependencies are not installed." "Before first use, run pnpm install once in the project root."
  }

  $electronCli = Join-Path $WorkspaceRoot "apps\desktop\node_modules\electron\cli.js"
  if (-not (Test-Path -LiteralPath $electronCli)) {
    Fail-GreyfieldLaunch "Electron is not ready." "Run pnpm install in the project root. If it still fails, run pnpm --filter @greyfield/desktop ensure:electron."
  }

  $cacheDir = Join-Path $WorkspaceRoot ".cache"
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

  $portText = if ($env:GREYFIELD_DEV_PORT) { $env:GREYFIELD_DEV_PORT } else { "5173" }
  $port = 0
  if (-not [int]::TryParse($portText, [ref]$port)) {
    Fail-GreyfieldLaunch "GREYFIELD_DEV_PORT is not a valid port." "Current value: $portText"
  }

  $pidFile = Join-Path $cacheDir "greyfield-live2d-dev-pids.json"
  if (Test-TcpPort -Port $port) {
    if (Test-Path -LiteralPath $pidFile) {
      Fail-GreyfieldLaunch "Greyfield seems to already be running." "To restart, double-click Stop Greyfield.vbs first, or run pnpm dev:live2d:stop."
    }
    Fail-GreyfieldLaunch "Port $port is already in use." "Close the program using that port, or set GREYFIELD_DEV_PORT before launching."
  }

  $ensureLog = Join-Path $cacheDir "greyfield-windows-launcher-ensure.log"
  Push-Location $WorkspaceRoot
  try {
    & $pnpm.Source "--filter" "@greyfield/desktop" "ensure:electron" *> $ensureLog
    if ($LASTEXITCODE -ne 0) {
      Fail-GreyfieldLaunch "Electron preparation failed." (Read-ShortLog -Path $ensureLog)
    }
  } finally {
    Pop-Location
  }

  $stdoutLog = Join-Path $cacheDir "greyfield-windows-launcher.out.log"
  $stderrLog = Join-Path $cacheDir "greyfield-windows-launcher.err.log"
  $process = Start-Process -FilePath $pnpm.Source -ArgumentList @("dev:live2d") -WorkingDirectory $WorkspaceRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      $detail = Read-ShortLog -Path $stderrLog
      if (-not $detail) {
        $detail = Read-ShortLog -Path $stdoutLog
      }
      Fail-GreyfieldLaunch "Greyfield startup failed." $detail
    }

    if (Test-TcpPort -Port $port) {
      Start-Sleep -Seconds 2
      if (-not $process.HasExited) {
        exit 0
      }
    }

    Start-Sleep -Seconds 1
  }

  if ($process.HasExited) {
    $detail = Read-ShortLog -Path $stderrLog
    if (-not $detail) {
      $detail = Read-ShortLog -Path $stdoutLog
    }
    Fail-GreyfieldLaunch "Greyfield startup failed." $detail
  }

  exit 0
} catch {
  Fail-GreyfieldLaunch "The Greyfield launcher hit an unexpected error." $_.Exception.Message
}
