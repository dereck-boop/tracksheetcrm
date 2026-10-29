#!/bin/sh
# Vercel build: apply database migrations, then build Next.js.
# Neon's Vercel integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct).
# Migrations should use the direct connection when it exists.
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. In Vercel open Storage, connect a Neon Postgres database to this project (all environments), then redeploy." >&2
  exit 1
fi
prisma generate
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" prisma migrate deploy
next build
