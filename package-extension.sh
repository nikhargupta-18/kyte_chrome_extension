#!/bin/bash
# package-extension.sh — Creates a clean ZIP for Chrome Web Store submission

EXTENSION_NAME="kyte"
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUTPUT="${EXTENSION_NAME}-v${VERSION}.zip"

# Remove old package
rm -f "$OUTPUT"

# Create ZIP excluding dev files
zip -r "$OUTPUT" . \
  -x ".git/*" \
  -x "node_modules/*" \
  -x ".env" \
  -x "*.map" \
  -x "CHROMEWEBSTORE.md" \
  -x "FIREFOXSTORE.md" \
  -x "README.md" \
  -x "*.sh" \
  -x ".DS_Store" \
  -x "Thumbs.db" \
  -x "store-assets/*" \
  -x "*.zip" \
  -x "_metadata/*" \
  -x "*.py" \
  -x "icons/icon-1024.png"

echo "✅ Packaged: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "   Upload this file at: https://chrome.google.com/webstore/devconsole"
