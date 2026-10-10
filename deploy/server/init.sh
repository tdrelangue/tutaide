#!/bin/sh
# Creates .env with fresh secrets. Run once, on the server.
#   ./init.sh tutellia.udaf75.local 2.1.0 [internal|email|"/certs/cert.pem /certs/key.pem"] [licence]
. "$(dirname "$0")/lib.sh"

[ -f .env ] && die ".env existe déjà : ce serveur est déjà initialisé (rien n'a été modifié)"
[ $# -ge 2 ] || die "usage : ./init.sh <nom-du-serveur> <version> [certificat] [licence]"

secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

umask 077
cat > .env <<EOF
TUTELLIA_DOMAIN=$1
TUTELLIA_TLS=${3:-internal}
TUTELLIA_IMAGE=tutellia-server
TUTELLIA_TAG=$2
DB_PASSWORD=$(secret)
AUTH_SECRET=$(secret)
ENCRYPTION_KEY=$(secret)
TUTELLIA_LICENSE_KEY=${4:-}
HTTPS_PORT=443
HTTP_PORT=80
EOF
mkdir -p certs backups
info ".env créé (secrets générés sur ce serveur, à ne jamais partager)."
info "Suite : ./setup.sh pour créer la structure et son premier administrateur."
