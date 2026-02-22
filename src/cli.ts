import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as childProcess from 'child_process';
import chalk from 'chalk';
import prompts from 'prompts';
import { Command } from 'commander';
import { Config } from './types';
import {
  HOME,
  GRANOLA_AUTH_PATH,
  GRANOLA_CACHE_PATH,
  CONFIG_PATH,
  LOG_PATH,
  DRIVE_FOLDER_NAME,
} from './paths';
import { ensureConfigDir, loadConfig, saveConfig, loadSyncState } from './config';
import { validateWritable, findGoogleDriveFolder, getOutputFolder, syncMeetings } from './sync';
import { getMeetingsFromCache } from './cache';
import { generateMeetingHash } from './sync';
import {
  checkDaemonStatus,
  parseRecentLogErrors,
  formatRelativeTime,
  formatSize,
  fmtDate,
} from './status';

// ─── setup ───────────────────────────────────────────────────────────────────

function detectSyncLocations(): Array<{ name: string; basePath: string }> {
  const locations: Array<{ name: string; basePath: string }> = [];

  // Google Drive
  const driveFolder = findGoogleDriveFolder();
  if (driveFolder) {
    locations.push({ name: 'Google Drive (My Drive)', basePath: driveFolder });
  }

  // iCloud Drive
  const icloudPath = path.join(HOME, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (fs.existsSync(icloudPath)) {
    locations.push({ name: 'iCloud Drive', basePath: icloudPath });
  }

  // Dropbox
  const dropboxPath = path.join(HOME, 'Dropbox');
  if (fs.existsSync(dropboxPath)) {
    locations.push({ name: 'Dropbox', basePath: dropboxPath });
  }

  // Documents
  const documentsPath = path.join(HOME, 'Documents');
  if (fs.existsSync(documentsPath)) {
    locations.push({ name: 'Documents', basePath: documentsPath });
  }

  return locations;
}

async function runInteractiveSetup(): Promise<void> {
  console.log('\n' + chalk.bold('=== Granola Sync Setup ===') + '\n');

  // Check Granola is installed
  if (!fs.existsSync(GRANOLA_AUTH_PATH)) {
    console.error(chalk.red('ERROR: Granola not found'));
    console.error(`  Expected: ${GRANOLA_AUTH_PATH}`);
    console.error('  Please install and run Granola first.');
    process.exit(1);
  }
  console.log(chalk.green('✓') + ' Granola detected');

  // Check local cache
  if (fs.existsSync(GRANOLA_CACHE_PATH)) {
    const meetings = getMeetingsFromCache();
    const meetingCount = Object.keys(meetings).length;
    const withContent = Object.values(meetings).filter(
      (m) => (m.transcribe || m.notes_markdown) && !m.deleted_at
    ).length;
    console.log(chalk.green('✓') + ` Local cache: ${meetingCount} meetings (${withContent} with content)`);
  } else {
    console.log(chalk.yellow('!') + ' Local cache not found — run Granola first to populate it');
  }

  console.log('');

  // Detect available sync locations
  const locations = detectSyncLocations();

  const choices = locations.map((loc) => ({
    title: `${loc.name}`,
    description: path.join(loc.basePath, DRIVE_FOLDER_NAME),
    value: path.join(loc.basePath, DRIVE_FOLDER_NAME),
  }));

  choices.push({
    title: 'Custom path',
    description: 'Enter a custom directory path',
    value: '__custom__',
  });

  // Handle Ctrl+C / abort gracefully
  prompts.override({});
  const onCancel = () => {
    console.log('\nSetup cancelled.');
    process.exit(0);
  };

  const { location } = await prompts(
    {
      type: 'select',
      name: 'location',
      message: 'Where should Granola transcripts be synced?',
      choices,
      hint: '— Use arrow keys to navigate, Enter to select',
    },
    { onCancel }
  );

  let outputDir: string;

  if (location === '__custom__') {
    const { customPath } = await prompts(
      {
        type: 'text',
        name: 'customPath',
        message: 'Enter the full path to the output directory:',
        initial: path.join(HOME, 'Documents', DRIVE_FOLDER_NAME),
        validate: (val: string) => val.trim().length > 0 || 'Path cannot be empty',
      },
      { onCancel }
    );
    outputDir = expandUser(customPath.trim());
  } else {
    outputDir = location;
  }

  // Validate and create the directory
  const { ok, error } = validateWritable(outputDir);
  if (!ok) {
    console.error(chalk.red(`\nERROR: ${error}`));
    process.exit(1);
  }

  // Save config
  const config = loadConfig();
  config.output_dir = outputDir;
  saveConfig(config);

  console.log('');
  console.log(chalk.green('✓') + ` Output directory configured: ${chalk.cyan(outputDir)}`);
  console.log(chalk.green('✓') + ` Config saved: ${CONFIG_PATH}`);

  // Show sync state summary
  const state = loadSyncState();
  const uploadedCount = Object.keys(state.uploaded_meetings).length;
  if (uploadedCount > 0) {
    console.log(`  Already synced: ${uploadedCount} meetings`);
  }

  console.log('');

  // Ask about daemon installation
  const { installDaemon } = await prompts(
    {
      type: 'confirm',
      name: 'installDaemon',
      message: 'Install automatic syncing (runs every 30 minutes)?',
      initial: true,
    },
    { onCancel }
  );

  if (installDaemon) {
    console.log('');
    const scriptPath = path.join(__dirname, '..', 'install_launchagent.sh');
    if (fs.existsSync(scriptPath)) {
      try {
        childProcess.execSync(`bash "${scriptPath}"`, { stdio: 'inherit' });
        console.log('');
        console.log(chalk.green('✓') + ' Automatic syncing installed (runs every 30 minutes)');
      } catch {
        console.error(chalk.red('✗') + ' Failed to install LaunchAgent');
        console.error(`  Run manually: bash "${scriptPath}"`);
      }
    } else {
      console.log(chalk.yellow('!') + ' install_launchagent.sh not found — skipping daemon install');
      console.log('  Install manually: ./install_launchagent.sh');
    }
  }

  console.log('');

  // Ask about first sync
  const { runSync } = await prompts(
    {
      type: 'confirm',
      name: 'runSync',
      message: 'Run first sync now?',
      initial: true,
    },
    { onCancel }
  );

  if (runSync) {
    console.log('');
    await syncMeetings(outputDir);
  } else {
    console.log('');
    console.log('To sync manually:          ' + chalk.cyan('granola-sync sync'));
    if (!installDaemon) {
      console.log('To install auto-sync:      ' + chalk.cyan('./install_launchagent.sh'));
    }
    console.log(`Logs: ${LOG_PATH}`);
  }
}

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('Configure sync location interactively, or pass --output-dir for non-interactive use')
    .option('--output-dir <path>', 'Set the output directory (non-interactive)')
    .action(async (opts: { outputDir?: string }) => {
      ensureConfigDir();

      // Non-interactive mode: --output-dir flag provided
      if (opts.outputDir) {
        console.log('\n=== Granola to Google Drive Sync ===\n');

        const p = expandUser(opts.outputDir);
        const { ok, error } = validateWritable(p);
        if (!ok) {
          console.error(`ERROR: ${error}`);
          process.exit(1);
        }
        const config = loadConfig();
        config.output_dir = p;
        saveConfig(config);
        console.log(`Output directory configured: ${p}`);

        // Check Granola
        if (!fs.existsSync(GRANOLA_AUTH_PATH)) {
          console.error('ERROR: Granola not found');
          console.error(`  Expected: ${GRANOLA_AUTH_PATH}`);
          process.exit(1);
        }
        console.log('Granola: OK');

        // Check local cache
        if (fs.existsSync(GRANOLA_CACHE_PATH)) {
          const meetings = getMeetingsFromCache();
          const meetingCount = Object.keys(meetings).length;
          const withContent = Object.values(meetings).filter(
            (m) => (m.transcribe || m.notes_markdown) && !m.deleted_at
          ).length;
          console.log(`Local cache: ${meetingCount} meetings (${withContent} with content)`);
        } else {
          console.log('Local cache: Not found (run Granola first)');
        }

        // Check sync state
        const state = loadSyncState();
        const uploadedCount = Object.keys(state.uploaded_meetings).length;
        const lastSync = state.last_sync || 'Never';
        console.log(`Already synced: ${uploadedCount} meetings`);
        console.log(`Last sync: ${lastSync}`);

        console.log('\n=== Ready to sync! ===');
        console.log('\nTo run manually:');
        console.log('  granola-sync sync');
        console.log('\nTo install auto-sync (every 30 min):');
        console.log('  ./install_launchagent.sh');
        console.log(`\nLogs: ${LOG_PATH}`);
        return;
      }

      // Interactive mode
      await runInteractiveSetup();
    });
}

