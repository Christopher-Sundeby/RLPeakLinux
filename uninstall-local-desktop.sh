#!/usr/bin/env bash

# Local Desktop Entry and Icon Uninstaller for RLPeak
# Safely removes the locally installed RLPeak files.

set -e

INSTALL_BIN_DIR="$HOME/.local/bin"
INSTALL_APPS_DIR="$HOME/.local/share/applications"
INSTALL_ICONS_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"

echo "=== RLPeak Linux Desktop Uninstaller ==="

# 1. Remove binary
if [ -f "$INSTALL_BIN_DIR/rlpeak" ]; then
    echo "[+] Removing binary at $INSTALL_BIN_DIR/rlpeak..."
    rm "$INSTALL_BIN_DIR/rlpeak"
else
    echo "[-] Binary $INSTALL_BIN_DIR/rlpeak not found."
fi

# 2. Remove icon
if [ -f "$INSTALL_ICONS_DIR/rlpeak.png" ]; then
    echo "[+] Removing icon at $INSTALL_ICONS_DIR/rlpeak.png..."
    rm "$INSTALL_ICONS_DIR/rlpeak.png"
else
    echo "[-] Icon $INSTALL_ICONS_DIR/rlpeak.png not found."
fi

# 3. Remove desktop entry file
if [ -f "$INSTALL_APPS_DIR/rlpeak.desktop" ]; then
    echo "[+] Removing desktop entry at $INSTALL_APPS_DIR/rlpeak.desktop..."
    rm "$INSTALL_APPS_DIR/rlpeak.desktop"
else
    echo "[-] Desktop entry $INSTALL_APPS_DIR/rlpeak.desktop not found."
fi

# 4. Update desktop database and icon caches if tools exist
if command -v update-desktop-database &> /dev/null; then
    echo "[+] Updating desktop database..."
    update-desktop-database "$INSTALL_APPS_DIR" || true
fi

if command -v gtk-update-icon-cache &> /dev/null; then
    echo "[+] Updating GTK icon cache..."
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
fi

echo "[+] Success! RLPeak has been successfully uninstalled from your local system."
