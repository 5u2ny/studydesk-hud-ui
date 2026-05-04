#!/usr/bin/env bash
# Rename the dev-mode Electron.app to "StudyDesk" so the dock hover
# tooltip and macOS menu-bar app name read "StudyDesk" instead of
# "Electron" during `npm start`. Packaged builds (electron-builder)
# already set this via package.json `productName`; this script is
# only for the dev path that runs node_modules/electron directly.
#
# Idempotent — safe to run on every npm start. Only writes if the
# value actually differs, so it costs ~10ms in the no-op case.
#
# Note: `npm install` overwrites node_modules/electron and resets
# these values, so this script must run again afterwards. The
# `prestart` script in package.json takes care of that.

set -e

PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"
APP_NAME="StudyDesk"

if [ ! -f "$PLIST" ]; then
  echo "[dev-rebrand] Electron.app Info.plist not found, skipping" >&2
  exit 0
fi

current=$(/usr/libexec/PlistBuddy -c "Print CFBundleName" "$PLIST" 2>/dev/null || echo "")
if [ "$current" = "$APP_NAME" ]; then
  exit 0
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleName $APP_NAME" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :CFBundleName string $APP_NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $APP_NAME" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $APP_NAME" "$PLIST"

# Refresh Launch Services so Finder/Dock pick up the rename without a logout.
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister \
  -f "node_modules/electron/dist/Electron.app" >/dev/null 2>&1 || true

echo "[dev-rebrand] Set CFBundleName / CFBundleDisplayName to \"$APP_NAME\""
