#!/bin/sh
set -e

echo "==> Granting schema permissions..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$executeRawUnsafe('ALTER SCHEMA public OWNER TO CURRENT_USER')
  .then(() => prisma.\$executeRawUnsafe('GRANT ALL ON SCHEMA public TO CURRENT_USER'))
  .then(() => prisma.\$disconnect())
  .catch((e) => { console.warn('Grant warning:', e.message); return prisma.\$disconnect(); });
"

echo "==> Running database migrations..."
npx prisma migrate deploy

if [ "${SEED_ON_DEPLOY:-false}" = "true" ]; then
  echo "==> Seeding database..."
  npx prisma db seed
fi

echo "==> Starting server..."
exec node dist/server.js