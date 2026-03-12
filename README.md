# @armsteadj1/granola-sync

[![CI](https://github.com/armsteadj1/granola-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/armsteadj1/granola-sync/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@armsteadj1/granola-sync.svg)](https://www.npmjs.com/package/@armsteadj1/granola-sync)

Automatically syncs [Granola](https://granola.ai) meeting transcripts to Google Drive. Runs as a macOS LaunchAgent every 30 minutes — no Google Drive API setup required.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Output Format](#output-format)
- [Troubleshooting](#troubleshooting)
- [For AI Agents](#for-ai-agents)

---

## Overview

Granola records and transcribes your meetings locally. This tool reads Granola's local cache, fetches full transcripts from the Granola API, and writes formatted Markdown files into your Google Drive folder — using the Google Drive desktop app's local filesystem mount rather than the Google Drive API.

Each meeting becomes a Markdown file like `2024-11-15 - Weekly Standup.md` containing the meeting title, date, attendees, notes, AI-generated summaries, and full transcript.

---

## Prerequisites

- **macOS** (uses `~/Library/` paths and LaunchAgent)
- **Node.js 18+** (`node --version`)
- **[Granola](https://granola.ai)** installed and signed in — the tool reads from `~/Library/Application Support/Granola/`
- **[Google Drive desktop app](https://www.google.com/drive/download/)** installed and signed in — the tool writes to `~/Library/CloudStorage/GoogleDrive-*/My Drive/`

---

## Installation

### Recommended: Global install

Global install gives you the best experience — the `granola-sync` command is always available and you can set up the LaunchAgent daemon for automatic syncing every 30 minutes.

```bash
npm install -g @armsteadj1/granola-sync
granola-sync setup
```

### Quick try: npx

Run a one-off sync without installing anything. Note that `npx` won't persist a global command, so the LaunchAgent daemon won't work — use the global install above for automatic syncing.

```bash
npx @armsteadj1/granola-sync sync
```

### From source

```bash
git clone <repo-url>
cd @armsteadj1/granola-sync
npm install
npm run build
npm link   # makes granola-sync available globally
granola-sync setup
```

---

## Usage

| Command | Description |
|---|---|
| `@armsteadj1/granola-sync setup` | Check configuration and show status |
| `@armsteadj1/granola-sync sync` | Run a one-time sync |
| `@armsteadj1/granola-sync status` | Show detailed sync state |
| `@armsteadj1/granola-sync status --json` | Machine-readable JSON status |
| `@armsteadj1/granola-sync config --show` | Show current configuration |
| `@armsteadj1/granola-sync config --output-dir <path>` | Set output directory |
| `@armsteadj1/granola-sync daemon` | Run continuous background sync |
| `@armsteadj1/granola-sync doctor` | Run diagnostic checks |
| `@armsteadj1/granola-sync doctor --json` | Diagnostic checks as JSON |
| `@armsteadj1/granola-sync --help` | Show usage |

**Install LaunchAgent for automatic 30-minute syncing:**

```bash
chmod +x install_launchagent.sh
./install_launchagent.sh
```

**Monitor the LaunchAgent:**

```bash
# Check status
launchctl list | grep granola

# Stream logs
tail -f ~/Library/Logs/@armsteadj1/granola-sync.log

# Stop auto-sync
launchctl unload ~/Library/LaunchAgents/com.user.@armsteadj1/granola-sync.plist

# Restart auto-sync
launchctl load ~/Library/LaunchAgents/com.user.@armsteadj1/granola-sync.plist
```

---

## Configuration

| What | Path |
|---|---|
| Granola auth | `~/Library/Application Support/Granola/supabase.json` |
| Granola cache | `~/Library/Application Support/Granola/cache-v6.json` (auto-detected) |
| Sync state | `~/.config/@armsteadj1/granola-sync/sync_state.json` |
| Config file | `~/.config/@armsteadj1/granola-sync/config.yaml` |
| Log file | `~/Library/Logs/@armsteadj1/granola-sync.log` |
| Default output | `~/Library/CloudStorage/GoogleDrive-*/My Drive/Granola Transcripts/` |

**Set a custom output directory:**

```bash
@armsteadj1/granola-sync config --output-dir ~/Documents/Granola
```

**Set a custom cache file** (if Granola changes its cache format):

```bash
@armsteadj1/granola-sync config --cache-file cache-v6.json
```

By default, the tool auto-detects the highest `cache-vN.json` file in Granola's application support directory. You only need to set this if auto-detection doesn't work for your setup.

**Sync state** (`~/.config/@armsteadj1/granola-sync/sync_state.json`) tracks which meetings have been uploaded. Delete this file to force a full re-sync.

---

## How It Works

```
Granola local cache (auto-detected cache-vN.json)
        │
        ▼
  Load meeting list
  Sort newest → oldest
        │
        ▼
  For each unsynced meeting:
    ├── Skip: deleted, in-progress, no content
    ├── Fetch transcript via Granola API
    └── Write Markdown → Google Drive folder
        │
        ▼
  Save sync state (sync_state.json)
```

**Authentication:** Granola stores WorkOS OAuth tokens in `supabase.json`. The tool reads these directly and auto-refreshes them when they expire (with a 5-minute buffer).

**Deduplication:** Each meeting is identified by its Granola document ID (or a SHA-256 hash of title + date for older entries). Already-synced meetings are tracked in `sync_state.json` and skipped. Sync stops early after 10 consecutive already-synced meetings to avoid scanning the entire history every run.

**Content filtering:** Meetings without a transcript *and* without notes are skipped — this avoids creating empty files for calendar blocks.

---

## Output Format

Each meeting produces a Markdown file named `YYYY-MM-DD - Meeting Title.md`:

```markdown
# Weekly Standup

**Date:** 2024-11-15 09:00
**Attendees:** Alice Smith, Bob Jones

---

## Notes

[Your meeting notes from Granola]

---

## Summary

[AI-generated summary]

---

## Transcript

**You:** Let's get started...

**Other:** Sounds good...
```

---

## Troubleshooting

**`Granola auth not found`**
Granola is not installed or you haven't signed in. Open Granola and log in, then check that `~/Library/Application Support/Granola/supabase.json` exists.

**`Google Drive folder not found`**
The Google Drive desktop app is not installed or not signed in. Install it from [google.com/drive/download](https://www.google.com/drive/download/) and sign in. The tool looks for `~/Library/CloudStorage/GoogleDrive-*/My Drive/`.

**`No meetings found in local cache`**
Granola hasn't cached any meetings yet. Open Granola and let it load your meeting history, then retry.

**Token refresh failures**
If the API returns 401 errors, try logging out and back into Granola to reset your tokens, then re-run.

**LaunchAgent not running**
```bash
# Check exit code (0 = success, non-zero = error)
launchctl list | grep granola

# View full logs
cat ~/Library/Logs/@armsteadj1/granola-sync.log
```

---

## For AI Agents

This section is for autonomous agents attempting to help their human set up Granola transcript syncing.

### Important: Agent vs. User Machine Separation

**Granola runs on your human's machine (their laptop), NOT on the agent's machine (your server/Mac mini).**

When you detect that Granola is not installed on your machine:
1. **Don't try to install Granola on the agent machine**
2. **Assume it's on your human's machine**
3. **Provide them with setup instructions** (see below)

### Detection Logic (on Agent Machine)

Run these checks to determine what's available on YOUR machine:

```bash
# 1. Node.js 18+ available?
node --version 2>&1 | grep -E "v(1[89]|[2-9][0-9])\."
# Exit 0 = OK, non-zero = install Node.js 18+

# 2. Granola auth file present?
test -f "$HOME/Library/Application Support/Granola/supabase.json" && echo "OK" || echo "MISSING"
# MISSING = Granola is not on this machine (expected for agents)

# 3. Shared folder accessible?
# Check if your human has set up a shared sync folder you can access
test -d "$HOME/Shared/Granola Transcripts" && echo "OK" || echo "NOT_SETUP"
```

### When Granola is NOT on Agent Machine (Expected Case)

If Granola is not installed on your machine, provide your human with these **setup instructions for THEIR machine**:

```
I found the @armsteadj1/granola-sync tool, but Granola is installed on YOUR machine, not mine.

Here's how to set it up so I can access your meeting transcripts:

**On your machine:**

1. Install the sync tool:
   npm install -g @armsteadj1/granola-sync

2. Configure it to sync to a folder I can access:
   @armsteadj1/granola-sync config --output-dir ~/Dropbox/Granola Transcripts
   
   (Or use Google Drive, iCloud, or any shared folder)

3. Run the initial sync:
   @armsteadj1/granola-sync sync

4. Set up automatic syncing (runs every 30 min):
   curl -fsSL https://raw.githubusercontent.com/thegreysky/@armsteadj1/granola-sync/main/install_launchagent.sh | bash

5. Share the output folder with me:
   - If using Dropbox: Share "Granola Transcripts" folder
   - If using Google Drive: Make sure Drive File Stream is set up on both machines
   - If local network: Set up folder sharing via SMB/AFP

Once you've done this, I'll be able to read your meeting transcripts automatically.
```

### Auto-Setup Flow (When Granola IS on Agent Machine)

Only use this flow if you detect Granola is actually installed on the same machine as the agent:

```bash
# Step 1: Install the tool
npm install -g @armsteadj1/granola-sync

# Step 2: Verify
@armsteadj1/granola-sync doctor --json

# Step 3: Run sync
@armsteadj1/granola-sync sync

# Step 4: Install LaunchAgent
curl -fsSL https://raw.githubusercontent.com/thegreysky/@armsteadj1/granola-sync/main/install_launchagent.sh | bash
```

### Setup Options for Users

When guiding your human, suggest these output directory options:

| Option | Command | Best For |
|---|---|---|
| **Dropbox** | `@armsteadj1/granola-sync config --output-dir ~/Dropbox/Granola` | Easy sharing between machines |
| **Google Drive** | `@armsteadj1/granola-sync config --output-dir ~/Google\ Drive/My\ Drive/Granola` | Already using Google Drive File Stream |
| **iCloud Drive** | `@armsteadj1/granola-sync config --output-dir ~/Library/Mobile\ Documents/com~apple~CloudDocs/Granola` | macOS-only environments |
| **Network Share** | `@armsteadj1/granola-sync config --output-dir /Volumes/shared/Granola` | Local network access |
| **Custom Path** | `@armsteadj1/granola-sync config --output-dir ~/any/path` | Advanced setups |

### Alternatives

| Scenario | Alternative |
|---|---|
| No Google Drive desktop app | Use `@armsteadj1/granola-sync config --output-dir ~/some/path` to write locally, then use `rclone` to push to Google Drive |
| Google Drive API preferred | Replace the file-write logic with Google Drive API v3 calls |
| Linux environment | The sync logic works cross-platform; only the LaunchAgent (macOS-only) and `~/Library/` paths need to change |
| Need Granola data without running Granola | The cache (e.g. `cache-v6.json`) can be read directly — no live Granola process required for cached meetings |
| Want to export to Notion/Obsidian/etc. | The Markdown output from `createMeetingMarkdown()` is portable |

### File Map for Agents

```
src/index.ts          — CLI entry point
src/cli.ts            — All command implementations (setup, sync, status, config, daemon, doctor)
src/sync.ts           — Main sync engine, output folder logic
src/auth.ts           — Granola auth loading and token refresh
src/api.ts            — Granola API client (getTranscript)
src/cache.ts          — Local Granola cache reader
src/markdown.ts       — Markdown generation
src/config.ts         — Config and sync state management
src/status.ts         — Daemon status, log parsing, formatting helpers
src/paths.ts          — All path constants
src/types.ts          — TypeScript interfaces

dist/index.js         — Compiled binary (executable)
install_launchagent.sh — LaunchAgent installer (macOS only)
archive/              — Archived Python implementation
```
