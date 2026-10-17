#!/bin/bash
# package-extension.sh — Creates a clean ZIP for Chrome Web Store submission
set -euo pipefail

EXTENSION_NAME="kyte"
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUTPUT="${EXTENSION_NAME}-v${VERSION}.zip"

# Package only files needed by the extension at runtime.
rm -f "$OUTPUT"
zip -q "$OUTPUT" \
  manifest.json service-worker.js \
  blocked.html blocked.js blocked.css \
  content/content.js content/content.css \
  popup/popup.html popup/popup.js popup/popup.css \
  rules/blocked_rules.json \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png

echo "✅ Packaged: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "   Upload this file at: https://chrome.google.com/webstore/devconsole"
