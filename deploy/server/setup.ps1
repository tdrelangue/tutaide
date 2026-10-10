# First run: starts the services and creates the organisation with its first administrator.
#   .\setup.ps1 -Organisation "UDAF 75" -AdminName "Ines Martin" -AdminEmail it@udaf75.fr [-Role aucun]
param(
  [Parameter(Mandatory)] [string]$Organisation,
  [Parameter(Mandatory)] [string]$AdminName,
  [Parameter(Mandatory)] [string]$AdminEmail,
  [ValidateSet("mandataire", "assistant", "aucun")] [string]$Role = "aucun"
)
. "$PSScriptRoot\lib.ps1"
if (-not (Test-Path .env)) { Fail "pas de fichier .env ici : lancez d'abord .\init.ps1" }

$secure = Read-Host "Mot de passe provisoire de $AdminEmail (8 caractères minimum)" -AsSecureString
$env:TUTELLIA_SETUP_PASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password
try {
  Info "Démarrage de la base de données…"
  Invoke-Compose up -d db
  Info "Création de la structure…"
  Invoke-Compose run --rm -e TUTELLIA_SETUP_PASSWORD app node setup.mjs --org $Organisation --name $AdminName --email $AdminEmail --role $Role
} finally {
  Remove-Item Env:\TUTELLIA_SETUP_PASSWORD -ErrorAction SilentlyContinue
}
Info "Démarrage de Tutellia…"
Invoke-Compose up -d
if (-not (Wait-Healthy)) { Fail "Tutellia ne répond pas : voir « docker compose logs app »" }
Info "Prêt : https://$(Get-EnvValue TUTELLIA_DOMAIN)"
