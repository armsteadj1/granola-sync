import * as fs from 'fs';
import { Meeting } from './types';
import { GRANOLA_CACHE_PATH } from './paths';
import { logger } from './logger';

export function getMeetingsFromCache(): Record<string, Meeting> {
  if (!fs.existsSync(GRANOLA_CACHE_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(GRANOLA_CACHE_PATH, 'utf-8');
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
