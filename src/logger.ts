import * as fs from 'fs';
import * as path from 'path';
import { LOG_PATH } from './paths';

// Ensure log directory exists at import time
try {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
} catch {
  // Ignore if already exists or can't create
}

function formatLog(level: string, message: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
  return `${timestamp} - ${level} - ${message}`;
}

function writeLog(level: string, message: string): void {
  const line = formatLog(level, message) + '\n';
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    // Ignore log write errors
  }
  process.stdout.write(line);
}

export const logger = {
  info: (msg: string) => writeLog('INFO', msg),
  warning: (msg: string) => writeLog('WARNING', msg),
  error: (msg: string) => writeLog('ERROR', msg),
};
