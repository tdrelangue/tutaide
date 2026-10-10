#!/bin/sh
# Starts the organisation server: brings the database schema up to date, then
# runs Tutellia. Schema changes in Tutellia are additive only; --accept-data-loss
# is deliberately NOT passed, so a destructive change fails safely instead of
# deleting data (the update script then rolls back to the previous version).
set -e

: "${DATABASE_URL:?DATABASE_URL manquant}"
: "${AUTH_SECRET:?AUTH_SECRET manquant}"
: "${ENCRYPTION_KEY:?ENCRYPTION_KEY manquant}"

echo "[tutellia] version ${TUTELLIA_VERSION} — mise à jour du schéma de la base…"
prisma db push --skip-generate --schema ./prisma/schema.prisma

# A one-off command (e.g. `node setup.mjs …` for the first run) runs instead
# of the server, after the schema is ready.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo "[tutellia] démarrage du serveur"
exec node server.js
