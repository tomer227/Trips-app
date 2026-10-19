# One-command deploy to Firebase (Hosting + the `places` Cloud Function) for Windows PowerShell.
#
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
#
# It asks you for what only you can provide (Firebase login, project choice, the Google Maps key,
# optional Supabase URL and anon key) and does everything else. Secrets are typed at the prompts
# and are never written to a file, except the PUBLIC Supabase URL/anon key in .env.local.
# Works on Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step([string]$text) { Write-Host "`n=== $text" -ForegroundColor Cyan }
function Run([string]$what, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "Step failed: $what (exit code $LASTEXITCODE)" }
}
# Windows PowerShell 5.1 writes a BOM with -Encoding utf8, which breaks the first key of a .env file.
function Write-EnvFile([string]$path, [string[]]$lines) {
  $full = Join-Path (Get-Location) $path
  [System.IO.File]::WriteAllLines($full, $lines, (New-Object System.Text.UTF8Encoding $false))
}
# Supabase keys: the old "anon" key is a JWT whose payload says role=anon; new projects use sb_publishable_...
# Anything that grants admin rights (service_role JWT or sb_secret_...) must never ship in the app.
function Test-AdminKey([string]$key) {
  if ($key -match '^sb_secret_') { return $true }
  $parts = $key.Split('.')
  if ($parts.Count -ne 3) { return $false }
  $payload = $parts[1].Replace('-', '+').Replace('_', '/')
  while ($payload.Length % 4) { $payload += '=' }
  try { $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) } catch { return $false }
  return $json -match '"role"\s*:\s*"service_role"'
}

Step 'Checking tools'
foreach ($tool in 'node', 'npm') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed or not on PATH. Close and reopen PowerShell, or install it first." }
}
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Node.js $nodeMajor is too old. Install Node.js 22 LTS from https://nodejs.org and run this again." }

Step 'Installing packages'
Run 'npm install' { npm install }
# Firebase loads the function locally before uploading it, so its packages must be installed too.
Run 'npm install (functions)' { npm --prefix functions install }

Step 'Firebase login (a browser window opens - approve it)'
Run 'firebase login' { npx --yes firebase-tools login }

Step 'Choosing the Firebase project'
if (-not (Test-Path '.firebaserc')) {
  Write-Host 'Pick your project from the list (arrow keys + Enter). When asked for an alias, type: default'
  Run 'firebase use --add' { npx firebase-tools use --add }
} else {
  Write-Host 'Using the project saved in .firebaserc'
}
$projectId = (Get-Content '.firebaserc' -Raw | ConvertFrom-Json).projects.default
if (-not $projectId) { throw 'No default project in .firebaserc. Delete .firebaserc and run this again; use the alias "default".' }
Write-Host "Project: $projectId"

# Only the app's own addresses may call /api/places (saves a prompt during deploy).
Write-EnvFile 'functions\.env' @("ALLOWED_ORIGINS=https://$projectId.web.app,https://$projectId.firebaseapp.com")

Step 'Google Maps key (Places API) for the server function'
Write-Host 'Create a NEW key restricted to "Places API (New)" (the old one was exposed). See docs\GO_LIVE.md.'
$setKey = Read-Host 'Set / replace the GOOGLE_MAPS_API_KEY secret now? First time: answer y (y/n)'
if ($setKey -match '^[yY]') {
  Write-Host 'Paste the key when asked (it is hidden). Do not send it to anyone.'
  Write-Host 'If asked to enable the Secret Manager API, answer Y.'
  Run 'set secret' { npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY }
}

Step 'Accounts (Supabase) - optional'
Write-Host 'Both values are PUBLIC (Project URL and the "anon" / "publishable" key). NEVER use service_role or a secret key.'
$url = (Read-Host 'VITE_SUPABASE_URL (press Enter to skip accounts)').Trim()
if ($url) {
  if ($url -notmatch '^https://[a-z0-9-]+\.supabase\.co/?$') { throw "That does not look like a Supabase Project URL (https://xxxx.supabase.co): $url" }
  $anon = (Read-Host 'VITE_SUPABASE_ANON_KEY').Trim()
  if (Test-AdminKey $anon) { throw 'That is a service_role / secret key. Stop: never put it in the app. Use the anon / publishable key.' }
  $lines = @()
  if (Test-Path '.env.local') { $lines = @(Get-Content '.env.local' | Where-Object { $_ -notmatch '^\s*VITE_SUPABASE_' }) }
  $lines += "VITE_SUPABASE_URL=$($url.TrimEnd('/'))"
  $lines += "VITE_SUPABASE_ANON_KEY=$anon"
  Write-EnvFile '.env.local' $lines
  Write-Host 'Saved to .env.local (git-ignored).'
}

Step 'Building and deploying (the first time takes several minutes)'
Write-Host 'If asked whether to enable APIs, answer Y. If asked how many days to keep container images, press Enter.'
Run 'firebase deploy' { npx firebase-tools deploy }

Step 'Done'
Write-Host "Your app: https://$projectId.web.app" -ForegroundColor Green
Write-Host 'Test: map, "near me", a search, sign-up, a review.'
if ($url) { Write-Host "Supabase: set Site URL to https://$projectId.web.app (Authentication > URL Configuration)." -ForegroundColor Yellow }
