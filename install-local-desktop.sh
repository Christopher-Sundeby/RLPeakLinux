#!/usr/bin/env bash

# Local Desktop Entry and Icon Installer for RLPeak
# Installs RLPeak user-wide without requiring sudo/root privileges.

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_PATH="$PROJECT_DIR/src-tauri/target/release/tauri-app"
INSTALL_BIN_DIR="$HOME/.local/bin"
INSTALL_APPS_DIR="$HOME/.local/share/applications"
INSTALL_ICONS_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"

echo "=== RLPeak Linux Desktop Installer ==="

# 1. Verify binary is built
if [ ! -f "$BINARY_PATH" ]; then
    echo "[-] Error: Compiled binary not found at $BINARY_PATH"
    echo "    Please build the project first by running: npm run package:release"
    exit 1
fi

# 2. Create directories if they don't exist
mkdir -p "$INSTALL_BIN_DIR"
mkdir -p "$INSTALL_APPS_DIR"
mkdir -p "$INSTALL_ICONS_DIR"

# 3. Copy binary
echo "[+] Copying binary to $INSTALL_BIN_DIR/rlpeak..."
cp "$BINARY_PATH" "$INSTALL_BIN_DIR/rlpeak"
chmod +x "$INSTALL_BIN_DIR/rlpeak"

# 4. Copy app icon
echo "[+] Copying icon to $INSTALL_ICONS_DIR/rlpeak.png..."
cp "$PROJECT_DIR/src-tauri/icons/128x128.png" "$INSTALL_ICONS_DIR/rlpeak.png"

# 5. Create desktop entry file
echo "[+] Creating desktop entry at $INSTALL_APPS_DIR/rlpeak.desktop..."
cat << EOF > "$INSTALL_APPS_DIR/rlpeak.desktop"
[Desktop Entry]
Type=Application
Name=RLPeak
Comment=Rocket League Companion (Decals, Maps & Stats Overlay)
Exec=$INSTALL_BIN_DIR/rlpeak
Icon=rlpeak
Terminal=false
Categories=Game;Utility;
Keywords=rocketleague;rocket;league;stats;overlay;customizer;
EOF

chmod +x "$INSTALL_APPS_DIR/rlpeak.desktop"

# 6. Update desktop database and icon caches if tools exist
if command -v update-desktop-database &> /dev/null; then
    echo "[+] Updating desktop database..."
    update-desktop-database "$INSTALL_APPS_DIR" || true
fi

if command -v gtk-update-icon-cache &> /dev/null; then
    echo "[+] Updating GTK icon cache..."
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
fi

echo "[+] Success! RLPeak is now registered on your system."
echo "    It will now show up in your application menu and search bar."
echo "    Note: If you just created '$INSTALL_BIN_DIR' for the first time, you may need to log out and log back in for your launcher to find it."
