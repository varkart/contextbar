#!/usr/bin/env bash
# Post-process Tauri DMG: remove hidden clutter added by bundle_dmg.sh and macOS
set -e

DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" | head -1)
[ -z "$DMG" ] && { echo "No DMG found"; exit 0; }

RW="/tmp/aicontextbar_clean_rw.dmg"
MOUNT="/Volumes/aicontextbar_clean"

hdiutil detach "$MOUNT" 2>/dev/null || true
hdiutil convert "$DMG" -format UDRW -o "$RW" -ov -quiet

# -nobrowse: volume not shown in Finder/sidebar, suppresses FSEvents tracking
hdiutil attach "$RW" -mountpoint "$MOUNT" -nobrowse -quiet

SetFile -a c "$MOUNT" 2>/dev/null || true  # clear custom volume icon bit

# Delete right before detach (FSEvents recreates on mount, delete it last)
rm -f "$MOUNT/.VolumeIcon.icns"
rm -rf "$MOUNT/.fseventsd"
sync

hdiutil detach "$MOUNT" -quiet
hdiutil convert "$RW" -format UDZO -o "$DMG" -ov -quiet
rm -f "$RW"

echo "Cleaned: $DMG ($(du -sh "$DMG" | cut -f1))"
