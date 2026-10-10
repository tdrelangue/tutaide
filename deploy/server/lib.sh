# Shared helpers for the Tutellia server scripts (sourced, not run).
set -eu
cd "$(dirname "$0")"

die() { echo "ERREUR : $*" >&2; exit 1; }
info() { echo "==> $*"; }

[ -f .env ] || [ "$(basename "$0")" = "init.sh" ] || die "pas de fichier .env ici : lancez d'abord ./init.sh"

compose() { docker compose --env-file .env "$@"; }

env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }

set_env_value() {
  tmp=$(mktemp)
  grep -v -E "^$1=" .env > "$tmp"
  echo "$1=$2" >> "$tmp"
  cat "$tmp" > .env && rm -f "$tmp"
}

# Waits until Tutellia answers its health check (inside the app container).
wait_healthy() {
  i=0
  while [ "$i" -lt 60 ]; do
    if compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      return 0
    fi
    i=$((i + 1)); sleep 5
  done
  return 1
}
