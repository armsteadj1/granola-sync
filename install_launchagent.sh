#!/bin/bash
set -e

PLIST_NAME="com.user.granola-sync.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
SUPPORT_DIR="$HOME/Library/Application Support/granola-sync"
LAUNCHER_PATH="$SUPPORT_DIR/launcher.sh"

echo "=== Installing Granola Sync LaunchAgent ==="
echo ""

# Verify granola-sync is installed
if ! command -v granola-sync &>/dev/null; then
    echo "ERROR: granola-sync binary not found."
    echo "Install it first with: npm install -g @armsteadj1/granola-sync"
    exit 1
fi

echo "Found granola-sync at: $(command -v granola-sync)"

# Create support dir
mkdir -p "$SUPPORT_DIR"

# Write wrapper script that loads node version managers before running.
# This means node upgrades (nvm, fnm, volta) never break the daemon.
cat > "$LAUNCHER_PATH" << 'LAUNCHER_EOF'
#!/bin/bash
# Granola Sync Launcher
# Loads node version managers so the daemon works regardless of node version or upgrades.

# nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# fnm
if command -v fnm &>/dev/null; then
  eval "$(fnm env)"
fi

# volta
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

exec granola-sync sync
LAUNCHER_EOF

chmod +x "$LAUNCHER_PATH"
echo "Created launcher at: $LAUNCHER_PATH"

# Create LaunchAgents directory if needed
mkdir -p "$LAUNCH_AGENTS_DIR"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.granola-sync</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$LAUNCHER_PATH</string>
    </array>

    <key>StartInterval</key>
    <integer>1800</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/granola-sync.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/granola-sync.log</string>
</dict>
</plist>
EOF

echo "Created plist at: $PLIST_PATH"

# Unload if already loaded
if launchctl list | grep -q "com.user.granola-sync"; then
    echo "Unloading existing LaunchAgent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Load the new agent
echo "Loading LaunchAgent..."
launchctl load "$PLIST_PATH"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "The sync will run:"
echo "  - Immediately on load"
echo "  - Every 30 minutes"
echo ""
echo "To check status:"
echo "  launchctl list | grep granola"
echo "  granola-sync status"
echo ""
echo "To view logs:"
echo "  tail -f ~/Library/Logs/granola-sync.log"
echo ""
echo "To stop:"
echo "  launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
