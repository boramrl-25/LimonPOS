#!/usr/bin/env bash
# Limon POS Backoffice – sunucuda çalıştırılacak deploy script (git pull, npm install, build, pm2 restart)
set -e
# nvm veya benzeri ile Node yüklüyse PATH'e ekle
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
if [ -s "/root/.nvm/nvm.sh" ]; then . "/root/.nvm/nvm.sh"; fi

REPO_DIR="${REPO_DIR:-/root/LimonPOS}"
cd "$REPO_DIR"
git pull
cd pos-backoffice
npm install
npm run build
pm2 restart all
echo "Deploy done."
