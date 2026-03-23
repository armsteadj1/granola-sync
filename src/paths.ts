import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const HOME = os.homedir();
export const GRANOLA_AUTH_PATH = path.join(HOME, 'Library', 'Application Support', 'Granola', 'supabase.json');
export const GRANOLA_APP_DIR = path.join(HOME, 'Library', 'Application Support', 'Granola');
export const DEFAULT_CACHE_FILENAME = 'cache-v6.json';

/** @deprecated Use getGranolaCachePath() instead */
export const GRANOLA_CACHE_PATH = path.join(GRANOLA_APP_DIR, DEFAULT_CACHE_FILENAME);

/**
 * Resolve the Granola cache path. Priority:
 * 1. Explicit cache_file from config (if provided)
 * 2. Auto-detect highest cache-vN.json in the Granola app dir
 * 3. Fall back to DEFAULT_CACHE_FILENAME
 */
export function getGranolaCachePath(configCacheFile?: string): string {
  if (configCacheFile) {
    // If it's an absolute path, use as-is; otherwise treat as a filename in the app dir
    if (path.isAbsolute(configCacheFile)) {
      return configCacheFile;
    }
    return path.join(GRANOLA_APP_DIR, configCacheFile);
  }

  // Auto-detect: find the highest cache-vN.json
  try {
    const files = fs.readdirSync(GRANOLA_APP_DIR);
    const cacheFiles = files
      .filter((f) => /^cache-v\d+\.json$/.test(f))
      .sort((a, b) => {
        const vA = parseInt(a.match(/cache-v(\d+)\.json/)![1], 10);
        const vB = parseInt(b.match(/cache-v(\d+)\.json/)![1], 10);
        return vB - vA; // highest first
      });
    if (cacheFiles.length > 0) {
      return path.join(GRANOLA_APP_DIR, cacheFiles[0]);
    }
  } catch {
    // App dir doesn't exist or isn't readable
  }

  return path.join(GRANOLA_APP_DIR, DEFAULT_CACHE_FILENAME);
}
export const CONFIG_DIR = path.join(HOME, '.config', 'granola-sync');
export const SYNC_STATE_PATH = path.join(CONFIG_DIR, 'sync_state.json');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
export const CONFIG_PATH_LEGACY = path.join(CONFIG_DIR, 'config.json');
export const LOG_PATH = path.join(HOME, 'Library', 'Logs', 'granola-sync.log');
export const GOOGLE_DRIVE_BASE = path.join(HOME, 'Library', 'CloudStorage');

export const DRIVE_FOLDER_NAME = 'Granola Transcripts';
export const GRANOLA_API_BASE = 'https://api.granola.ai';
export const WORKOS_AUTH_URL = 'https://api.workos.com/user_management/authenticate';
export const WORKOS_CLIENT_ID = 'client_01JZJ0XBDAT8PHJWQY09Y0VD61';
export const LAUNCHAGENT_LABEL = 'com.user.granola-sync';
export const LAUNCHAGENT_PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${LAUNCHAGENT_LABEL}.plist`);
export const DAEMON_SUPPORT_DIR = path.join(HOME, 'Library', 'Application Support', 'granola-sync');
export const DAEMON_LAUNCHER = path.join(DAEMON_SUPPORT_DIR, 'launcher.sh');
