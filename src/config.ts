import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Config, SyncState } from './types';
import { CONFIG_DIR, CONFIG_PATH, CONFIG_PATH_LEGACY, SYNC_STATE_PATH } from './paths';

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadConfig(): Config {
  // Migrate from legacy JSON config if YAML doesn't exist yet
  if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(CONFIG_PATH_LEGACY)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH_LEGACY, 'utf-8')) as Config;
    saveConfig(config);
    return config;
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return (yaml.load(content) as Config) || {};
  }
  return {};
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { noCompatMode: true }));
}

export function loadSyncState(): SyncState {
  if (fs.existsSync(SYNC_STATE_PATH)) {
    return JSON.parse(fs.readFileSync(SYNC_STATE_PATH, 'utf-8')) as SyncState;
  }
  return { uploaded_meetings: {} };
}

export function saveSyncState(state: SyncState): void {
  ensureConfigDir();
  fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}
