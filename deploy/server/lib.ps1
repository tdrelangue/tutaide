# Shared helpers for the Tutellia server scripts on Windows (dot-sourced).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Fail([string]$Message) { Write-Host "ERREUR : $Message" -ForegroundColor Red; exit 1 }
function Info([string]$Message) { Write-Host "==> $Message" }

function Invoke-Compose { & docker compose --env-file .env @args; if ($LASTEXITCODE -ne 0) { Fail "docker compose $args a échoué" } }

function Get-EnvValue([string]$Name) {
  $line = Get-Content .env | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if ($line) { return $line.Substring($Name.Length + 1) } else { return "" }
}

function Set-EnvValue([string]$Name, [string]$Value) {
  $lines = @(Get-Content .env | Where-Object { $_ -notmatch "^$Name=" }) + "$Name=$Value"
  [System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot ".env"), $lines)
}

function Wait-Healthy {
  for ($i = 0; $i -lt 60; $i++) {
    & docker compose --env-file .env exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null
    if ($LASTEXITCODE -eq 0) { return $true }
    Start-Sleep -Seconds 5
  }
  return $false
}

function New-Secret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}
