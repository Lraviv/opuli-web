#!/bin/sh
# בונה את האתר ומעלה אותו ל-https://opuli.web.app. מריצים מתוך web/:  sh scripts/deploy-hosting.sh
set -e
PROJECT=project-e6da20fc-9ce2-47c3-81a
OUT=$(mktemp -d)
VITE_API_URL=https://opuli-api-132904013261.me-west1.run.app \
VITE_GOOGLE_CLIENT_ID=$(grep '^VITE_GOOGLE_CLIENT_ID=' .env | cut -d= -f2-) \
  npm run build -- --outDir "$OUT" --emptyOutDir
ACCESS_TOKEN=$(gcloud auth print-access-token) PROJECT=$PROJECT python3 scripts/deploy_hosting.py opuli "$OUT"
rm -rf "$OUT"
