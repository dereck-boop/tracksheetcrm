#!/bin/sh
# Vercel build: apply database migrations, then build Next.js.
# Neon's Vercel integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct).
# Migrations should use the direct connection when it exists.
set -e
if [ -z "$DATABASE_URL" ]; then
  if [ -n "$STORAGE_URL" ] || [ -n "$POSTGRES_URL" ]; then
    echo "ERROR: The database is connected, but under a different name. In Vercel open Storage, disconnect the database from this project, connect it again with Custom Prefix DATABASE, then redeploy." >&2
  else
    echo "ERROR: DATABASE_URL is not set. In Vercel open Storage, connect a Neon Postgres database to this project with Custom Prefix DATABASE, then redeploy." >&2
  fi
  exit 1
fi
prisma generate
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" prisma migrate deploy
next build
