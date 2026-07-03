param(
  [string]$Base = "",
  [string]$Head = "",
  [string[]]$ChangedPath = @(),
  [string]$OutputFile = $env:GITHUB_OUTPUT,
  [switch]$All,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$allOutputs = [ordered]@{
  code_checks = $true
  desktop_pet = $true
  frontend_required = $true
  frontend_smoke = $true
  frontend_visual = $true
  frontend_user_path = $true
  frontend_full_heavy = $true
}

function Test-AnyPathMatches($paths, $patterns) {
  foreach ($file in $paths) {
    foreach ($pattern in $patterns) {
      if ($file -match $pattern) {
        return $true
      }
    }
  }
  return $false
}

function ConvertTo-OutputValue($value) {
  return $value.ToString().ToLowerInvariant()
}

function Write-ClassifierOutputs($outputs) {
  if ($Json) {
    $outputs | ConvertTo-Json -Compress
    return
  }

  foreach ($key in $outputs.Keys) {
    $line = "$key=$(ConvertTo-OutputValue $outputs[$key])"
    Write-Output $line
    if ($OutputFile) {
      $line >> $OutputFile
    }
  }
}

if ($All) {
  Write-ClassifierOutputs $allOutputs
  exit 0
}

if ($ChangedPath.Count -gt 0) {
  $files = $ChangedPath
} else {
  if (-not $Base -or -not $Head) {
    throw "Provide -ChangedPath values or both -Base and -Head."
  }
  $files = git diff --name-only $Base $Head
}

$codePatterns = @(
  '^apps/',
  '^packages/',
  '^scripts/',
  '^package\.json$',
  '^pnpm-lock\.yaml$',
  '^tsconfig',
  '^\.github/workflows/ci\.yml$'
)
$desktopPatterns = @(
  '^apps/desktop/',
  '^packages/stage-live2d/',
  '^packages/dev-harness/',
  '^package\.json$',
  '^pnpm-lock\.yaml$',
  '^tsconfig',
  '^\.github/workflows/ci\.yml$'
)
$frontendAllLayerPatterns = @(
  '^apps/desktop/package\.json$',
  '^apps/desktop/vite\.config\.ts$',
  '^apps/desktop/tsconfig\.json$',
  '^package\.json$',
  '^pnpm-lock\.yaml$',
  '^tsconfig',
  '^\.github/workflows/ci\.yml$'
)
$frontendHarnessEntryPatterns = @(
  '^packages/dev-harness/src/frontend-full-check\.ts$',
  '^packages/dev-harness/src/live2d-check\.ts$',
  '^packages/dev-harness/src/v1-visual-acceptance-check\.ts$',
  '^packages/dev-harness/src/electron-check\.ts$',
  '^packages/dev-harness/src/electron-[^/]+-check\.ts$'
)
$frontendSmokePatterns = @(
  '^apps/desktop/src/renderer/',
  '^apps/desktop/public/assets/',
  '^packages/stage-live2d/'
) + $frontendHarnessEntryPatterns
$frontendVisualPatterns = @(
  '^apps/desktop/src/renderer/',
  '^apps/desktop/public/assets/',
  '^packages/stage-live2d/'
) + $frontendHarnessEntryPatterns
$frontendUserPathPatterns = @(
  '^apps/desktop/src/preload/',
  '^apps/desktop/src/shared/',
  '^apps/desktop/src/renderer/',
  '^apps/desktop/public/assets/',
  '^packages/stage-live2d/',
  '^packages/audio-runtime/',
  '^packages/core-runtime/',
  '^packages/persistence/'
) + $frontendHarnessEntryPatterns
$frontendHeavyPatterns = @(
  '^apps/desktop/src/preload/',
  '^apps/desktop/src/shared/',
  '^apps/desktop/src/main/(desktop-runtime-stores|live2d-model-controller|live2d-model-selection|observation-controller|pet-menu|pet-window-controller|runtime-ipc-controller|runtime-service|screen-capture-source|settings-controller|settings-redaction|tray-menu|window-lifecycle|window-shape)\.ts$',
  '^apps/desktop/src/renderer/App\.vue$',
  '^apps/desktop/src/renderer/ChatWindow\.vue$',
  '^apps/desktop/src/renderer/ControlsWindow\.vue$',
  '^apps/desktop/src/renderer/PetWindow\.vue$',
  '^apps/desktop/src/renderer/SettingsWindow\.vue$',
  '^apps/desktop/src/renderer/chat-status\.ts$',
  '^apps/desktop/src/renderer/desktop-runtime-bridge\.ts$',
  '^apps/desktop/src/renderer/memory-source-display\.ts$',
  '^apps/desktop/src/renderer/pet-window-shape\.ts$',
  '^apps/desktop/src/renderer/preview-runtime-events\.ts$',
  '^apps/desktop/src/renderer/runtime-event-reducer\.ts$',
  '^apps/desktop/src/renderer/settings-',
  '^apps/desktop/src/renderer/speech-bubble-',
  '^packages/audio-runtime/',
  '^packages/core-runtime/',
  '^packages/persistence/'
) + $frontendHarnessEntryPatterns

$frontendAllLayerMatched = Test-AnyPathMatches $files $frontendAllLayerPatterns
$frontendSmokeMatched = $frontendAllLayerMatched -or (Test-AnyPathMatches $files $frontendSmokePatterns)
$frontendVisualMatched = $frontendAllLayerMatched -or (Test-AnyPathMatches $files $frontendVisualPatterns)
$frontendUserPathMatched = $frontendAllLayerMatched -or (Test-AnyPathMatches $files $frontendUserPathPatterns)
$frontendHeavyMatched = $frontendAllLayerMatched -or (Test-AnyPathMatches $files $frontendHeavyPatterns)

$outputs = [ordered]@{
  code_checks = Test-AnyPathMatches $files $codePatterns
  desktop_pet = Test-AnyPathMatches $files $desktopPatterns
  frontend_required = $frontendSmokeMatched -or $frontendVisualMatched -or $frontendUserPathMatched -or $frontendHeavyMatched
  frontend_smoke = $frontendSmokeMatched
  frontend_visual = $frontendVisualMatched
  frontend_user_path = $frontendUserPathMatched
  frontend_full_heavy = $frontendHeavyMatched
}

Write-ClassifierOutputs $outputs
