#!/usr/bin/env bash

# Local Desktop Entry Utility for RLPeak
# Installs/Uninstalls RLPeak user-wide without requiring sudo/root privileges.

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_PATH="$PROJECT_DIR/src-tauri/target/release/tauri-app"
INSTALL_BIN_DIR="$HOME/.local/bin"
INSTALL_APPS_DIR="$HOME/.local/share/applications"
INSTALL_ICONS_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"

# Restore cursor visibility on exit or interrupt
cleanup() {
    echo -ne "\033[?25h"
}
trap cleanup EXIT INT TERM

install_rlpeak() {
    echo ""
    echo "=== Installing RLPeak Locally ==="

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

    # 6. Update caches
    update_caches
    echo "[+] Success! RLPeak has been registered on your system."
}

uninstall_rlpeak() {
    echo ""
    echo "=== Uninstalling RLPeak Locally ==="

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

    # 4. Update caches
    update_caches
    echo "[+] Success! RLPeak has been uninstalled from your system."
}

update_caches() {
    # Update desktop database and icon caches if tools exist
    if command -v update-desktop-database &> /dev/null; then
        echo "[+] Updating desktop database..."
        update-desktop-database "$INSTALL_APPS_DIR" || true
    fi

    if command -v gtk-update-icon-cache &> /dev/null; then
        echo "[+] Updating GTK icon cache..."
        gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
    fi
}

show_menu() {
    local selected=0
    local options=("Install RLPeak Locally" "Uninstall RLPeak Locally" "Exit")
    local num_options=${#options[@]}

    # Hide cursor for elegant rendering
    echo -ne "\033[?25l"
    
    # Save initial cursor position
    echo -en "\033[s"

    while true; do
        # Restore cursor and clear screen from cursor down
        echo -en "\033[u\033[J"
        
        echo "====================================="
        echo "      RLPeak Linux Desktop Tool      "
        echo "====================================="
        for i in "${!options[@]}"; do
            if [ "$i" -eq "$selected" ]; then
                # Highlight selected with cyan arrow and bold text
                echo -e "  \033[1;36m>\033[0m \033[1;36m${options[$i]}\033[0m"
            else
                echo -e "    ${options[$i]}"
            fi
        done
        echo "====================================="
        echo "Use arrow keys (Up/Down) and press Enter to select."

        # Read keystrokes
        IFS= read -r -s -n1 key
        if [[ $key == $'\x1b' ]]; then
            read -r -s -n2 key
            if [[ $key == "[A" ]]; then # Up Arrow
                ((selected--))
                if [ $selected -lt 0 ]; then
                    selected=$((num_options - 1))
                fi
            elif [[ $key == "[B" ]]; then # Down Arrow
                ((selected++))
                if [ $selected -ge $num_options ]; then
                    selected=0
                fi
            fi
        elif [[ $key == "" ]]; then # Enter Key
            break
        fi
    done

    # Restore cursor and clear the menu area
    echo -ne "\033[?25h"
    echo -en "\033[u\033[J"

    case $selected in
        0)
            install_rlpeak
            ;;
        1)
            uninstall_rlpeak
            ;;
        2)
            echo "Exiting..."
            exit 0
            ;;
    esac
}

# Main routing logic
if [ "$1" == "--install" ] || [ "$1" == "-i" ]; then
    install_rlpeak
elif [ "$1" == "--uninstall" ] || [ "$1" == "-u" ]; then
    uninstall_rlpeak
else
    show_menu
fi
