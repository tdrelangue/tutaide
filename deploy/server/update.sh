#!/bin/sh
# Updates Tutellia to a new version, safely:
#   1. a backup is made first (no backup → no update),
#   2. the new version is started,
#   3. if it does not answer its health check, the previous version is put back.
#   ./update.sh 2.1.1 [tutellia-server-2.1.1.tar]   (the .tar = offline delivery)
. "$(dirname "$0")/lib.sh"

new="${1:-}"
[ -n "$new" ] || die "usage : ./update.sh <nouvelle-version> [image.tar]"
old="$(env_value TUTELLIA_TAG)"
[ "$new" = "$old" ] && die "la version $new est déjà installée"

if [ -n "${2:-}" ]; then
  info "Chargement de l'image $2…"
  docker load -i "$2"
fi
docker image inspect "$(env_value TUTELLIA_IMAGE):$new" >/dev/null 2>&1 || die "image $(env_value TUTELLIA_IMAGE):$new introuvable"

info "Sauvegarde avant mise à jour…"
backup_dir="$(./backup.sh | tail -1)"

info "Passage de $old à $new…"
set_env_value TUTELLIA_TAG "$new"
compose up -d app
if wait_healthy; then
  info "Mise à jour réussie : version $new. Sauvegarde d'avant : $backup_dir"
  exit 0
fi

echo "La version $new ne répond pas : retour à la version $old." >&2
set_env_value TUTELLIA_TAG "$old"
compose up -d app
wait_healthy || die "la version $old ne répond pas non plus : restaurez $backup_dir avec ./restore.sh"
die "mise à jour annulée, la version $old fonctionne. Sauvegarde : $backup_dir"
