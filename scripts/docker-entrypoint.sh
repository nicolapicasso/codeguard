#!/bin/sh
set -e

echo "==> Granting schema permissions..."
npx prisma db execute --stdin << 'EOF'
GRANT ALL ON SCHEMA public TO current_user;
EOF

echo "==> Running database migrations..."
npx prisma migrate deploy

if [ "${SEED_ON_DEPLOY:-false}" = "true" ]; then
  echo "==> Seeding database..."
  npx prisma db seed
fi

echo "==> Starting server..."
exec node dist/server.js