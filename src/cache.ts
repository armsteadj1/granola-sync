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
    const data = JSON.parse(raw) as { cache?: string | Record<string, unknown> };
    // cache-v3 stores cache as a JSON string; cache-v6+ stores it as an object
    const cache = (typeof data.cache === 'string'
      ? JSON.parse(data.cache)
      : (data.cache || {})) as { state?: { documents?: Record<string, Meeting> } };
    const state = cache.state || {};
    return state.documents || {};
  } catch (err) {
    logger.warning(`Failed to read local cache: ${err}`);
    return {};
  }
}
