#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/build.sh
mkdir -p dist/pages
cp dist/server/index.js dist/pages/_worker.js
cp src/index.html src/style.css src/app.js dist/pages/
