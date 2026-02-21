#!/usr/bin/env python3
"""
Granola to Google Drive Sync

Automatically syncs Granola meeting transcripts to Google Drive.
Uses the Google Drive desktop app folder - no API setup required.
Designed to run as a macOS LaunchAgent every 30 minutes.
"""

import json
import os
import subprocess
import sys
import logging
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import click
import requests
import yaml

# Paths
HOME = Path.home()
GRANOLA_AUTH_PATH = HOME / "Library/Application Support/Granola/supabase.json"
GRANOLA_CACHE_PATH = HOME / "Library/Application Support/Granola/cache-v3.json"
CONFIG_DIR = HOME / ".config/granola-sync"
SYNC_STATE_PATH = CONFIG_DIR / "sync_state.json"
CONFIG_PATH = CONFIG_DIR / "config.yaml"
CONFIG_PATH_LEGACY = CONFIG_DIR / "config.json"
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


def load_config() -> dict:
    """Load configuration from YAML config file, migrating from JSON if needed."""
    # Migrate from legacy JSON config if YAML doesn't exist yet
    if not CONFIG_PATH.exists() and CONFIG_PATH_LEGACY.exists():
        with open(CONFIG_PATH_LEGACY) as f:
            config = json.load(f)
        save_config(config)
        return config

    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    return {}


def save_config(config: dict):
    """Save configuration to YAML config file."""
    ensure_config_dir()
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True)


def validate_writable(path: Path) -> tuple:
    """Check if a path is writable. Returns (is_writable, error_message)."""
    try:
        path.mkdir(parents=True, exist_ok=True)
    except PermissionError as e:
        return False, f"Cannot create directory: {e}"
    except OSError as e:
        return False, f"Cannot create directory: {e}"

    if not os.access(path, os.W_OK):
        return False, f"Directory is not writable: {path}"

    return True, ""


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


def get_output_folder(output_dir: Optional[Path] = None) -> Path:
    """Get or create the output folder for synced files."""
    # Use explicitly provided path first
    if output_dir:
        is_writable, error = validate_writable(output_dir)
        if not is_writable:
            raise PermissionError(error)
        return output_dir

    # Then check config
    config = load_config()
    configured_dir = config.get("output_dir")
    if configured_dir:
        path = Path(configured_dir).expanduser()
        is_writable, error = validate_writable(path)
        if not is_writable:
            raise PermissionError(error)
        return path

    # Fall back to Google Drive
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


def sync_meetings(output_dir: Optional[Path] = None):
    """Main sync function - syncs meetings to the output folder."""
    logger.info("Starting Granola to Google Drive sync...")

    ensure_config_dir()
    state = load_sync_state()
    uploaded = state.get("uploaded_meetings", {})

    # Get output folder
    try:
        output_folder = get_output_folder(output_dir)
        logger.info(f"Output folder: {output_folder}")
    except (FileNotFoundError, PermissionError) as e:
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

        # Write to output folder
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


# ---------------------------------------------------------------------------
# Status helpers
# ---------------------------------------------------------------------------

LAUNCHAGENT_LABEL = "com.user.granola-sync"
LAUNCHAGENT_PLIST = Path.home() / "Library/LaunchAgents" / f"{LAUNCHAGENT_LABEL}.plist"


