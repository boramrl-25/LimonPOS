#!/usr/bin/env bash
set -e

SERVER_USER="root"
SERVER_HOST="77.42.70.162"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/id_ed25519}"
REMOTE_DEPLOY_SCRIPT="/usr/local/bin/deploy-limon-pos-backoffice.sh"

echo "=== Limon POS Backoffice Deploy (SSH) ==="
echo "Server : ${SERVER_USER}@${SERVER_HOST}"
echo "Key    : ${KEY_PATH}"
echo "Remote : ${REMOTE_DEPLOY_SCRIPT}"

if [ ! -f "$KEY_PATH" ]; then
  echo "ERROR: SSH key not found at $KEY_PATH"
  echo "Generate one with: ssh-keygen -t ed25519"
  exit 1
fi

ssh -i "$KEY_PATH" "${SERVER_USER}@${SERVER_HOST}" "bash ${REMOTE_DEPLOY_SCRIPT}"

echo "=== Deploy finished ==="

