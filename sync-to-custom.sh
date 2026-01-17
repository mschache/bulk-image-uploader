#!/bin/bash

# Sync code from appstore version to custom version
# Run this after making changes to sync both distributions

SOURCE="/Users/marcoschache/github/bulk-image-uploader-appstore/"
DEST="/Users/marcoschache/github/bulk-image-uploader-custom/"

echo "Syncing code from appstore to custom distribution..."

rsync -av --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.shopify' \
  --exclude='shopify.app.*.toml' \
  --exclude='shopify.app.toml' \
  --exclude='*.sqlite*' \
  --exclude='build' \
  --exclude='.cache' \
  "$SOURCE" "$DEST"

echo ""
echo "Sync complete!"
echo ""
echo "Note: The following are NOT synced (app-specific):"
echo "  - .env (API credentials)"
echo "  - shopify.app.toml (app config)"
echo "  - node_modules, build, .cache"
echo ""
echo "If you added new dependencies, run in custom folder:"
echo "  cd $DEST && npm install"
