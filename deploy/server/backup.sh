#!/bin/sh
# Backup: database + documents + .env (needed to read stored mail passwords).
# Creates backups/<date>/. Copy that folder somewhere else (it is sensitive).
#   ./backup.sh
. "$(dirname "$0")/lib.sh"

dir="backups/$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir -p "$dir"
info "Base de données → $dir/db.dump"
compose exec -T db pg_dump -U tutellia -Fc tutellia > "$dir/db.dump"
info "Documents → $dir/documents.tar.gz"
compose exec -T app tar -C /data -czf - documents > "$dir/documents.tar.gz"
cp .env "$dir/env.backup"
[ -s "$dir/db.dump" ] || die "sauvegarde de la base vide"
echo "$(env_value TUTELLIA_TAG)" > "$dir/version"
info "Sauvegarde terminée : $dir"
echo "$dir"
