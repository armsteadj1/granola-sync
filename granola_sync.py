#!/usr/bin/env python3
"""
Granola to Google Drive Sync

Automatically syncs Granola meeting transcripts to Google Drive.
Uses the Google Drive desktop app folder - no API setup required.
Designed to run as a macOS LaunchAgent every 30 minutes.
"""

import json
import os
import sys
import logging
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

# Paths
HOME = Path.home()
GRANOLA_AUTH_PATH = HOME / "Library/Application Support/Granola/supabase.json"
GRANOLA_CACHE_PATH = HOME / "Library/Application Support/Granola/cache-v3.json"
CONFIG_DIR = HOME / ".config/granola-sync"
SYNC_STATE_PATH = CONFIG_DIR / "sync_state.json"
LOG_PATH = HOME / "Library/Logs/granola-sync.log"

# Google Drive desktop app folder
GOOGLE_DRIVE_BASE = HOME / "Library/CloudStorage"
DRIVE_FOLDER_NAME = "Granola Transcripts"

# Granola API
GRANOLA_API_BASE = "https://api.granola.ai"
WORKOS_AUTH_URL = "https://api.workos.com/user_management/authenticate"
WORKOS_CLIENT_ID = "client_01JZJ0XBDAT8PHJWQY09Y0VD61"

# Setup logging
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)


def ensure_config_dir():
    """Create config directory if it doesn't exist."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def find_google_drive_folder() -> Optional[Path]:
    """Find the Google Drive My Drive folder."""
    if not GOOGLE_DRIVE_BASE.exists():
        return None

    # Look for GoogleDrive-* folders
    for item in GOOGLE_DRIVE_BASE.iterdir():
        if item.name.startswith("GoogleDrive-"):
            my_drive = item / "My Drive"
            if my_drive.exists():
                return my_drive

    return None


def get_output_folder() -> Path:
    """Get or create the Granola Transcripts folder in Google Drive."""
    drive_folder = find_google_drive_folder()
    if not drive_folder:
        raise FileNotFoundError(
            "Google Drive folder not found. Make sure Google Drive desktop app is installed and signed in."
        )

    output_folder = drive_folder / DRIVE_FOLDER_NAME
    output_folder.mkdir(exist_ok=True)
    return output_folder


def load_sync_state() -> dict:
    """Load the sync state (which meetings have been uploaded)."""
    if SYNC_STATE_PATH.exists():
        with open(SYNC_STATE_PATH) as f:
            return json.load(f)
    return {"uploaded_meetings": {}}


def save_sync_state(state: dict):
    """Save the sync state."""
    with open(SYNC_STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def load_granola_auth() -> dict:
    """Load Granola authentication from supabase.json."""
    if not GRANOLA_AUTH_PATH.exists():
        raise FileNotFoundError(
            f"Granola auth not found at {GRANOLA_AUTH_PATH}. "
            "Make sure Granola is installed and you're logged in."
        )

    with open(GRANOLA_AUTH_PATH) as f:
        data = json.load(f)

    tokens = json.loads(data["workos_tokens"])
    return tokens


def save_granola_auth(tokens: dict):
    """Save updated Granola tokens back to supabase.json."""
    with open(GRANOLA_AUTH_PATH) as f:
        data = json.load(f)

    existing = json.loads(data["workos_tokens"])
    existing.update(tokens)
    existing["obtained_at"] = int(datetime.now().timestamp() * 1000)
    data["workos_tokens"] = json.dumps(existing)

    with open(GRANOLA_AUTH_PATH, "w") as f:
        json.dump(data, f)


def refresh_granola_token(refresh_token: str) -> dict:
    """Refresh the Granola access token using WorkOS."""
    response = requests.post(
        WORKOS_AUTH_URL,
        json={
            "client_id": WORKOS_CLIENT_ID,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        headers={"Content-Type": "application/json"},
    )
    response.raise_for_status()
    return response.json()


def get_granola_token() -> str:
    """Get a valid Granola access token, refreshing if necessary."""
    tokens = load_granola_auth()

    # Check if token is expired (with 5 minute buffer)
    obtained_at = tokens.get("obtained_at", 0) / 1000
    expires_in = tokens.get("expires_in", 0)
    expiry_time = obtained_at + expires_in - 300

    if datetime.now().timestamp() > expiry_time:
        logger.info("Granola token expired, refreshing...")
        new_tokens = refresh_granola_token(tokens["refresh_token"])
        save_granola_auth(new_tokens)
        return new_tokens["access_token"]

    return tokens["access_token"]


def granola_request(endpoint: str, data: dict = None) -> dict:
    """Make an authenticated request to the Granola API."""
    token = get_granola_token()
    url = f"{GRANOLA_API_BASE}{endpoint}"

    response = requests.post(
        url,
        json=data or {},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Granola/5.354.0",
            "X-Client-Version": "5.354.0",
        },
    )
    response.raise_for_status()
    return response.json()


def get_meetings_from_cache() -> dict:
    """Load meetings from local Granola cache."""
    if not GRANOLA_CACHE_PATH.exists():
        return {}

    try:
        with open(GRANOLA_CACHE_PATH) as f:
            data = json.load(f)
        cache = json.loads(data.get("cache", "{}"))
        state = cache.get("state", {})
        return state.get("documents", {})
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to read local cache: {e}")
        return {}


def get_transcript(document_id: str) -> list:
    """Get the transcript for a specific meeting from API."""
    try:
        data = granola_request(
            "/v1/get-document-transcript", {"document_id": document_id}
        )
        return data if isinstance(data, list) else data.get("transcript", [])
    except requests.HTTPError as e:
        logger.warning(f"Failed to get transcript for {document_id}: {e}")
        return []


def format_transcript(transcript: list) -> str:
    """Format transcript utterances into readable text."""
    if not transcript:
        return "*No transcript available*"

    lines = []
    for utterance in transcript:
        text = utterance.get("text", "").strip()
        if text:
            source = utterance.get("source", "unknown")
            speaker = "You" if source == "microphone" else "Other"
            lines.append(f"**{speaker}:** {text}")

    return "\n\n".join(lines) if lines else "*No transcript available*"


def extract_panels(document: dict) -> dict:
    """Extract AI-generated panels (notes, summary, etc.) from document."""
    panels = {}

    for key in ["panels", "ai_panels", "generated_panels"]:
        if key in document and document[key]:
            panels.update(document[key])

    if "last_viewed_panel" in document and document["last_viewed_panel"]:
        panel = document["last_viewed_panel"]
        if isinstance(panel, dict):
            panel_type = panel.get("type", "notes")
            content = panel.get("content") or panel.get("text") or panel.get("markdown")
            if content:
                panels[panel_type] = content

    return panels


def create_meeting_markdown(document: dict, transcript: list) -> str:
    """Create a markdown document for a meeting."""
    title = document.get("title") or "Untitled Meeting"
    created_at = document.get("created_at", "")

    # Parse and format date
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, AttributeError):
            date_str = created_at
    else:
        date_str = "Unknown date"

    # Get attendees - check multiple sources
    attendees = document.get("attendees") or []
    if not attendees:
        cal_event = document.get("google_calendar_event") or {}
        attendees = cal_event.get("attendees") or []
    if not attendees:
        attendees = document.get("people") or []

    if attendees:
        attendee_list = []
        for a in attendees:
            if isinstance(a, dict):
                name = a.get("name") or a.get("displayName") or a.get("email", "Unknown")
                attendee_list.append(name)
            else:
                attendee_list.append(str(a))
        attendees_str = ", ".join(attendee_list)
    else:
        attendees_str = "Unknown"

    # Build markdown
    md = f"""# {title}