// ─── sync ────────────────────────────────────────────────────────────────────

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync Granola meetings to the output directory')
    .option('-o, --output-dir <path>', 'Output directory for synced files (overrides config)')
    .action(async (opts: { outputDir?: string }) => {
      const out = opts.outputDir ? expandUser(opts.outputDir) : undefined;
      await syncMeetings(out);
    });
}

// ─── status ──────────────────────────────────────────────────────────────────

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description(
      'Show detailed sync status: meetings, pending, errors, daemon, and output dir'
    )
    .option('--json', 'Output results as JSON (machine-readable format)')
    .action((opts: { json?: boolean }) => {
      ensureConfigDir();

      // --- Load data (no API calls) ---
      const state = loadSyncState();
      const uploaded = state.uploaded_meetings;
      const lastSyncStr = state.last_sync;
      const meetings = getMeetingsFromCache();

      // Categorize meetings
      const inProgressMeetings: Array<{ title: string; date: string; reason: string }> = [];
      const deletedMeetings: Array<{ title: string; date: string; reason: string }> = [];
      const noContentMeetings: Array<{ title: string; date: string; reason: string }> = [];
      const pendingMeetings: Array<{ title: string; date: string; reason: string }> = [];
      let syncedCount = 0;

      for (const [, meeting] of Object.entries(meetings)) {
        const meetingHash = generateMeetingHash(meeting);
        const title = meeting.title || 'Untitled';
        const createdAt = meeting.created_at || '';

        if (meetingHash in uploaded) {
          syncedCount++;
          continue;
        }

        if (meeting.deleted_at || meeting.was_trashed) {
          deletedMeetings.push({ title, date: createdAt, reason: 'deleted' });
        } else if ((meeting.meeting_end_count || 0) === 0) {
          inProgressMeetings.push({ title, date: createdAt, reason: 'still recording' });
        } else if (!meeting.notes_markdown) {
          noContentMeetings.push({
            title,
            date: createdAt,
            reason: 'no transcript or notes',
          });
        } else {
          pendingMeetings.push({ title, date: createdAt, reason: 'not yet synced' });
        }
      }

      const totalMeetings = Object.keys(meetings).length;
      const pendingCount =
        inProgressMeetings.length + noContentMeetings.length + pendingMeetings.length;

      // --- Output directory info ---
      const config = loadConfig();
      const configuredDir = config.output_dir;
      let outputDirPath: string | null = null;
      let outputDirSource: string | null = null;
      let outputDirSize: number | null = null;
      let outputDirFileCount: number | null = null;

      if (configuredDir) {
        outputDirPath = expandUser(configuredDir as string);
        outputDirSource = 'config';
      } else {
        const driveFolder = findGoogleDriveFolder();
        if (driveFolder) {
          outputDirPath = path.join(driveFolder, DRIVE_FOLDER_NAME);
          outputDirSource = 'google_drive_default';
        }
      }

      if (outputDirPath && fs.existsSync(outputDirPath)) {
        try {
          const mdFiles = fs
            .readdirSync(outputDirPath)
            .filter((f) => f.endsWith('.md'))
            .map((f) => path.join(outputDirPath as string, f));
          outputDirFileCount = mdFiles.length;
          outputDirSize = mdFiles.reduce((sum, f) => {
            try {
              return sum + fs.statSync(f).size;
            } catch {
              return sum;
            }
          }, 0);
        } catch {
          // Ignore errors
        }
      }

      // --- Daemon status & recent errors ---
      const daemonInfo = checkDaemonStatus();
      const recentErrors = parseRecentLogErrors();

      // --- Parse last sync datetime ---
      let lastSyncDt: Date | null = null;
      if (lastSyncStr) {
        try {
          lastSyncDt = new Date(lastSyncStr);
        } catch {
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
      console.log(chalk.bold('Granola Sync Status'));
      console.log('='.repeat(40));
      console.log('');

      // Last sync
      if (lastSyncDt) {
        const rel = formatRelativeTime(lastSyncDt);
        const formatted = fmtDate(lastSyncStr as string);
        console.log(`Last sync:  ${chalk.green(formatted)} (${rel})`);
      } else {
        console.log(`Last sync:  ${chalk.yellow('Never')}`);
      }

      console.log('');

      // Meetings summary
      if (totalMeetings === 0) {
        console.log(chalk.yellow('Meetings:   No meetings found in local cache'));
      } else {
        const syncedColor = syncedCount === totalMeetings ? 'green' : 'cyan';
        console.log(
          `Meetings:   ${chalk[syncedColor](String(syncedCount))} synced / ${totalMeetings} total`
        );
        if (pendingCount > 0) {
          console.log(`Pending:    ${chalk.yellow(String(pendingCount))} meetings`);
        }
      }

      // In-progress meetings
      if (inProgressMeetings.length > 0) {
        console.log('');
        console.log(chalk.bold.cyan('In Progress:'));
        for (const m of inProgressMeetings.slice(0, 5)) {
          console.log(`  - "${m.title}" (${fmtDate(m.date)}) — still recording`);
        }
        if (inProgressMeetings.length > 5) {
          console.log(`  ... and ${inProgressMeetings.length - 5} more`);
        }
      }

      // Pending (have notes, not yet synced)
      if (pendingMeetings.length > 0) {
        console.log('');
        console.log(chalk.bold.yellow('Pending Sync:'));
        for (const m of pendingMeetings.slice(0, 5)) {
          console.log(`  - "${m.title}" (${fmtDate(m.date)})`);
        }
        if (pendingMeetings.length > 5) {
          console.log(`  ... and ${pendingMeetings.length - 5} more`);
        }
      }

      // Skipped (no content)
      if (noContentMeetings.length > 0) {
        console.log('');
        console.log(chalk.bold('Skipped (no content):'));
        for (const m of noContentMeetings.slice(0, 3)) {
          console.log(`  - "${m.title}" (${fmtDate(m.date)})`);
        }
        if (noContentMeetings.length > 3) {
          console.log(`  ... and ${noContentMeetings.length - 3} more`);
        }
      }

      // Output directory
      console.log('');
      if (outputDirPath) {
        if (fs.existsSync(outputDirPath)) {
          const parts: string[] = [];
          if (outputDirFileCount !== null) parts.push(`${outputDirFileCount} files`);
          if (outputDirSize !== null) parts.push(formatSize(outputDirSize));
          if (outputDirSource) parts.push(outputDirSource);
          const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
          console.log(`Output:     ${chalk.green(outputDirPath)}${detail}`);
        } else {
          console.log(
            `Output:     ${chalk.red(outputDirPath)} (directory not found)`
          );
        }
      } else {
        console.log(`Output:     ${chalk.red('Not configured — run setup')}`);
      }

      // Daemon status
      console.log('');
      if (daemonInfo.installed) {
        if (daemonInfo.running) {
          const pidStr = daemonInfo.pid ? ` (PID ${daemonInfo.pid})` : '';
          console.log(`Daemon:     ${chalk.green('Running')}${pidStr}`);
        } else {
          console.log(`Daemon:     ${chalk.yellow('Installed but not running')}`);
        }
      } else {
        console.log(
          `Daemon:     ${chalk.yellow('Not installed')} — run ./install_launchagent.sh`
        );
      }

      // Recent errors / warnings
      if (recentErrors.length > 0) {
        console.log('');
        console.log(chalk.bold.red('Recent errors/warnings:'));
        for (const err of recentErrors) {
          console.log(`  ${err}`);
        }
      }

      console.log('');
    });
}

// ─── config ──────────────────────────────────────────────────────────────────

export function registerConfig(program: Command): void {
  program
    .command('config')
    .description('View or update configuration settings')
    .option('--output-dir <path>', 'Set the output directory for synced files')
    .option('--show', 'Print current configuration')
    .action((opts: { outputDir?: string; show?: boolean }) => {
      const config = loadConfig();

      if (opts.outputDir) {
        const p = expandUser(opts.outputDir);
        const { ok, error } = validateWritable(p);
        if (!ok) {
          console.error(`ERROR: ${error}`);
          process.exit(1);
        }
        config.output_dir = p;
        saveConfig(config);
        console.log(`Output directory set to: ${config.output_dir}`);
      }

      if (opts.show || !opts.outputDir) {
        if (Object.keys(config).length > 0) {
          console.log(`Config file: ${CONFIG_PATH}`);
          process.stdout.write(yaml.dump(config, { noCompatMode: true }));
        } else {
          console.log('No configuration set. Using defaults.');
          console.log(`Config file: ${CONFIG_PATH}`);
        }
      }
    });
}

// ─── daemon ──────────────────────────────────────────────────────────────────

export function registerDaemon(program: Command): void {
  program
    .command('daemon')
    .description('Run continuously, syncing on a fixed interval')
    .option('--interval <seconds>', 'Seconds between sync runs', '1800')
    .option('-o, --output-dir <path>', 'Output directory for synced files (overrides config)')
    .action(async (opts: { interval?: string; outputDir?: string }) => {
      const interval = parseInt(opts.interval || '1800', 10);
      const out = opts.outputDir ? expandUser(opts.outputDir) : undefined;
      console.log(`Starting daemon — syncing every ${interval}s. Press Ctrl+C to stop.`);
      console.log(`Log file: ${LOG_PATH}`);

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        while (true) {
          await syncMeetings(out);
          console.log(`Next sync in ${interval}s...`);
          await sleep(interval * 1000);
        }
      } catch (err) {
        // SIGINT / Ctrl+C
        console.log('\nDaemon stopped.');
      }
    });
}

