# granola-drive-sync

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
- **Python 3.6+** (`python3 --version`)
- **[Granola](https://granola.ai)** installed and signed in — the tool reads from `~/Library/Application Support/Granola/`
- **[Google Drive desktop app](https://www.google.com/drive/download/)** installed and signed in — the tool writes to `~/Library/CloudStorage/GoogleDrive-*/My Drive/`

---

## Installation

**1. Clone the repository:**

```bash
git clone <repo-url>
cd granola-drive-sync
```

**2. Install the Python dependency:**

```bash
pip3 install -r requirements.txt
```

> Only one dependency: `requests>=2.31.0`

**3. Verify your setup:**

```bash
python3 granola_sync.py --setup
```

This checks that Granola and Google Drive are correctly configured and shows how many meetings are in your local cache.

**4. Install the LaunchAgent for automatic syncing:**

```bash
chmod +x install_launchagent.sh
./install_launchagent.sh
```

The LaunchAgent runs immediately on install, then every 30 minutes.

---

## Usage

| Command | Description |
|---|---|
| `python3 granola_sync.py` | Run a one-time sync |
| `python3 granola_sync.py --setup` | Check configuration and show status |
| `python3 granola_sync.py --help` | Show usage |
| `./install_launchagent.sh` | Install 30-minute auto-sync |

**Monitor the LaunchAgent:**

```bash
# Check status
launchctl list | grep granola

# Stream logs
tail -f ~/Library/Logs/granola-sync.log

# Stop auto-sync
launchctl unload ~/Library/LaunchAgents/com.user.granola-sync.plist

# Restart auto-sync
launchctl load ~/Library/LaunchAgents/com.user.granola-sync.plist
```

---

## Configuration

There are no configuration files to create. The tool uses fixed paths:

| What | Path |
|---|---|
| Granola auth | `~/Library/Application Support/Granola/supabase.json` |
| Granola cache | `~/Library/Application Support/Granola/cache-v3.json` |
| Sync state | `~/.config/granola-sync/sync_state.json` |
| Log file | `~/Library/Logs/granola-sync.log` |
| Output folder | `~/Library/CloudStorage/GoogleDrive-*/My Drive/Granola Transcripts/` |

**Sync state** (`~/.config/granola-sync/sync_state.json`) tracks which meetings have been uploaded. Delete this file to force a full re-sync.

**Output folder name** is hardcoded as `"Granola Transcripts"`. To change it, edit `DRIVE_FOLDER_NAME` in `granola_sync.py`.

---

## How It Works

```
Granola local cache (cache-v3.json)
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
cat ~/Library/Logs/granola-sync.log
```

---

## For AI Agents

This section is for autonomous agents (OpenClaw bots and similar) attempting to self-serve setup, detect environment state, and run or extend this tool without human guidance.

### Detection Logic

Run these checks in order. Each check is independent; a failure tells you exactly what's missing.

```bash
# 1. Python available?
python3 --version 2>&1 | grep -E "Python 3\.[6-9]|Python 3\.[1-9][0-9]"
# Exit 0 = OK, non-zero = install Python 3.6+

# 2. requests library installed?
python3 -c "import requests; print(requests.__version__)"
# Exit 0 = OK, non-zero = run: pip3 install requests

# 3. Granola auth file present?
test -f "$HOME/Library/Application Support/Granola/supabase.json" && echo "OK" || echo "MISSING"
# MISSING = Granola not installed or not signed in (requires human action)

# 4. Granola cache present?
test -f "$HOME/Library/Application Support/Granola/cache-v3.json" && echo "OK" || echo "MISSING"
# MISSING = Granola hasn't populated cache yet; open Granola and wait

# 5. Google Drive mounted?
ls "$HOME/Library/CloudStorage/" | grep "^GoogleDrive-" 2>/dev/null
# No output = Google Drive desktop app not installed or not signed in (requires human action)

# 6. Sync state (optional — absence just means first run)
test -f "$HOME/.config/granola-sync/sync_state.json" && echo "EXISTS" || echo "FIRST_RUN"

# 7. LaunchAgent installed?
test -f "$HOME/Library/LaunchAgents/com.user.granola-sync.plist" && echo "INSTALLED" || echo "NOT_INSTALLED"
```

**Programmatic check via the built-in setup command:**

```bash
python3 granola_sync.py --setup
# Exit 0 = all good
# Exit non-zero = check stdout for specific failure message
```

### Auto-Setup Flow

For an agent running in a provisioned macOS environment where Granola and Google Drive are already signed in:

```bash
# Step 1: Install dependency
pip3 install -r requirements.txt

# Step 2: Verify (read stdout — look for "Ready to sync!")
python3 granola_sync.py --setup

# Step 3: Run one-time sync to validate end-to-end
python3 granola_sync.py

# Step 4: (optional) Install LaunchAgent for persistent scheduling
chmod +x install_launchagent.sh
./install_launchagent.sh

# Step 5: Confirm output files appeared
ls "$HOME/Library/CloudStorage/GoogleDrive-"*/My\ Drive/Granola\ Transcripts/ 2>/dev/null | head -5
```

If Step 2 fails, parse its stdout for these known error strings:
- `"Granola not found"` → Granola auth missing (human must sign in)
- `"Google Drive: NOT FOUND"` → Google Drive not mounted (human must sign in)
- `"No meetings found in local cache"` → Granola cache empty (open Granola, wait, retry)

### Missing Pieces Guide

| What's missing | Automatable? | Fix |
|---|---|---|
| Python 3.6+ | Yes (with brew/pyenv) | `brew install python3` |
| `requests` library | Yes | `pip3 install requests` |
| Granola app + login | **No** — requires GUI auth | Direct human to granola.ai |
| Google Drive desktop app + login | **No** — requires GUI auth | Direct human to google.com/drive/download |
| Granola cache populated | Partial | Open Granola, wait ~30 sec, retry |
| LaunchAgent plist | Yes | `./install_launchagent.sh` |
| Output folder | Auto-created | Created on first sync |
| Sync state file | Auto-created | Created on first sync |

**Key constraint:** The two hard blockers (Granola sign-in and Google Drive sign-in) require a human to complete OAuth flows in a GUI application. An agent cannot automate these. If either is missing, surface a clear message to the human operator and halt.

### Alternatives

If this tool cannot run in your environment, consider these alternatives:

| Scenario | Alternative |
|---|---|
| No Google Drive desktop app | Modify `get_output_folder()` to write to any local path; use `rclone` to push to Google Drive via API |
| Google Drive API preferred over desktop app | Replace the file-write logic with calls to the [Google Drive API v3](https://developers.google.com/drive/api/guides/about-sdk) using a service account |
| Linux environment | The sync logic works cross-platform; only the LaunchAgent (macOS-only) and `~/Library/` paths need to change. Use `~/.config/granola/` and a systemd timer instead |
| Need Granola data without running Granola | The cache at `cache-v3.json` can be read directly — no live Granola process required for cached meetings |
| Want to export to Notion/Obsidian/etc. | The Markdown output from `create_meeting_markdown()` is portable; pipe it to any tool that accepts Markdown files |
| CI / headless environment | A headless run is only possible if both `supabase.json` and `cache-v3.json` are pre-populated and Google Drive is mounted (e.g., via `rclone mount`). Otherwise, require a human-configured macOS host |

### File Map for Agents

```
granola_sync.py          — single-file application, all logic here
install_launchagent.sh   — LaunchAgent installer (macOS only)
requirements.txt         — pip dependencies (requests only)
.gitignore               — excludes venv/, __pycache__, .DS_Store

Key functions in granola_sync.py:
  setup()                — diagnostic check, good entry point for detection
  sync_meetings()        — main sync loop
  get_granola_token()    — auth with auto-refresh
  get_meetings_from_cache() — reads local Granola cache (no network)
  get_transcript()       — fetches transcript from Granola API
  create_meeting_markdown()  — formats output Markdown
  find_google_drive_folder() — locates Google Drive mount point
```
