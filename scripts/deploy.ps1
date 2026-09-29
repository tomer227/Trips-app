# One-command deploy to Firebase (Hosting + the `places` Cloud Function) for Windows PowerShell.
#
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
#
# It asks you for what only you can provide (Firebase login, project choice, the Google Maps key,
# optional Supabase URL and anon key) and does everything else. Secrets are typed at the prompts
# and are never written to a file, except the PUBLIC Supabase URL/anon key in .env.local.

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step([string]$text) { Write-Host "`n=== $text" -ForegroundColor Cyan }
function Run([string]$what, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "Step failed: $what (exit code $LASTEXITCODE)" }
}

Step 'Checking tools'
foreach ($tool in 'git', 'node', 'npm') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed or not on PATH. Close and reopen PowerShell, or install it first." }
}

Step 'Installing packages'
Run 'npm install' { npm install }

Step 'Firebase login (a browser window opens - approve it)'
Run 'firebase login' { npx --yes firebase-tools login }

Step 'Choosing the Firebase project'
if (-not (Test-Path '.firebaserc')) {
  Write-Host 'Pick your project from the list (arrow keys + Enter). Use the alias "default" when asked.'
  Run 'firebase use --add' { npx firebase-tools use --add }
} else {
  Write-Host 'Using the project saved in .firebaserc'
}

Step 'Google Maps key (Places API) for the server function'
Write-Host 'Create a NEW key restricted to "Places API (New)" (the old one was exposed).'
$setKey = Read-Host 'Set / replace the GOOGLE_MAPS_API_KEY secret now? (y/n)'
if ($setKey -match '^[yY]') {
  Write-Host 'Paste the key when asked (it is hidden). Do not send it to anyone.'
  Run 'set secret' { npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY }
}

Step 'Accounts (Supabase) - optional'
Write-Host 'Both values are PUBLIC (URL and the "anon public" key). NEVER use service_role.'
$url = Read-Host 'VITE_SUPABASE_URL (press Enter to skip accounts)'
if ($url) {
  $anon = Read-Host 'VITE_SUPABASE_ANON_KEY'
  if ($anon -match 'service_role') { throw 'That looks like a service_role key. Stop: never put it in the app.' }
  $lines = @()
  if (Test-Path '.env.local') { $lines = Get-Content '.env.local' | Where-Object { $_ -notmatch '^VITE_SUPABASE_' } }
  $lines += "VITE_SUPABASE_URL=$url"
  $lines += "VITE_SUPABASE_ANON_KEY=$anon"
  Set-Content -Path '.env.local' -Value $lines -Encoding utf8
  Write-Host 'Saved to .env.local (git-ignored).'
}

Step 'Building and deploying (this takes a few minutes)'
Write-Host 'If asked about ALLOWED_ORIGINS, enter: https://<project-id>.web.app,https://<project-id>.firebaseapp.com'
Run 'firebase deploy' { npx firebase-tools deploy }

Step 'Done'
Write-Host 'Open the "Hosting URL" printed above. Then test: map, "near me", a search, sign-up, a review.' -ForegroundColor Green
Write-Host 'Remember: set the same site URL in Supabase (Authentication > URL Configuration).'
