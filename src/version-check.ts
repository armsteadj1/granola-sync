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

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      timeout: 2000, // 2 second timeout
    });
    return response.data.version;
  } catch (error) {
    return null;
  }
}

export async function checkForUpdates(currentVersion: string): Promise<void> {
  // Non-blocking - run in background
  setImmediate(async () => {
    try {
      const cache = readCache();
      const now = Date.now();

      // Check cache first
      if (cache && now - cache.lastCheck < CHECK_INTERVAL) {
        if (cache.latestVersion && cache.latestVersion !== currentVersion) {
          showUpdateMessage(currentVersion, cache.latestVersion);
        }
        return;
      }

      // Fetch latest version
      const latestVersion = await fetchLatestVersion();

      if (latestVersion) {
        writeCache({ lastCheck: now, latestVersion });

        if (latestVersion !== currentVersion) {
          showUpdateMessage(currentVersion, latestVersion);
        }
      }
    } catch (error) {
      // Silent fail - don't interrupt user experience
    }
  });
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
