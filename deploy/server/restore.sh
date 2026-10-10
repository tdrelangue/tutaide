#!/bin/sh
# Restores a backup made by backup.sh: database AND documents are replaced.
#   ./restore.sh backups/20261007-221500
. "$(dirname "$0")/lib.sh"

src="${1:-}"
[ -n "$src" ] && [ -f "$src/db.dump" ] && [ -f "$src/documents.tar.gz" ] || die "usage : ./restore.sh <dossier de sauvegarde>"

printf "Remplacer TOUTES les données actuelles par la sauvegarde %s ? Tapez RESTAURER : " "$src"
read -r answer
[ "$answer" = "RESTAURER" ] || die "annulé, rien n'a été modifié"

info "Arrêt de Tutellia…"
compose stop app
compose up -d db
info "Restauration de la base…"
compose exec -T db pg_restore -U tutellia -d tutellia --clean --if-exists --no-owner < "$src/db.dump"
info "Restauration des documents…"
compose run --rm --no-deps -T --entrypoint sh app -c "rm -rf /data/documents/* && tar -C /data -xzf -" < "$src/documents.tar.gz"
info "Redémarrage…"
compose up -d
wait_healthy || die "Tutellia ne répond pas après restauration : voir « docker compose logs app »"
info "Restauration terminée."
