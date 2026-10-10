# Backup: database + documents + .env. Creates backups\<date>\ (sensitive: copy it somewhere safe).
. "$PSScriptRoot\lib.ps1"
if (-not (Test-Path .env)) { Fail "pas de fichier .env ici" }

$dir = Join-Path "backups" (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Force $dir | Out-Null
# Binary output must not go through PowerShell pipes (it would be re-encoded): cmd redirects bytes as-is.
Info "Base de données → $dir\db.dump"
cmd /c "docker compose --env-file .env exec -T db pg_dump -U tutellia -Fc tutellia > `"$dir\db.dump`""
if ($LASTEXITCODE -ne 0 -or (Get-Item "$dir\db.dump").Length -eq 0) { Fail "sauvegarde de la base impossible" }
Info "Documents → $dir\documents.tar.gz"
cmd /c "docker compose --env-file .env exec -T app tar -C /data -czf - documents > `"$dir\documents.tar.gz`""
if ($LASTEXITCODE -ne 0) { Fail "sauvegarde des documents impossible" }
Copy-Item .env (Join-Path $dir "env.backup")
Set-Content -Path (Join-Path $dir "version") -Value (Get-EnvValue TUTELLIA_TAG)
Info "Sauvegarde terminée : $dir"
Write-Output $dir
