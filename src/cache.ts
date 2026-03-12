import * as fs from 'fs';
import { Meeting } from './types';
import { getGranolaCachePath } from './paths';
import { logger } from './logger';

export function getMeetingsFromCache(cacheFile?: string): Record<string, Meeting> {
  const cachePath = getGranolaCachePath(cacheFile);

  if (!fs.existsSync(cachePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(raw) as { cache?: string };
    const cacheStr = data.cache || '{}';
    const cache = JSON.parse(cacheStr) as { state?: { documents?: Record<string, Meeting> } };
    const state = cache.state || {};
    return state.documents || {};
  } catch (err) {
    logger.warning(`Failed to read local cache: ${err}`);
    return {};
  }
}
