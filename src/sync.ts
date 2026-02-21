import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Meeting } from './types';
import {
  GOOGLE_DRIVE_BASE,
  DRIVE_FOLDER_NAME,
  SYNC_STATE_PATH,
} from './paths';
import { logger } from './logger';
import { ensureConfigDir, loadConfig, loadSyncState, saveSyncState } from './config';
import { getMeetingsFromCache } from './cache';
import { getTranscript } from './api';
import { createMeetingMarkdown } from './markdown';

export function validateWritable(dirPath: string): { ok: boolean; error: string } {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    return { ok: false, error: `Cannot create directory: ${err}` };
  }

  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
  } catch {
    return { ok: false, error: `Directory is not writable: ${dirPath}` };
  }

  return { ok: true, error: '' };
}

export function findGoogleDriveFolder(): string | null {
  if (!fs.existsSync(GOOGLE_DRIVE_BASE)) return null;

  try {
    const items = fs.readdirSync(GOOGLE_DRIVE_BASE);
    for (const item of items) {
      if (item.startsWith('GoogleDrive-')) {
        const myDrive = path.join(GOOGLE_DRIVE_BASE, item, 'My Drive');
        if (fs.existsSync(myDrive)) {
          return myDrive;
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

export function getOutputFolder(outputDir?: string): string {
  // Use explicitly provided path first
  if (outputDir) {
    const { ok, error } = validateWritable(outputDir);
    if (!ok) throw new Error(error);
    return outputDir;
  }

  // Then check config
  const config = loadConfig();
  const configuredDir = config.output_dir;
  if (configuredDir) {
    const expanded = configuredDir.startsWith('~')
      ? path.join(process.env.HOME || '', configuredDir.slice(1))
      : configuredDir;
    const { ok, error } = validateWritable(expanded);
    if (!ok) throw new Error(error);
    return expanded;
  }

  // Fall back to Google Drive
  const driveFolder = findGoogleDriveFolder();
  if (!driveFolder) {
    throw new Error(
      'Google Drive folder not found. Make sure Google Drive desktop app is installed and signed in.'
    );
  }

  const outputFolder = path.join(driveFolder, DRIVE_FOLDER_NAME);
  fs.mkdirSync(outputFolder, { recursive: true });
  return outputFolder;
}

export function generateMeetingHash(document: Meeting): string {
  const docId = document.id;
  if (docId) return docId;
  const title = document.title || '';
  const created = document.created_at || '';
  return crypto.createHash('sha256').update(`${title}${created}`).digest('hex').slice(0, 16);
}

export async function syncMeetings(outputDir?: string): Promise<void> {
  logger.info('Starting Granola to Google Drive sync...');

  ensureConfigDir();
  const state = loadSyncState();
  const uploaded = state.uploaded_meetings;

  // Get output folder
  let outputFolder: string;
  try {
    outputFolder = getOutputFolder(outputDir);
    logger.info(`Output folder: ${outputFolder}`);
  } catch (err) {
    logger.error(String(err));
    return;
  }

  // Load meetings from local cache
  const meetings = getMeetingsFromCache();
  const meetingCount = Object.keys(meetings).length;
  logger.info(`Found ${meetingCount} meetings in local cache`);

  if (meetingCount === 0) {
    logger.warning('No meetings found in local cache. Is Granola running?');
    return;
  }

  let newCount = 0;
  let skipped = 0;
  let alreadySyncedStreak = 0;

  // Sort meetings by created_at descending (newest first)
  const sortedMeetings = Object.entries(meetings).sort(([, a], [, b]) => {
    const aDate = a.created_at || '';
    const bDate = b.created_at || '';
    return bDate.localeCompare(aDate);
  });

  for (const [docId, meeting] of sortedMeetings) {
    // Skip deleted or invalid meetings
    if (meeting.deleted_at || meeting.was_trashed) continue;

    // Skip meetings still in progress (meeting_end_count == 0 means not finished)
    if ((meeting.meeting_end_count || 0) === 0) {
      const title = meeting.title || 'Untitled';
      logger.info(`Skipping in-progress meeting: ${title}`);
      continue;
    }

    const meetingHash = generateMeetingHash(meeting);

    if (meetingHash in uploaded) {
      alreadySyncedStreak++;
      // Stop after hitting 10 consecutive already-synced meetings
      if (alreadySyncedStreak >= 10) {
        logger.info('Hit 10 consecutive already-synced meetings, stopping early.');
        break;
      }
      continue;
    }

    // Reset streak when we find a new meeting
    alreadySyncedStreak = 0;

    const title = meeting.title || 'Untitled Meeting';

    // Always try to get transcript from API (cache metadata is unreliable)
    const transcript = docId ? await getTranscript(docId) : [];
    const hasNotes = meeting.notes_markdown;

    // Skip if no content at all
    if (transcript.length === 0 && !hasNotes) {
      skipped++;
      continue;
    }

    logger.info(`Processing new meeting: ${title}`);

    // Create markdown content
    const content = createMeetingMarkdown(meeting, transcript);

    // Generate filename
    const createdAt = meeting.created_at || '';
    let datePrefix: string;
    if (createdAt) {
      try {
        const dt = new Date(createdAt);
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        datePrefix = `${year}-${month}-${day}`;
      } catch {
        datePrefix = 'unknown-date';
      }
    } else {
      datePrefix = 'unknown-date';
    }

    const safeTitle = title
      .replace(/[^a-zA-Z0-9 \-_]/g, '')
      .trim()
      .slice(0, 50);
    const filename = `${datePrefix} - ${safeTitle}.md`;

    // Write to output folder
    try {
      const outputPath = path.join(outputFolder, filename);
      fs.writeFileSync(outputPath, content);

      uploaded[meetingHash] = {
        filename,
        uploaded_at: new Date().toISOString(),
      };
      newCount++;
      logger.info(`Created: ${filename}`);
    } catch (err) {
      logger.error(`Failed to write ${filename}: ${err}`);
    }
  }

  // Save state
  state.uploaded_meetings = uploaded;
  state.last_sync = new Date().toISOString();
  saveSyncState(state);

  logger.info(
    `Sync complete. Created ${newCount} new files. Skipped ${skipped} without content.`
  );
}

// Re-export SYNC_STATE_PATH so status command can check its existence
export { SYNC_STATE_PATH };
