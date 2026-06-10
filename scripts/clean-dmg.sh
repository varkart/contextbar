#!/usr/bin/env bash
# Post-process Tauri DMG: remove .VolumeIcon.icns added by bundle_dmg.sh
set -e

DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" | head -1)
[ -z "$DMG" ] && { echo "No DMG found"; exit 0; }

RW="/tmp/aicontextbar_clean_rw.dmg"
MOUNT="/Volumes/aicontextbar_clean"

hdiutil detach "$MOUNT" 2>/dev/null || true
hdiutil convert "$DMG" -format UDRW -o "$RW" -ov -quiet
hdiutil attach "$RW" -mountpoint "$MOUNT" -quiet

rm -f "$MOUNT/.VolumeIcon.icns"
SetFile -a c "$MOUNT" 2>/dev/null || true  # clear custom icon bit

hdiutil detach "$MOUNT" -quiet
hdiutil convert "$RW" -format UDZO -o "$DMG" -ov -quiet
rm -f "$RW"

echo "Cleaned: $DMG ($(du -sh "$DMG" | cut -f1))"