**Date:** {date_str}
**Attendees:** {attendees_str}

---

"""

    # Check for notes_markdown (from local cache - most complete)
    notes_md = document.get("notes_markdown")
    if notes_md and notes_md.strip():
        md += "## Notes\n\n"
        md += notes_md.strip()
        md += "\n\n---\n\n"

    # Check for summary
    summary = document.get("summary")
    if summary:
        md += "## Summary\n\n"
        if isinstance(summary, str):
            md += summary
        elif isinstance(summary, dict):
            for k, v in summary.items():
                if v:
                    md += f"**{k}:** {v}\n\n"
        md += "\n---\n\n"

    # Extract additional AI panels
    panels = extract_panels(document)
    if panels:
        for panel_name, content in panels.items():
            if panel_name in ("notes", "summary"):
                continue
            if isinstance(content, str) and content.strip():
                md += f"## {panel_name.replace('_', ' ').title()}\n\n{content}\n\n"
            elif isinstance(content, dict):
                md += f"## {panel_name.replace('_', ' ').title()}\n\n"
                for k, v in content.items():
                    if v:
                        md += f"**{k}:** {v}\n\n"

    # Add transcript
    md += "## Transcript\n\n"
    md += format_transcript(transcript)
    md += "\n"

    return md


def generate_meeting_hash(document: dict) -> str:
    """Generate a hash to identify a meeting uniquely."""
    doc_id = document.get("id", "")
    if doc_id:
        return doc_id
    title = document.get("title", "")
    created = document.get("created_at", "")
    return hashlib.sha256(f"{title}{created}".encode()).hexdigest()[:16]


def sync_meetings():
    """Main sync function - syncs meetings to Google Drive folder."""
    logger.info("Starting Granola to Google Drive sync...")

    ensure_config_dir()
    state = load_sync_state()
    uploaded = state.get("uploaded_meetings", {})

    # Get output folder
    try:
        output_folder = get_output_folder()
        logger.info(f"Output folder: {output_folder}")
    except FileNotFoundError as e:
        logger.error(str(e))
        return

    # Load meetings from local cache
    meetings = get_meetings_from_cache()
    logger.info(f"Found {len(meetings)} meetings in local cache")

    if not meetings:
        logger.warning("No meetings found in local cache. Is Granola running?")
        return

    new_count = 0
    skipped = 0
    already_synced_streak = 0

    # Sort meetings by created_at descending (newest first)
    sorted_meetings = sorted(
        meetings.items(),
        key=lambda x: x[1].get("created_at", ""),
        reverse=True,
    )

    for doc_id, meeting in sorted_meetings:
        # Skip deleted or invalid meetings
        if meeting.get("deleted_at") or meeting.get("was_trashed"):
            continue

        # Skip meetings still in progress (meeting_end_count == 0 means not finished)
        if meeting.get("meeting_end_count", 0) == 0:
            title = meeting.get("title") or "Untitled"
            logger.info(f"Skipping in-progress meeting: {title}")
            continue

        meeting_hash = generate_meeting_hash(meeting)

        if meeting_hash in uploaded:
            already_synced_streak += 1
            # Stop after hitting 10 consecutive already-synced meetings
            # (allows for out-of-order edge cases)
            if already_synced_streak >= 10:
                logger.info(f"Hit 10 consecutive already-synced meetings, stopping early.")
                break
            continue

        # Reset streak when we find a new meeting
        already_synced_streak = 0

        title = meeting.get("title") or "Untitled Meeting"

        # Always try to get transcript from API (cache metadata is unreliable)
        transcript = get_transcript(doc_id) if doc_id else []
        has_notes = meeting.get("notes_markdown")

        # Skip if no content at all
        if not transcript and not has_notes:
            skipped += 1
            continue

        logger.info(f"Processing new meeting: {title}")

        # Create markdown content
        content = create_meeting_markdown(meeting, transcript)

        # Generate filename
        created_at = meeting.get("created_at", "")
        if created_at:
            try:
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                date_prefix = dt.strftime("%Y-%m-%d")
            except (ValueError, AttributeError):
                date_prefix = "unknown-date"
        else:
            date_prefix = "unknown-date"

        safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()[:50]
        filename = f"{date_prefix} - {safe_title}.md"

        # Write to Google Drive folder
        try:
            output_path = output_folder / filename
            with open(output_path, "w") as f:
                f.write(content)

            uploaded[meeting_hash] = {
                "filename": filename,
                "uploaded_at": datetime.now().isoformat(),
            }
            new_count += 1
            logger.info(f"Created: {filename}")
        except Exception as e:
            logger.error(f"Failed to write {filename}: {e}")

    # Save state
    state["uploaded_meetings"] = uploaded
    state["last_sync"] = datetime.now().isoformat()
    save_sync_state(state)

    logger.info(f"Sync complete. Created {new_count} new files. Skipped {skipped} without content.")


def setup():
    """Check setup and show status."""
    ensure_config_dir()

    print("\n=== Granola to Google Drive Sync ===\n")

    # Check Granola
    if not GRANOLA_AUTH_PATH.exists():
        print("ERROR: Granola not found")
        print(f"  Expected: {GRANOLA_AUTH_PATH}")
        return False
    print("Granola: OK")

    # Check local cache
    if GRANOLA_CACHE_PATH.exists():
        meetings = get_meetings_from_cache()
        with_content = sum(1 for m in meetings.values()
                         if (m.get("transcribe") or m.get("notes_markdown"))
                         and not m.get("deleted_at"))
        print(f"Local cache: {len(meetings)} meetings ({with_content} with content)")
    else:
        print("Local cache: Not found (run Granola first)")

    # Check Google Drive
    drive_folder = find_google_drive_folder()
    if not drive_folder:
        print("Google Drive: NOT FOUND")
        print("  Install Google Drive desktop app and sign in")
        return False
    print(f"Google Drive: {drive_folder}")

    # Create output folder
    output_folder = drive_folder / DRIVE_FOLDER_NAME
    output_folder.mkdir(exist_ok=True)
    print(f"Output folder: {output_folder}")

    # Check sync state
    state = load_sync_state()
    uploaded_count = len(state.get("uploaded_meetings", {}))
    last_sync = state.get("last_sync", "Never")
    print(f"Already synced: {uploaded_count} meetings")
    print(f"Last sync: {last_sync}")

    print("\n=== Ready to sync! ===")
    print("\nTo run manually:")
    print("  python granola_sync.py")
    print("\nTo install auto-sync (every 30 min):")
    print("  ./install_launchagent.sh")
    print(f"\nLogs: {LOG_PATH}")

    return True


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "--setup":
            setup()
        elif sys.argv[1] == "--help":
            print("Usage: granola_sync.py [--setup | --help]")
            print("  --setup  Check configuration")
            print("  --help   Show this help")
            print("  (no args) Run sync")
        else:
            print(f"Unknown argument: {sys.argv[1]}")
    else:
        sync_meetings()


if __name__ == "__main__":
    main()
