#!/bin/sh
set -e

# Opcional: aplicar migraciones Prisma al arranque (útil en CI/compose controlado).
# En BD compartida (Bluehost / otros stacks) preferir migrate one-shot explícito.
if [ "${RUN_MIGRATE:-false}" = "true" ]; then
  echo "[erp_back] RUN_MIGRATE=true → prisma migrate deploy"
  npx prisma migrate deploy
fi

exec "$@"
