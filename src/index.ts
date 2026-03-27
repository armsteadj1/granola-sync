import { Command } from 'commander';
import {
  registerSetup,
  registerSync,
  registerStatus,
  registerConfig,
  registerDaemon,
  registerDoctor,
} from './cli';
import { checkForUpdates } from './version-check';

const VERSION = '0.3.0';
const program = new Command();

program
  .name('granola-sync')
  .description('Sync Granola meeting transcripts to a configured folder')
  .version(VERSION);

// Check for updates (non-blocking)
checkForUpdates(VERSION);

registerSetup(program);
registerSync(program);
registerStatus(program);
registerConfig(program);
registerDaemon(program);
registerDoctor(program);

program.parse(process.argv);
