import axios from 'axios';
import { Meeting, Utterance } from './types';
import { GRANOLA_API_BASE } from './paths';
import { getGranolaToken } from './auth';
import { logger } from './logger';

export async function granolaRequest(
  endpoint: string,
  data: Record<string, unknown> = {}
): Promise<unknown> {
  const token = await getGranolaToken();
  const url = `${GRANOLA_API_BASE}${endpoint}`;
  const response = await axios.post(url, data, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Granola/5.354.0',
      'X-Client-Version': '5.354.0',
    },
  });
  return response.data;
}

export async function listDocuments(limit = 2000): Promise<Meeting[]> {
  try {
    const data = await granolaRequest('/v1/get-documents', { limit });
    if (Array.isArray(data)) {
      return data as Meeting[];
    }
    return [];
  } catch (err) {
    logger.warning(`Failed to list documents from API: ${err}`);
    return [];
  }
}

export async function getTranscript(documentId: string): Promise<Utterance[]> {
  try {
    const data = await granolaRequest('/v1/get-document-transcript', {
      document_id: documentId,
    });
    if (Array.isArray(data)) {
      return data as Utterance[];
    }
    const obj = data as Record<string, unknown>;
    return (obj.transcript as Utterance[]) || [];
  } catch (err) {
    logger.warning(`Failed to get transcript for ${documentId}: ${err}`);
    return [];
  }
}
