import axios from 'axios';
import chalk from 'chalk';

const PACKAGE_NAME = '@armsteadj1/granola-sync';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE = require('path').join(require('os').homedir(), '.granola-sync-version-cache.json');

interface VersionCache {
  lastCheck: number;
  latestVersion: string;
}

function readCache(): VersionCache | null {
  try {
    const fs = require('fs');
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (error) {
    // Ignore cache errors
  }
  return null;
}

function writeCache(cache: VersionCache): void {
  try {
    const fs = require('fs');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (error) {
    // Ignore cache errors
  }
}

async function fetchAndCacheLatestVersion(): Promise<void> {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      timeout: 3000,
    });
    const latestVersion = response.data.version;
    if (latestVersion) {
      writeCache({ lastCheck: Date.now(), latestVersion });
    }
  } catch (error) {
    // Silent fail — don't interrupt user experience
  }
}

function showUpdateMessage(currentVersion: string, latestVersion: string): void {
  console.log('');
  console.log(chalk.yellow('┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.yellow('│') + '  ' + chalk.bold('Update available!') + ' ' + chalk.dim(currentVersion) + ' → ' + chalk.green(latestVersion) + '                  ' + chalk.yellow('│'));
  console.log(chalk.yellow('│') + '                                                         ' + chalk.yellow('│'));
  console.log(chalk.yellow('│') + '  Run: ' + chalk.cyan('npm install -g @armsteadj1/granola-sync') + '      ' + chalk.yellow('│'));
  console.log(chalk.yellow('└─────────────────────────────────────────────────────────┘'));
  console.log('');
}

function isNewer(a: string, b: string): boolean {
  // Returns true if version a is strictly newer than version b
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

export function checkForUpdates(currentVersion: string): void {
  // 1. Check cache synchronously — show banner immediately if update is known
  const cache = readCache();
  if (cache && cache.latestVersion && isNewer(cache.latestVersion, currentVersion)) {
    showUpdateMessage(currentVersion, cache.latestVersion);
  }

  // 2. Refresh cache in background if stale (>24h) — result shows on NEXT run
  const now = Date.now();
  if (!cache || now - cache.lastCheck >= CHECK_INTERVAL) {
    setImmediate(() => { fetchAndCacheLatestVersion(); });
  }
}
