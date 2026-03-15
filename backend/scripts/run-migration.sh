#!/bin/bash
# Hibrit mimari audit kolonları için migration
# Kullanım: cd backend && ./scripts/run-migration.sh
# Veya: DATABASE_URL="postgresql://..." npm run db:push
set -e
cd "$(dirname "$0")/.."
if [ -z "$DATABASE_URL" ]; then
  if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
  fi
fi
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL gerekli. .env dosyasında veya ortam değişkeni olarak tanımlayın."
  exit 1
fi
echo "Running prisma db push..."
npx prisma db push
echo "Migration tamamlandı."
