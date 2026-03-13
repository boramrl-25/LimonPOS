#!/usr/bin/env bash
# Limon POS Backoffice – sunucuda çalıştırılacak deploy script (git pull, npm install, build, pm2 restart)
set -e

REPO_DIR="${REPO_DIR:-/var/www/limon-pos}"
cd "$REPO_DIR"
git pull
cd pos-backoffice
npm install
npm run build
pm2 restart all
echo "Deploy done."
