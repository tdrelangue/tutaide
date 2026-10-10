#!/bin/sh
# First run: starts the services and creates the organisation with its first
# administrator. The temporary password is asked for (never on the command line).
#   ./setup.sh "UDAF 75" "Ines Martin" it@udaf75.fr [mandataire|assistant|aucun]
. "$(dirname "$0")/lib.sh"

[ $# -ge 3 ] || die "usage : ./setup.sh \"<structure>\" \"<nom de l'administrateur>\" <email> [rôle]"

printf "Mot de passe provisoire de %s (8 caractères minimum) : " "$3"
stty -echo 2>/dev/null || true; read -r password; stty echo 2>/dev/null || true; echo

info "Démarrage de la base de données…"
compose up -d db
info "Création de la structure…"
TUTELLIA_SETUP_PASSWORD="$password" compose run --rm -e TUTELLIA_SETUP_PASSWORD app \
  node setup.mjs --org "$1" --name "$2" --email "$3" --role "${4:-aucun}"
info "Démarrage de Tutellia…"
compose up -d
wait_healthy || die "Tutellia ne répond pas : voir « docker compose logs app »"
info "Prêt : https://$(env_value TUTELLIA_DOMAIN)"