// ─── doctor ──────────────────────────────────────────────────────────────────

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Run diagnostic checks and report health status')
    .option('--json', 'Output results as JSON (useful for AI agents)')
    .action((opts: { json?: boolean }) => {
      const checks: Record<
        string,
        { ok: boolean; path?: string | null; meetings?: number; source?: string | null }
      > = {};

      // Granola auth
      checks['granola_auth'] = {
        ok: fs.existsSync(GRANOLA_AUTH_PATH),
        path: GRANOLA_AUTH_PATH,
      };

      // Granola cache
      if (fs.existsSync(GRANOLA_CACHE_PATH)) {
        const meetings = getMeetingsFromCache();
        checks['granola_cache'] = {
          ok: true,
          path: GRANOLA_CACHE_PATH,
          meetings: Object.keys(meetings).length,
        };
      } else {
        checks['granola_cache'] = {
          ok: false,
          path: GRANOLA_CACHE_PATH,
          meetings: 0,
        };
      }

      // Google Drive
      const driveFolder = findGoogleDriveFolder();
      checks['google_drive'] = {
        ok: driveFolder !== null,
        path: driveFolder,
      };

      // Config dir
      const configDirPath = path.dirname(CONFIG_PATH);
      checks['config_dir'] = {
        ok: fs.existsSync(configDirPath),
        path: configDirPath,
      };

      // Output directory
      const config = loadConfig();
      const configuredDir = config.output_dir;
      if (configuredDir) {
        const outPath = expandUser(configuredDir as string);
        checks['output_dir'] = {
          ok: fs.existsSync(outPath),
          path: outPath,
          source: 'config',
        };
      } else if (driveFolder) {
        const outPath = path.join(driveFolder, DRIVE_FOLDER_NAME);
        checks['output_dir'] = {
          ok: true,
          path: outPath,
          source: 'google_drive_default',
        };
      } else {
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
      } else {
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

function expandUser(p: string): string {
  if (p.startsWith('~')) {
    return path.join(process.env.HOME || '', p.slice(1));
  }
  return p;
}

// Re-export for use in index.ts
export { Config };
