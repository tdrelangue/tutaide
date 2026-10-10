# Creates .env with fresh secrets. Run once, on the server.
#   .\init.ps1 -Domain tutellia.udaf75.local -Version 2.1.0 [-Tls internal] [-License KEY]
param(
  [Parameter(Mandatory)] [string]$Domain,
  [Parameter(Mandatory)] [string]$Version,
  [string]$Tls = "internal",
  [string]$License = ""
)
. "$PSScriptRoot\lib.ps1"

if (Test-Path .env) { Fail ".env existe déjà : ce serveur est déjà initialisé (rien n'a été modifié)" }

$lines = @(
  "TUTELLIA_DOMAIN=$Domain",
  "TUTELLIA_TLS=$Tls",
  "TUTELLIA_IMAGE=tutellia-server",
  "TUTELLIA_TAG=$Version",
  "DB_PASSWORD=$(New-Secret)",
  "AUTH_SECRET=$(New-Secret)",
  "ENCRYPTION_KEY=$(New-Secret)",
  "TUTELLIA_LICENSE_KEY=$License",
  "HTTPS_PORT=443",
  "HTTP_PORT=80"
)
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot ".env"), $lines)
# Only the current user (and administrators) may read the secrets.
icacls .env /inheritance:r /grant:r "$($env:USERNAME):(R,W)" /grant:r "Administrators:(F)" | Out-Null
New-Item -ItemType Directory -Force certs, backups | Out-Null
Info ".env créé (secrets générés sur ce serveur, à ne jamais partager)."
Info "Suite : .\setup.ps1 pour créer la structure et son premier administrateur."
