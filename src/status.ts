import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { DaemonStatus } from './types';
import { LAUNCHAGENT_LABEL, LAUNCHAGENT_PLIST, LOG_PATH } from './paths';

export function checkDaemonStatus(): DaemonStatus {
  const installed = fs.existsSync(LAUNCHAGENT_PLIST);
  const result: DaemonStatus = { installed, running: false, pid: null };

  if (installed) {
    try {
      const proc = spawnSync('launchctl', ['list', LAUNCHAGENT_LABEL], {
        timeout: 5000,
        encoding: 'utf-8',
      });
      if (proc.status === 0) {
        result.running = true;
        const stdout = (proc.stdout as string) || '';
        const firstLine = stdout.trim().split('\n')[0] || '';
        const parts = firstLine.split(/\s+/);
        if (parts.length > 0 && parts[0] !== '-' && /^\d+$/.test(parts[0])) {
          result.pid = parseInt(parts[0], 10);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return result;
}

export function parseRecentLogErrors(maxLines = 300, maxErrors = 5): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(LOG_PATH)) return errors;

  try {
    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const recent = lines.slice(-maxLines);

    for (let i = recent.length - 1; i >= 0; i--) {
      const line = recent[i].trim();
      if (line.includes(' - ERROR - ') || line.includes(' - WARNING - ')) {
        errors.push(line);
        if (errors.length >= maxErrors) break;
      }
    }
    errors.reverse();
  } catch {
    // Ignore errors
  }

  return errors;
}

export function formatRelativeTime(dt: Date): string {
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} ago`;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} minute${m !== 1 ? 's' : ''} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(diff / 86400);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

export function formatSize(sizeBytes: number): string {
  let val = sizeBytes;
  const units = ['B', 'KB', 'MB', 'GB'];
  for (const unit of units) {
    if (val < 1024) return `${val.toFixed(1)} ${unit}`;
    val /= 1024;
  }
  return `${val.toFixed(1)} TB`;
}

export function fmtDate(dateStr: string): string {
  if (!dateStr) return 'unknown date';
  try {
    const dt = new Date(dateStr);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}
