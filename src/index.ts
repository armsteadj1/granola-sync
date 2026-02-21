import { Command } from 'commander';
import {
  registerSetup,
  registerSync,
  registerStatus,
  registerConfig,
  registerDaemon,
  registerDoctor,
} from './cli';

const program = new Command();

program
  .name('granola-sync')
  .description('Sync Granola meeting transcripts to Google Drive')
  .version('0.2.0');

registerSetup(program);
registerSync(program);
registerStatus(program);
registerConfig(program);
registerDaemon(program);
registerDoctor(program);

program.parse(process.argv);
