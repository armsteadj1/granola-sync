#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.user.granola-sync.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "=== Installing Granola Sync LaunchAgent ==="
echo ""

# Create LaunchAgents directory if needed
mkdir -p "$LAUNCH_AGENTS_DIR"

# Create the plist with correct paths
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
        <string>/usr/bin/env</string>
        <string>python3</string>
        <string>$SCRIPT_DIR/granola_sync.py</string>
    </array>

    <key>StartInterval</key>
    <integer>1800</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/granola-sync.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/granola-sync.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
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
echo ""
echo "To view logs:"
echo "  tail -f ~/Library/Logs/granola-sync.log"
echo ""
echo "To stop:"
echo "  launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
