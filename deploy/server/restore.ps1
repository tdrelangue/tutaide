# Restores a backup made by backup.ps1: database AND documents are replaced.
#   .\restore.ps1 -Backup backups\20261007-221500
param([Parameter(Mandatory)] [string]$Backup)
. "$PSScriptRoot\lib.ps1"

if (-not (Test-Path "$Backup\db.dump") -or -not (Test-Path "$Backup\documents.tar.gz")) { Fail "sauvegarde incomplète : $Backup" }
$answer = Read-Host "Remplacer TOUTES les données actuelles par la sauvegarde $Backup ? Tapez RESTAURER"
if ($answer -ne "RESTAURER") { Fail "annulé, rien n'a été modifié" }

Info "Arrêt de Tutellia…"
Invoke-Compose stop app
Invoke-Compose up -d db
Info "Restauration de la base…"
cmd /c "docker compose --env-file .env exec -T db pg_restore -U tutellia -d tutellia --clean --if-exists --no-owner < `"$Backup\db.dump`""
Info "Restauration des documents…"
cmd /c "docker compose --env-file .env run --rm --no-deps -T --entrypoint sh app -c `"rm -rf /data/documents/* && tar -C /data -xzf -`" < `"$Backup\documents.tar.gz`""
if ($LASTEXITCODE -ne 0) { Fail "restauration des documents impossible" }
Info "Redémarrage…"
Invoke-Compose up -d
if (-not (Wait-Healthy)) { Fail "Tutellia ne répond pas après restauration : voir « docker compose logs app »" }
Info "Restauration terminée."
