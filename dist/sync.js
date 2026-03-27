"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNC_STATE_PATH = void 0;
exports.validateWritable = validateWritable;
exports.findGoogleDriveFolder = findGoogleDriveFolder;
exports.getOutputFolder = getOutputFolder;
exports.generateMeetingHash = generateMeetingHash;
exports.syncMeetings = syncMeetings;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const paths_1 = require("./paths");
Object.defineProperty(exports, "SYNC_STATE_PATH", { enumerable: true, get: function () { return paths_1.SYNC_STATE_PATH; } });
const logger_1 = require("./logger");
const config_1 = require("./config");
const cache_1 = require("./cache");
const api_1 = require("./api");
const markdown_1 = require("./markdown");
function validateWritable(dirPath) {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    catch (err) {
        return { ok: false, error: `Cannot create directory: ${err}` };
    }
    try {
        fs.accessSync(dirPath, fs.constants.W_OK);
    }
    catch {
        return { ok: false, error: `Directory is not writable: ${dirPath}` };
    }
    return { ok: true, error: '' };
}
function findGoogleDriveFolder() {
    if (!fs.existsSync(paths_1.GOOGLE_DRIVE_BASE))
        return null;
    try {
        const items = fs.readdirSync(paths_1.GOOGLE_DRIVE_BASE);
        for (const item of items) {
            if (item.startsWith('GoogleDrive-')) {
                const myDrive = path.join(paths_1.GOOGLE_DRIVE_BASE, item, 'My Drive');
                if (fs.existsSync(myDrive)) {
                    return myDrive;
                }
            }
        }
    }
    catch {
        // Ignore read errors
    }
    return null;
}
function getOutputFolder(outputDir) {
    // Use explicitly provided path first
    if (outputDir) {
        const { ok, error } = validateWritable(outputDir);
        if (!ok)
            throw new Error(error);
        return outputDir;
    }
    // Then check config
    const config = (0, config_1.loadConfig)();
    const configuredDir = config.output_dir;
    if (configuredDir) {
        const expanded = configuredDir.startsWith('~')
            ? path.join(process.env.HOME || '', configuredDir.slice(1))
            : configuredDir;
        const { ok, error } = validateWritable(expanded);
        if (!ok)
            throw new Error(error);
        return expanded;
    }
    // Fall back to default location (Google Drive)
    const driveFolder = findGoogleDriveFolder();
    if (!driveFolder) {
        throw new Error('Default sync folder not found. Run "granola-sync setup" to configure a sync location.');
    }
    const outputFolder = path.join(driveFolder, paths_1.DRIVE_FOLDER_NAME);
    fs.mkdirSync(outputFolder, { recursive: true });
    return outputFolder;
}
function generateMeetingHash(document) {
    const docId = document.id;
    if (docId)
        return docId;
    const title = document.title || '';
    const created = document.created_at || '';
    return crypto.createHash('sha256').update(`${title}${created}`).digest('hex').slice(0, 16);
}
async function syncMeetings(outputDir) {
    logger_1.logger.info('Starting Granola transcript sync...');
    (0, config_1.ensureConfigDir)();
    const state = (0, config_1.loadSyncState)();
    const uploaded = state.uploaded_meetings;
    // Get output folder
    let outputFolder;
    try {
        outputFolder = getOutputFolder(outputDir);
        logger_1.logger.info(`Output folder: ${outputFolder}`);
    }
    catch (err) {
        logger_1.logger.error(String(err));
        return;
    }
    // Load meetings from API first, fall back to local cache
    let meetings;
    const apiMeetings = await (0, api_1.listDocuments)();
    if (apiMeetings.length > 0) {
        meetings = apiMeetings;
        logger_1.logger.info(`Found ${meetings.length} meetings from API`);
    }
    else {
        logger_1.logger.info('API unavailable, falling back to local cache');
        const config = (0, config_1.loadConfig)();
        const cacheMeetings = (0, cache_1.getMeetingsFromCache)(config.cache_file);
        meetings = Object.values(cacheMeetings);
        logger_1.logger.info(`Found ${meetings.length} meetings in local cache`);
    }
    if (meetings.length === 0) {
        logger_1.logger.warning('No meetings found. Is Granola running?');
        return;
    }
    let newCount = 0;
    let skipped = 0;
    let alreadySyncedStreak = 0;
    // Sort meetings by created_at descending (newest first)
    const sortedMeetings = meetings.sort((a, b) => {
        const aDate = a.created_at || '';
        const bDate = b.created_at || '';
        return bDate.localeCompare(aDate);
    });
    for (const meeting of sortedMeetings) {
        const docId = meeting.id;
        // Skip deleted or invalid meetings
        if (meeting.deleted_at || meeting.was_trashed)
            continue;
        // Skip meetings still in progress (meeting_end_count == 0 means not finished)
        if ((meeting.meeting_end_count || 0) === 0) {
            const title = meeting.title || 'Untitled';
            logger_1.logger.info(`Skipping in-progress meeting: ${title}`);
            // Reset streak — in-progress meetings may become syncable later,
            // so we can't assume everything beyond them is already synced
            alreadySyncedStreak = 0;
            continue;
        }
        const meetingHash = generateMeetingHash(meeting);
        if (meetingHash in uploaded) {
            alreadySyncedStreak++;
            // Stop after hitting 20 consecutive already-synced meetings
            if (alreadySyncedStreak >= 20) {
                logger_1.logger.info('Hit 20 consecutive already-synced meetings, stopping early.');
                break;
            }
            continue;
        }
        // Reset streak when we find a new meeting
        alreadySyncedStreak = 0;
        const title = meeting.title || 'Untitled Meeting';
        // Always try to get transcript from API (cache metadata is unreliable)
        const transcript = docId ? await (0, api_1.getTranscript)(docId) : [];
        const hasNotes = meeting.notes_markdown;
        // Skip if no content at all
        if (transcript.length === 0 && !hasNotes) {
            skipped++;
            continue;
        }
        logger_1.logger.info(`Processing new meeting: ${title}`);
        // Create markdown content
        const content = (0, markdown_1.createMeetingMarkdown)(meeting, transcript);
        // Generate filename
        const createdAt = meeting.created_at || '';
        let datePrefix;
        if (createdAt) {
            try {
                const dt = new Date(createdAt);
                const year = dt.getFullYear();
                const month = String(dt.getMonth() + 1).padStart(2, '0');
                const day = String(dt.getDate()).padStart(2, '0');
                datePrefix = `${year}-${month}-${day}`;
            }
            catch {
                datePrefix = 'unknown-date';
            }
        }
        else {
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
            // Set file modification time to meeting date so files sort by date in Finder
            if (createdAt) {
                try {
                    const meetingDate = new Date(createdAt);
                    fs.utimesSync(outputPath, meetingDate, meetingDate);
                }
                catch {
                    // Ignore — filesystem date is cosmetic
                }
            }
            uploaded[meetingHash] = {
                filename,
                uploaded_at: new Date().toISOString(),
            };
            newCount++;
            logger_1.logger.info(`Created: ${filename}`);
        }
        catch (err) {
            logger_1.logger.error(`Failed to write ${filename}: ${err}`);
        }
    }
    // Save state
    state.uploaded_meetings = uploaded;
    state.last_sync = new Date().toISOString();
    (0, config_1.saveSyncState)(state);
    logger_1.logger.info(`Sync complete. Created ${newCount} new files. Skipped ${skipped} without content.`);
}
