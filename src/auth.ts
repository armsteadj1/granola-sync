import * as fs from 'fs';
import axios from 'axios';
import { WorkOSTokens } from './types';
import { GRANOLA_AUTH_PATH, WORKOS_AUTH_URL, WORKOS_CLIENT_ID } from './paths';
import { logger } from './logger';

export function loadGranolaAuth(): WorkOSTokens {
  if (!fs.existsSync(GRANOLA_AUTH_PATH)) {
    throw new Error(
      `Granola auth not found at ${GRANOLA_AUTH_PATH}. ` +
        "Make sure Granola is installed and you're logged in."
    );
  }

  const data = JSON.parse(fs.readFileSync(GRANOLA_AUTH_PATH, 'utf-8')) as {
    workos_tokens: string;
  };
  const tokens = JSON.parse(data.workos_tokens) as WorkOSTokens;
  return tokens;
}

export function saveGranolaAuth(tokens: Partial<WorkOSTokens>): void {
  const raw = fs.readFileSync(GRANOLA_AUTH_PATH, 'utf-8');
  const data = JSON.parse(raw) as { workos_tokens: string };
  const existing = JSON.parse(data.workos_tokens) as WorkOSTokens;
  Object.assign(existing, tokens);
  existing.obtained_at = Date.now();
  data.workos_tokens = JSON.stringify(existing);
  fs.writeFileSync(GRANOLA_AUTH_PATH, JSON.stringify(data));
}

export async function refreshGranolaToken(refreshToken: string): Promise<WorkOSTokens> {
  const response = await axios.post<WorkOSTokens>(
    WORKOS_AUTH_URL,
    {
      client_id: WORKOS_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

export async function getGranolaToken(): Promise<string> {
  const tokens = loadGranolaAuth();

  // Check if token is expired (with 5 minute buffer)
  const obtainedAt = (tokens.obtained_at || 0) / 1000;
  const expiresIn = tokens.expires_in || 0;
  const expiryTime = obtainedAt + expiresIn - 300;

  if (Date.now() / 1000 > expiryTime) {
    logger.info('Granola token expired, refreshing...');
    const newTokens = await refreshGranolaToken(tokens.refresh_token);
    saveGranolaAuth(newTokens);
    return newTokens.access_token;
  }

  return tokens.access_token;
}
