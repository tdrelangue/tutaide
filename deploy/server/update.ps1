# Updates Tutellia safely: backup first, start the new version, go back to the old one if it does not answer.
#   .\update.ps1 -Version 2.1.1 [-ImageFile tutellia-server-2.1.1.tar]
param([Parameter(Mandatory)] [string]$Version, [string]$ImageFile = "")
. "$PSScriptRoot\lib.ps1"

$old = Get-EnvValue TUTELLIA_TAG
if ($Version -eq $old) { Fail "la version $Version est déjà installée" }
$image = "$(Get-EnvValue TUTELLIA_IMAGE):$Version"
if ($ImageFile) { Info "Chargement de l'image $ImageFile…"; docker load -i $ImageFile; if ($LASTEXITCODE -ne 0) { Fail "image illisible" } }
docker image inspect $image *> $null
if ($LASTEXITCODE -ne 0) { Fail "image $image introuvable" }

Info "Sauvegarde avant mise à jour…"
$backupDir = & "$PSScriptRoot\backup.ps1" | Select-Object -Last 1

Info "Passage de $old à $Version…"
Set-EnvValue TUTELLIA_TAG $Version
Invoke-Compose up -d app
if (Wait-Healthy) { Info "Mise à jour réussie : version $Version. Sauvegarde d'avant : $backupDir"; exit 0 }

Write-Host "La version $Version ne répond pas : retour à la version $old." -ForegroundColor Yellow
Set-EnvValue TUTELLIA_TAG $old
Invoke-Compose up -d app
if (-not (Wait-Healthy)) { Fail "la version $old ne répond pas non plus : restaurez $backupDir avec .\restore.ps1" }
Fail "mise à jour annulée, la version $old fonctionne. Sauvegarde : $backupDir"