def check_daemon_status() -> dict:
    """Check if the granola-sync LaunchAgent daemon is installed and running."""
    result = {"installed": LAUNCHAGENT_PLIST.exists(), "running": False, "pid": None}
    if result["installed"]:
        try:
            proc = subprocess.run(
                ["launchctl", "list", LAUNCHAGENT_LABEL],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if proc.returncode == 0:
                result["running"] = True
                # First line of output: PID  Status  Label
                first_line = proc.stdout.strip().split("\n")[0]
                parts = first_line.split()
                if parts and parts[0].lstrip("-").isdigit() and parts[0] != "-":
                    result["pid"] = int(parts[0])
        except Exception:
            pass
    return result


def parse_recent_log_errors(max_lines: int = 300, max_errors: int = 5) -> list:
    """Return the most recent ERROR/WARNING lines from the log file."""
    errors = []
    if not LOG_PATH.exists():
        return errors
    try:
        with open(LOG_PATH) as f:
            lines = f.readlines()
        recent = lines[-max_lines:] if len(lines) > max_lines else lines
        for line in reversed(recent):
            stripped = line.strip()
            if " - ERROR - " in stripped or " - WARNING - " in stripped:
                errors.append(stripped)
                if len(errors) >= max_errors:
                    break
        errors.reverse()
    except Exception:
        pass
    return errors


def format_relative_time(dt: datetime) -> str:
    """Return a human-friendly relative time string (e.g. '26 minutes ago')."""
    diff = int((datetime.now() - dt).total_seconds())
    if diff < 60:
        return f"{diff} second{'s' if diff != 1 else ''} ago"
    elif diff < 3600:
        m = diff // 60
        return f"{m} minute{'s' if m != 1 else ''} ago"
    elif diff < 86400:
        h = diff // 3600
        return f"{h} hour{'s' if h != 1 else ''} ago"
    else:
        d = diff // 86400
        return f"{d} day{'s' if d != 1 else ''} ago"


def format_size(size_bytes: int) -> str:
    """Format a byte count as a human-readable string."""
    val = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if val < 1024:
            return f"{val:.1f} {unit}"
        val /= 1024
    return f"{val:.1f} TB"


def _fmt_date(date_str: str) -> str:
    """Format an ISO date string for compact display."""
    if not date_str:
        return "unknown date"
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except (ValueError, AttributeError):
        return date_str


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.group()
@click.version_option(version="0.2.0")
def cli():
    """Sync Granola meeting transcripts to Google Drive."""
    pass


@cli.command()
@click.option(
    "--output-dir",
    type=click.Path(),
    default=None,
    help="Set the output directory for synced files.",
)
def setup(output_dir):
    """Check configuration and show setup status."""
    ensure_config_dir()

    click.echo("\n=== Granola to Google Drive Sync ===\n")

    # Configure output directory if provided
    if output_dir:
        path = Path(output_dir).expanduser()
        is_writable, error = validate_writable(path)
        if not is_writable:
            click.echo(f"ERROR: {error}")
            sys.exit(1)
        config = load_config()
        config["output_dir"] = str(path)
        save_config(config)
        click.echo(f"Output directory configured: {path}")

    # Check Granola
    if not GRANOLA_AUTH_PATH.exists():
        click.echo("ERROR: Granola not found")
        click.echo(f"  Expected: {GRANOLA_AUTH_PATH}")
        sys.exit(1)
    click.echo("Granola: OK")

    # Check local cache
    if GRANOLA_CACHE_PATH.exists():
        meetings = get_meetings_from_cache()
        with_content = sum(1 for m in meetings.values()
                         if (m.get("transcribe") or m.get("notes_markdown"))
                         and not m.get("deleted_at"))
        click.echo(f"Local cache: {len(meetings)} meetings ({with_content} with content)")
    else:
        click.echo("Local cache: Not found (run Granola first)")

    # Check Google Drive
    drive_folder = find_google_drive_folder()
    if not drive_folder:
        click.echo("Google Drive: NOT FOUND")
        click.echo("  Install Google Drive desktop app and sign in")

    if drive_folder:
        click.echo(f"Google Drive: {drive_folder}")

    # Determine output folder
    config = load_config()
    if config.get("output_dir"):
        output_folder = Path(config["output_dir"]).expanduser()
        is_writable, error = validate_writable(output_folder)
        if not is_writable:
            click.echo(f"Output folder: ERROR — {error}")
            sys.exit(1)
        click.echo(f"Output folder: {output_folder} (from config)")
        click.echo(f"Config file:   {CONFIG_PATH}")
    elif drive_folder:
        output_folder = drive_folder / DRIVE_FOLDER_NAME
        output_folder.mkdir(parents=True, exist_ok=True)
        click.echo(f"Output folder: {output_folder} (Google Drive default)")
    else:
        click.echo("Output folder: NOT CONFIGURED")
        click.echo(f"  Set one with: granola_sync.py setup --output-dir <path>")
        sys.exit(1)

    # Check sync state
    state = load_sync_state()
    uploaded_count = len(state.get("uploaded_meetings", {}))
    last_sync = state.get("last_sync", "Never")
    click.echo(f"Already synced: {uploaded_count} meetings")
    click.echo(f"Last sync: {last_sync}")

    click.echo("\n=== Ready to sync! ===")
    click.echo("\nTo run manually:")
    click.echo("  python granola_sync.py sync")
    click.echo("\nTo install auto-sync (every 30 min):")
    click.echo("  ./install_launchagent.sh")
    click.echo(f"\nLogs: {LOG_PATH}")


@cli.command()
@click.option(
    "--output-dir", "-o",
    type=click.Path(),
    default=None,
    help="Output directory for synced files (overrides config).",
)
def sync(output_dir):
    """Sync Granola meetings to the output directory."""
    out = Path(output_dir).expanduser() if output_dir else None
    sync_meetings(output_dir=out)


@cli.command()
@click.option(
    "--json", "json_output",
    is_flag=True,
    default=False,
    help="Output results as JSON (machine-readable format).",
)
def status(json_output):
    """Show detailed sync status: meetings, pending, errors, daemon, and output dir."""
    ensure_config_dir()

    # --- Load data (no API calls) ---
    state = load_sync_state()
    uploaded = state.get("uploaded_meetings", {})
    last_sync_str = state.get("last_sync")
    meetings = get_meetings_from_cache()

    # Categorize meetings
    in_progress_meetings = []
    deleted_meetings = []
    no_content_meetings = []
    pending_meetings = []
    synced_count = 0

    for doc_id, meeting in meetings.items():
        meeting_hash = generate_meeting_hash(meeting)
        title = meeting.get("title") or "Untitled"
        created_at = meeting.get("created_at", "")

        if meeting_hash in uploaded:
            synced_count += 1
            continue

        if meeting.get("deleted_at") or meeting.get("was_trashed"):
            deleted_meetings.append({"title": title, "date": created_at, "reason": "deleted"})
        elif meeting.get("meeting_end_count", 0) == 0:
            in_progress_meetings.append({"title": title, "date": created_at, "reason": "still recording"})
        elif not meeting.get("notes_markdown"):
            no_content_meetings.append({"title": title, "date": created_at, "reason": "no transcript or notes"})
        else:
            pending_meetings.append({"title": title, "date": created_at, "reason": "not yet synced"})

    total_meetings = len(meetings)
    pending_count = len(in_progress_meetings) + len(no_content_meetings) + len(pending_meetings)

    # --- Output directory info ---
    config = load_config()
    configured_dir = config.get("output_dir")
    output_dir_path = None
    output_dir_source = None
    output_dir_size = None
    output_dir_file_count = None

    if configured_dir:
        output_dir_path = Path(configured_dir).expanduser()
        output_dir_source = "config"
    else:
        drive_folder = find_google_drive_folder()
        if drive_folder:
            output_dir_path = drive_folder / DRIVE_FOLDER_NAME
            output_dir_source = "google_drive_default"

    if output_dir_path and output_dir_path.exists():
        try:
            md_files = list(output_dir_path.glob("*.md"))
            output_dir_file_count = len(md_files)
            output_dir_size = sum(f.stat().st_size for f in md_files)
        except Exception:
            pass

    # --- Daemon status & recent errors ---
    daemon_info = check_daemon_status()
    recent_errors = parse_recent_log_errors()

    # --- Parse last sync datetime ---
    last_sync_dt = None
    if last_sync_str:
        try:
            last_sync_dt = datetime.fromisoformat(last_sync_str)
        except ValueError:
            pass

    # =========================================================
    # JSON output
    # =========================================================
    if json_output:
        result = {
            "last_sync": last_sync_str,
            "meetings": {
                "synced": synced_count,
                "total": total_meetings,
                "pending": pending_count,
            },
            "pending_details": {
                "in_progress": in_progress_meetings,
                "no_content": no_content_meetings,
                "unsynced": pending_meetings,
                "deleted": deleted_meetings,
            },
            "output_dir": {
                "path": str(output_dir_path) if output_dir_path else None,
                "source": output_dir_source,
                "exists": output_dir_path.exists() if output_dir_path else False,
                "file_count": output_dir_file_count,
                "size_bytes": output_dir_size,
            },
            "daemon": daemon_info,
            "recent_errors": recent_errors,
        }
        click.echo(json.dumps(result, indent=2))
        return

    # =========================================================
    # Human-readable colorized output
    # =========================================================
    click.echo("")
    click.echo(click.style("Granola Sync Status", bold=True))
    click.echo("=" * 40)
    click.echo("")

    # Last sync
    if last_sync_dt:
        rel = format_relative_time(last_sync_dt)
        formatted = last_sync_dt.strftime("%Y-%m-%d %H:%M")
        click.echo(f"Last sync:  {click.style(formatted, fg='green')} ({rel})")
    else:
        click.echo(f"Last sync:  {click.style('Never', fg='yellow')}")

    click.echo("")

    # Meetings summary
    if total_meetings == 0:
        click.echo(click.style("Meetings:   No meetings found in local cache", fg="yellow"))
    else:
        synced_color = "green" if synced_count == total_meetings else "cyan"
        click.echo(
            f"Meetings:   {click.style(str(synced_count), fg=synced_color)} synced"
            f" / {total_meetings} total"
        )
        if pending_count > 0:
            click.echo(f"Pending:    {click.style(str(pending_count), fg='yellow')} meetings")

    # In-progress meetings
    if in_progress_meetings:
        click.echo("")
        click.echo(click.style("In Progress:", bold=True, fg="cyan"))
        for m in in_progress_meetings[:5]:
            click.echo(f"  - \"{m['title']}\" ({_fmt_date(m['date'])}) — still recording")
        if len(in_progress_meetings) > 5:
            click.echo(f"  ... and {len(in_progress_meetings) - 5} more")

    # Pending (have notes, not yet synced)
    if pending_meetings:
        click.echo("")
        click.echo(click.style("Pending Sync:", bold=True, fg="yellow"))
        for m in pending_meetings[:5]:
            click.echo(f"  - \"{m['title']}\" ({_fmt_date(m['date'])})")
        if len(pending_meetings) > 5:
            click.echo(f"  ... and {len(pending_meetings) - 5} more")

    # Skipped (no content)
    if no_content_meetings:
        click.echo("")
        click.echo(click.style("Skipped (no content):", bold=True))
        for m in no_content_meetings[:3]:
            click.echo(f"  - \"{m['title']}\" ({_fmt_date(m['date'])})")
        if len(no_content_meetings) > 3:
            click.echo(f"  ... and {len(no_content_meetings) - 3} more")

    # Output directory
    click.echo("")
    if output_dir_path:
        if output_dir_path.exists():
            parts = []
            if output_dir_file_count is not None:
                parts.append(f"{output_dir_file_count} files")
            if output_dir_size is not None:
                parts.append(format_size(output_dir_size))
            if output_dir_source:
                parts.append(output_dir_source)
            detail = f" ({', '.join(parts)})" if parts else ""
            click.echo(f"Output:     {click.style(str(output_dir_path), fg='green')}{detail}")
        else:
            click.echo(f"Output:     {click.style(str(output_dir_path), fg='red')} (directory not found)")
    else:
        click.echo(f"Output:     {click.style('Not configured — run setup', fg='red')}")

    # Daemon status
    click.echo("")
    if daemon_info["installed"]:
        if daemon_info["running"]:
            pid_str = f" (PID {daemon_info['pid']})" if daemon_info.get("pid") else ""
            click.echo(f"Daemon:     {click.style('Running', fg='green')}{pid_str}")
        else:
            click.echo(f"Daemon:     {click.style('Installed but not running', fg='yellow')}")
    else:
        click.echo(f"Daemon:     {click.style('Not installed', fg='yellow')} — run ./install_launchagent.sh")

    # Recent errors / warnings
    if recent_errors:
        click.echo("")
        click.echo(click.style("Recent errors/warnings:", bold=True, fg="red"))
        for err in recent_errors:
            click.echo(f"  {err}")

    click.echo("")


@cli.command("config")
@click.option(
    "--output-dir",
    type=click.Path(),
    default=None,
    help="Set the output directory for synced files.",
)
@click.option(
    "--show",
    is_flag=True,
    default=False,
    help="Print current configuration.",
)
def config_cmd(output_dir, show):
    """View or update configuration settings."""
    config = load_config()

    if output_dir:
        path = Path(output_dir).expanduser()
        is_writable, error = validate_writable(path)
        if not is_writable:
            click.echo(f"ERROR: {error}", err=True)
            sys.exit(1)
        config["output_dir"] = str(path)
        save_config(config)
        click.echo(f"Output directory set to: {config['output_dir']}")

    if show or not output_dir:
        if config:
            click.echo(f"Config file: {CONFIG_PATH}")
            click.echo(yaml.dump(config, default_flow_style=False, allow_unicode=True), nl=False)
        else:
            click.echo("No configuration set. Using defaults.")
            click.echo(f"Config file: {CONFIG_PATH}")


@cli.command()
@click.option(
    "--interval",
    default=1800,
    show_default=True,
    help="Seconds between sync runs.",
)
@click.option(
    "--output-dir", "-o",
    type=click.Path(),
    default=None,
    help="Output directory for synced files (overrides config).",
)
def daemon(interval, output_dir):
    """Run continuously, syncing on a fixed interval."""
    out = Path(output_dir).expanduser() if output_dir else None
    click.echo(f"Starting daemon — syncing every {interval}s. Press Ctrl+C to stop.")
    click.echo(f"Log file: {LOG_PATH}")
    try:
        while True:
            sync_meetings(output_dir=out)
            click.echo(f"Next sync in {interval}s...")
            time.sleep(interval)
    except KeyboardInterrupt:
        click.echo("\nDaemon stopped.")


@cli.command()
@click.option(
    "--json", "json_output",
    is_flag=True,
    default=False,
    help="Output results as JSON (useful for AI agents).",
)
def doctor(json_output):
    """Run diagnostic checks and report health status."""
    checks = {}

    # Granola auth
    checks["granola_auth"] = {
        "ok": GRANOLA_AUTH_PATH.exists(),
        "path": str(GRANOLA_AUTH_PATH),
    }

    # Granola cache
    if GRANOLA_CACHE_PATH.exists():
        meetings = get_meetings_from_cache()
        checks["granola_cache"] = {
            "ok": True,
            "path": str(GRANOLA_CACHE_PATH),
            "meetings": len(meetings),
        }
    else:
        checks["granola_cache"] = {
            "ok": False,
            "path": str(GRANOLA_CACHE_PATH),
            "meetings": 0,
        }

    # Google Drive
    drive_folder = find_google_drive_folder()
    checks["google_drive"] = {
        "ok": drive_folder is not None,
        "path": str(drive_folder) if drive_folder else None,
    }

    # Config dir
    checks["config_dir"] = {
        "ok": CONFIG_DIR.exists(),
        "path": str(CONFIG_DIR),
    }

    # Output directory
    config = load_config()
    configured_dir = config.get("output_dir")
    if configured_dir:
        out_path = Path(configured_dir).expanduser()
        checks["output_dir"] = {
            "ok": out_path.exists(),
            "path": str(out_path),
            "source": "config",
        }
    elif drive_folder:
        out_path = drive_folder / DRIVE_FOLDER_NAME
        checks["output_dir"] = {
            "ok": True,
            "path": str(out_path),
            "source": "google_drive_default",
        }
    else:
        checks["output_dir"] = {
            "ok": False,
            "path": None,
            "source": None,
        }

    all_ok = all(c["ok"] for c in checks.values())
    result = {
        "status": "ok" if all_ok else "error",
        "checks": checks,
        "summary": "All checks passed." if all_ok else "One or more checks failed.",
    }

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        click.echo(f"Status: {result['status'].upper()}")
        click.echo("")
        for name, check in checks.items():
            icon = "OK" if check["ok"] else "FAIL"
            label = name.replace("_", " ").title()
            detail = check.get("path") or ""
            if name == "granola_cache" and check["ok"]:
                detail += f" ({check['meetings']} meetings)"
            if name == "output_dir" and check.get("source"):
                detail += f" [{check['source']}]"
            click.echo(f"  [{icon}] {label}: {detail}")
        click.echo("")
        click.echo(result["summary"])

    if not all_ok:
        sys.exit(1)


if __name__ == "__main__":
    cli()
