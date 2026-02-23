import * as os from 'os';
import * as path from 'path';

export const HOME = os.homedir();
export const GRANOLA_AUTH_PATH = path.join(HOME, 'Library', 'Application Support', 'Granola', 'supabase.json');
export const GRANOLA_CACHE_PATH = path.join(HOME, 'Library', 'Application Support', 'Granola', 'cache-v3.json');
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
