export interface AttendeeRecord {
  name?: string;
  displayName?: string;
  email?: string;
}

export interface Meeting {
  id?: string;
  title?: string;
  created_at?: string;
  deleted_at?: string;
  was_trashed?: boolean;
  meeting_end_count?: number;
  notes_markdown?: string;
  attendees?: (AttendeeRecord | string)[];
  google_calendar_event?: { attendees?: (AttendeeRecord | string)[] };
  people?: (AttendeeRecord | string)[];
  summary?: string | Record<string, string>;
  panels?: Record<string, unknown>;
  ai_panels?: Record<string, unknown>;
  generated_panels?: Record<string, unknown>;
  last_viewed_panel?: {
    type?: string;
    content?: string;
    text?: string;
    markdown?: string;
  };
  transcribe?: boolean;
  [key: string]: unknown;
}

export interface Utterance {
  text?: string;
  source?: string;
  [key: string]: unknown;
}

export interface WorkOSTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  obtained_at: number;
  [key: string]: unknown;
}

export interface Config {
  output_dir?: string;
  [key: string]: unknown;
}

export interface SyncStateEntry {
  filename: string;
  uploaded_at: string;
}

export interface SyncState {
  uploaded_meetings: Record<string, SyncStateEntry>;
  last_sync?: string;
}

export interface DaemonStatus {
  installed: boolean;
  running: boolean;
  pid: number | null;
}

export interface PendingMeeting {
  title: string;
  date: string;
  reason: string;
}
