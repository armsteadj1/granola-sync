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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSetup = registerSetup;
exports.registerSync = registerSync;
exports.registerStatus = registerStatus;
exports.registerConfig = registerConfig;
exports.registerDaemon = registerDaemon;
exports.registerDoctor = registerDoctor;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const chalk_1 = __importDefault(require("chalk"));
const paths_1 = require("./paths");
const config_1 = require("./config");
const sync_1 = require("./sync");
const cache_1 = require("./cache");
const sync_2 = require("./sync");
const status_1 = require("./status");
// ─── setup ───────────────────────────────────────────────────────────────────
function registerSetup(program) {
    program
        .command('setup')
        .description('Check configuration and show setup status')
        .option('--output-dir <path>', 'Set the output directory for synced files')
        .action((opts) => {
        (0, config_1.ensureConfigDir)();
        console.log('\n=== Granola to Google Drive Sync ===\n');
        // Configure output directory if provided
        if (opts.outputDir) {
            const p = expandUser(opts.outputDir);
            const { ok, error } = (0, sync_1.validateWritable)(p);
            if (!ok) {
                console.error(`ERROR: ${error}`);
                process.exit(1);
            }
            const config = (0, config_1.loadConfig)();
            config.output_dir = p;
            (0, config_1.saveConfig)(config);
            console.log(`Output directory configured: ${p}`);
        }
        // Check Granola
        if (!fs.existsSync(paths_1.GRANOLA_AUTH_PATH)) {
            console.error('ERROR: Granola not found');
            console.error(`  Expected: ${paths_1.GRANOLA_AUTH_PATH}`);
            process.exit(1);
        }
        console.log('Granola: OK');
        // Check local cache
        if (fs.existsSync(paths_1.GRANOLA_CACHE_PATH)) {
            const meetings = (0, cache_1.getMeetingsFromCache)();
            const meetingCount = Object.keys(meetings).length;
            const withContent = Object.values(meetings).filter((m) => (m.transcribe || m.notes_markdown) && !m.deleted_at).length;
            console.log(`Local cache: ${meetingCount} meetings (${withContent} with content)`);
        }
        else {
            console.log('Local cache: Not found (run Granola first)');
        }
        // Check Google Drive
        const driveFolder = (0, sync_1.findGoogleDriveFolder)();
        if (!driveFolder) {
            console.log('Google Drive: NOT FOUND');
            console.log('  Install Google Drive desktop app and sign in');
        }
        else {
            console.log(`Google Drive: ${driveFolder}`);
        }
        // Determine output folder
        const config = (0, config_1.loadConfig)();
        if (config.output_dir) {
            const outputFolder = expandUser(config.output_dir);
            const { ok, error } = (0, sync_1.validateWritable)(outputFolder);
            if (!ok) {
                console.error(`Output folder: ERROR — ${error}`);
                process.exit(1);
            }
            console.log(`Output folder: ${outputFolder} (from config)`);
            console.log(`Config file:   ${paths_1.CONFIG_PATH}`);
        }
        else if (driveFolder) {
            const outputFolder = path.join(driveFolder, paths_1.DRIVE_FOLDER_NAME);
            fs.mkdirSync(outputFolder, { recursive: true });
            console.log(`Output folder: ${outputFolder} (Google Drive default)`);
        }
        else {
            console.log('Output folder: NOT CONFIGURED');
            console.log('  Set one with: granola-sync setup --output-dir <path>');
            process.exit(1);
        }
        // Check sync state
        const state = (0, config_1.loadSyncState)();
        const uploadedCount = Object.keys(state.uploaded_meetings).length;
        const lastSync = state.last_sync || 'Never';
        console.log(`Already synced: ${uploadedCount} meetings`);
        console.log(`Last sync: ${lastSync}`);
        console.log('\n=== Ready to sync! ===');
        console.log('\nTo run manually:');
        console.log('  granola-sync sync');
        console.log('\nTo install auto-sync (every 30 min):');
        console.log('  ./install_launchagent.sh');
        console.log(`\nLogs: ${paths_1.LOG_PATH}`);
    });
}
// ─── sync ────────────────────────────────────────────────────────────────────
function registerSync(program) {
    program
        .command('sync')
        .description('Sync Granola meetings to the output directory')
        .option('-o, --output-dir <path>', 'Output directory for synced files (overrides config)')
        .action(async (opts) => {
        const out = opts.outputDir ? expandUser(opts.outputDir) : undefined;
        await (0, sync_1.syncMeetings)(out);
    });
}
// ─── status ──────────────────────────────────────────────────────────────────
function registerStatus(program) {
    program
        .command('status')
        .description('Show detailed sync status: meetings, pending, errors, daemon, and output dir')
        .option('--json', 'Output results as JSON (machine-readable format)')
        .action((opts) => {
        (0, config_1.ensureConfigDir)();
        // --- Load data (no API calls) ---
        const state = (0, config_1.loadSyncState)();
        const uploaded = state.uploaded_meetings;
        const lastSyncStr = state.last_sync;
        const meetings = (0, cache_1.getMeetingsFromCache)();
        // Categorize meetings
        const inProgressMeetings = [];
        const deletedMeetings = [];
        const noContentMeetings = [];
        const pendingMeetings = [];
        let syncedCount = 0;
        for (const [, meeting] of Object.entries(meetings)) {
            const meetingHash = (0, sync_2.generateMeetingHash)(meeting);
            const title = meeting.title || 'Untitled';
            const createdAt = meeting.created_at || '';
            if (meetingHash in uploaded) {
                syncedCount++;
                continue;
            }
            if (meeting.deleted_at || meeting.was_trashed) {
                deletedMeetings.push({ title, date: createdAt, reason: 'deleted' });
            }
            else if ((meeting.meeting_end_count || 0) === 0) {
                inProgressMeetings.push({ title, date: createdAt, reason: 'still recording' });
            }
            else if (!meeting.notes_markdown) {
                noContentMeetings.push({
                    title,
                    date: createdAt,
                    reason: 'no transcript or notes',
                });
            }
            else {
                pendingMeetings.push({ title, date: createdAt, reason: 'not yet synced' });
            }
        }
        const totalMeetings = Object.keys(meetings).length;
        const pendingCount = inProgressMeetings.length + noContentMeetings.length + pendingMeetings.length;
        // --- Output directory info ---
        const config = (0, config_1.loadConfig)();
        const configuredDir = config.output_dir;
        let outputDirPath = null;
        let outputDirSource = null;
        let outputDirSize = null;
        let outputDirFileCount = null;
        if (configuredDir) {
            outputDirPath = expandUser(configuredDir);
            outputDirSource = 'config';
        }
        else {
            const driveFolder = (0, sync_1.findGoogleDriveFolder)();
            if (driveFolder) {
                outputDirPath = path.join(driveFolder, paths_1.DRIVE_FOLDER_NAME);
                outputDirSource = 'google_drive_default';
            }
        }
        if (outputDirPath && fs.existsSync(outputDirPath)) {
            try {
                const mdFiles = fs
                    .readdirSync(outputDirPath)
                    .filter((f) => f.endsWith('.md'))
                    .map((f) => path.join(outputDirPath, f));
                outputDirFileCount = mdFiles.length;
                outputDirSize = mdFiles.reduce((sum, f) => {
                    try {
                        return sum + fs.statSync(f).size;
                    }
                    catch {
                        return sum;
                    }
                }, 0);
            }
            catch {
                // Ignore errors
            }
        }
        // --- Daemon status & recent errors ---
        const daemonInfo = (0, status_1.checkDaemonStatus)();
        const recentErrors = (0, status_1.parseRecentLogErrors)();
        // --- Parse last sync datetime ---
        let lastSyncDt = null;
        if (lastSyncStr) {
            try {
                lastSyncDt = new Date(lastSyncStr);
            }
            catch {
                // Ignore
            }
        }
        // ── JSON output ─────────────────────────────────────────────────────────
        if (opts.json) {
            const result = {
                last_sync: lastSyncStr || null,
                meetings: {
                    synced: syncedCount,
                    total: totalMeetings,
                    pending: pendingCount,
                },
                pending_details: {
                    in_progress: inProgressMeetings,
                    no_content: noContentMeetings,
                    unsynced: pendingMeetings,
                    deleted: deletedMeetings,
                },
                output_dir: {
                    path: outputDirPath,
                    source: outputDirSource,
                    exists: outputDirPath ? fs.existsSync(outputDirPath) : false,
                    file_count: outputDirFileCount,
                    size_bytes: outputDirSize,
                },
                daemon: daemonInfo,
                recent_errors: recentErrors,
            };
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        // ── Human-readable output ────────────────────────────────────────────────
        console.log('');
        console.log(chalk_1.default.bold('Granola Sync Status'));
        console.log('='.repeat(40));
        console.log('');
        // Last sync
        if (lastSyncDt) {
            const rel = (0, status_1.formatRelativeTime)(lastSyncDt);
            const formatted = (0, status_1.fmtDate)(lastSyncStr);
            console.log(`Last sync:  ${chalk_1.default.green(formatted)} (${rel})`);
        }
        else {
            console.log(`Last sync:  ${chalk_1.default.yellow('Never')}`);
        }
        console.log('');
        // Meetings summary
        if (totalMeetings === 0) {
            console.log(chalk_1.default.yellow('Meetings:   No meetings found in local cache'));
        }
        else {
            const syncedColor = syncedCount === totalMeetings ? 'green' : 'cyan';
            console.log(`Meetings:   ${chalk_1.default[syncedColor](String(syncedCount))} synced / ${totalMeetings} total`);
            if (pendingCount > 0) {
                console.log(`Pending:    ${chalk_1.default.yellow(String(pendingCount))} meetings`);
            }
        }
        // In-progress meetings
        if (inProgressMeetings.length > 0) {
            console.log('');
            console.log(chalk_1.default.bold.cyan('In Progress:'));
            for (const m of inProgressMeetings.slice(0, 5)) {
                console.log(`  - "${m.title}" (${(0, status_1.fmtDate)(m.date)}) — still recording`);
            }
            if (inProgressMeetings.length > 5) {
                console.log(`  ... and ${inProgressMeetings.length - 5} more`);
            }
        }
        // Pending (have notes, not yet synced)
        if (pendingMeetings.length > 0) {
            console.log('');
            console.log(chalk_1.default.bold.yellow('Pending Sync:'));
            for (const m of pendingMeetings.slice(0, 5)) {
                console.log(`  - "${m.title}" (${(0, status_1.fmtDate)(m.date)})`);
            }
            if (pendingMeetings.length > 5) {
                console.log(`  ... and ${pendingMeetings.length - 5} more`);
            }
        }
        // Skipped (no content)
        if (noContentMeetings.length > 0) {
            console.log('');
            console.log(chalk_1.default.bold('Skipped (no content):'));
            for (const m of noContentMeetings.slice(0, 3)) {
                console.log(`  - "${m.title}" (${(0, status_1.fmtDate)(m.date)})`);
            }
            if (noContentMeetings.length > 3) {
                console.log(`  ... and ${noContentMeetings.length - 3} more`);
            }
        }
        // Output directory
        console.log('');
        if (outputDirPath) {
            if (fs.existsSync(outputDirPath)) {
                const parts = [];
                if (outputDirFileCount !== null)
                    parts.push(`${outputDirFileCount} files`);
                if (outputDirSize !== null)
                    parts.push((0, status_1.formatSize)(outputDirSize));
                if (outputDirSource)
                    parts.push(outputDirSource);
                const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
                console.log(`Output:     ${chalk_1.default.green(outputDirPath)}${detail}`);
            }
            else {
                console.log(`Output:     ${chalk_1.default.red(outputDirPath)} (directory not found)`);
            }
        }
        else {
            console.log(`Output:     ${chalk_1.default.red('Not configured — run setup')}`);
        }
        // Daemon status
        console.log('');
        if (daemonInfo.installed) {
            if (daemonInfo.running) {
                const pidStr = daemonInfo.pid ? ` (PID ${daemonInfo.pid})` : '';
                console.log(`Daemon:     ${chalk_1.default.green('Running')}${pidStr}`);
            }
            else {
                console.log(`Daemon:     ${chalk_1.default.yellow('Installed but not running')}`);
            }
        }
        else {
            console.log(`Daemon:     ${chalk_1.default.yellow('Not installed')} — run ./install_launchagent.sh`);
        }
        // Recent errors / warnings
        if (recentErrors.length > 0) {
            console.log('');
            console.log(chalk_1.default.bold.red('Recent errors/warnings:'));
            for (const err of recentErrors) {
                console.log(`  ${err}`);
            }
        }
        console.log('');
    });
}
// ─── config ──────────────────────────────────────────────────────────────────
function registerConfig(program) {
    program
        .command('config')
        .description('View or update configuration settings')
        .option('--output-dir <path>', 'Set the output directory for synced files')
        .option('--show', 'Print current configuration')
        .action((opts) => {
        const config = (0, config_1.loadConfig)();
        if (opts.outputDir) {
            const p = expandUser(opts.outputDir);
            const { ok, error } = (0, sync_1.validateWritable)(p);
            if (!ok) {
                console.error(`ERROR: ${error}`);
                process.exit(1);
            }
            config.output_dir = p;
            (0, config_1.saveConfig)(config);
            console.log(`Output directory set to: ${config.output_dir}`);
        }
        if (opts.show || !opts.outputDir) {
            if (Object.keys(config).length > 0) {
                console.log(`Config file: ${paths_1.CONFIG_PATH}`);
                process.stdout.write(yaml.dump(config, { noCompatMode: true }));
            }
            else {
                console.log('No configuration set. Using defaults.');
                console.log(`Config file: ${paths_1.CONFIG_PATH}`);
            }
        }
    });
}
// ─── daemon ──────────────────────────────────────────────────────────────────
function registerDaemon(program) {
    program
        .command('daemon')
        .description('Run continuously, syncing on a fixed interval')
        .option('--interval <seconds>', 'Seconds between sync runs', '1800')
        .option('-o, --output-dir <path>', 'Output directory for synced files (overrides config)')
        .action(async (opts) => {
        const interval = parseInt(opts.interval || '1800', 10);
        const out = opts.outputDir ? expandUser(opts.outputDir) : undefined;
        console.log(`Starting daemon — syncing every ${interval}s. Press Ctrl+C to stop.`);
        console.log(`Log file: ${paths_1.LOG_PATH}`);
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        try {
            while (true) {
                await (0, sync_1.syncMeetings)(out);
                console.log(`Next sync in ${interval}s...`);
                await sleep(interval * 1000);
            }
        }
        catch (err) {
            // SIGINT / Ctrl+C
            console.log('\nDaemon stopped.');
        }
    });
}
// ─── doctor ──────────────────────────────────────────────────────────────────
function registerDoctor(program) {
    program
        .command('doctor')
        .description('Run diagnostic checks and report health status')
        .option('--json', 'Output results as JSON (useful for AI agents)')
        .action((opts) => {
        const checks = {};
        // Granola auth
        checks['granola_auth'] = {
            ok: fs.existsSync(paths_1.GRANOLA_AUTH_PATH),
            path: paths_1.GRANOLA_AUTH_PATH,
        };
        // Granola cache
        if (fs.existsSync(paths_1.GRANOLA_CACHE_PATH)) {
            const meetings = (0, cache_1.getMeetingsFromCache)();
            checks['granola_cache'] = {
                ok: true,
                path: paths_1.GRANOLA_CACHE_PATH,
                meetings: Object.keys(meetings).length,
            };
        }
        else {
            checks['granola_cache'] = {
                ok: false,
                path: paths_1.GRANOLA_CACHE_PATH,
                meetings: 0,
            };
        }
        // Google Drive
        const driveFolder = (0, sync_1.findGoogleDriveFolder)();
        checks['google_drive'] = {
            ok: driveFolder !== null,
            path: driveFolder,
        };
        // Config dir
        const configDirPath = path.dirname(paths_1.CONFIG_PATH);
        checks['config_dir'] = {
            ok: fs.existsSync(configDirPath),
            path: configDirPath,
        };
        // Output directory
        const config = (0, config_1.loadConfig)();
        const configuredDir = config.output_dir;
        if (configuredDir) {
            const outPath = expandUser(configuredDir);
            checks['output_dir'] = {
                ok: fs.existsSync(outPath),
                path: outPath,
                source: 'config',
            };
        }
        else if (driveFolder) {
            const outPath = path.join(driveFolder, paths_1.DRIVE_FOLDER_NAME);
            checks['output_dir'] = {
                ok: true,
                path: outPath,
                source: 'google_drive_default',
            };
        }
        else {
            checks['output_dir'] = {
                ok: false,
                path: null,
                source: null,
            };
        }
        const allOk = Object.values(checks).every((c) => c.ok);
        const result = {
            status: allOk ? 'ok' : 'error',
            checks,
            summary: allOk ? 'All checks passed.' : 'One or more checks failed.',
        };
        if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            console.log(`Status: ${result.status.toUpperCase()}`);
            console.log('');
            for (const [name, check] of Object.entries(checks)) {
                const icon = check.ok ? 'OK' : 'FAIL';
                const label = name
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                let detail = check.path || '';
                if (name === 'granola_cache' && check.ok && check.meetings !== undefined) {
                    detail += ` (${check.meetings} meetings)`;
                }
                if (name === 'output_dir' && check.source) {
                    detail += ` [${check.source}]`;
                }
                console.log(`  [${icon}] ${label}: ${detail}`);
            }
            console.log('');
            console.log(result.summary);
        }
        if (!allOk) {
            process.exit(1);
        }
    });
}
// ─── helpers ─────────────────────────────────────────────────────────────────
function expandUser(p) {
    if (p.startsWith('~')) {
        return path.join(process.env.HOME || '', p.slice(1));
    }
    return p;
}
