import { Meeting, Utterance, AttendeeRecord } from './types';

export function formatTranscript(transcript: Utterance[]): string {
  if (!transcript || transcript.length === 0) {
    return '*No transcript available*';
  }

  const lines: string[] = [];
  for (const utterance of transcript) {
    const text = (utterance.text || '').trim();
    if (text) {
      const source = utterance.source || 'unknown';
      const speaker = source === 'microphone' ? 'You' : 'Other';
      lines.push(`**${speaker}:** ${text}`);
    }
  }
  return lines.length > 0 ? lines.join('\n\n') : '*No transcript available*';
}

export function extractPanels(document: Meeting): Record<string, unknown> {
  const panels: Record<string, unknown> = {};

  for (const key of ['panels', 'ai_panels', 'generated_panels'] as const) {
    const val = document[key];
    if (val && typeof val === 'object') {
      Object.assign(panels, val);
    }
  }

  const lastViewedPanel = document.last_viewed_panel;
  if (lastViewedPanel && typeof lastViewedPanel === 'object') {
    const panelType = lastViewedPanel.type || 'notes';
    const content =
      lastViewedPanel.content || lastViewedPanel.text || lastViewedPanel.markdown;
    if (content) {
      panels[panelType] = content;
    }
  }

  return panels;
}

function formatDateTimeLocal(isoString: string): string {
  try {
    const dt = new Date(isoString);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

export function createMeetingMarkdown(document: Meeting, transcript: Utterance[]): string {
  const title = document.title || 'Untitled Meeting';
  const createdAt = document.created_at || '';

  let dateStr: string;
  if (createdAt) {
    try {
      dateStr = formatDateTimeLocal(createdAt);
    } catch {
      dateStr = createdAt;
    }
  } else {
    dateStr = 'Unknown date';
  }

  // Get attendees - check multiple sources
  let attendees: (AttendeeRecord | string)[] = document.attendees || [];
  if (attendees.length === 0) {
    attendees = document.google_calendar_event?.attendees || [];
  }
  if (attendees.length === 0) {
    attendees = (document.people as (AttendeeRecord | string)[]) || [];
  }

  let attendeesStr: string;
  if (attendees.length > 0) {
    const attendeeList = attendees.map((a) => {
      if (typeof a === 'object' && a !== null) {
        const obj = a as AttendeeRecord;
        return obj.name || obj.displayName || obj.email || 'Unknown';
      }
      return String(a);
    });
    attendeesStr = attendeeList.join(', ');
  } else {
    attendeesStr = 'Unknown';
  }

  let md = `# ${title}\n\n**Date:** ${dateStr}\n**Attendees:** ${attendeesStr}\n\n---\n\n`;

  // Check for notes_markdown (from local cache - most complete)
  const notesMarkdown = document.notes_markdown;
  if (notesMarkdown && notesMarkdown.trim()) {
    md += `## Notes\n\n${notesMarkdown.trim()}\n\n---\n\n`;
  }

  // Check for summary
  const summary = document.summary;
  if (summary) {
    md += '## Summary\n\n';
    if (typeof summary === 'string') {
      md += summary;
    } else if (typeof summary === 'object') {
      for (const [k, v] of Object.entries(summary)) {
        if (v) {
          md += `**${k}:** ${v}\n\n`;
        }
      }
    }
    md += '\n---\n\n';
  }

  // Extract additional AI panels
  const panels = extractPanels(document);
  if (Object.keys(panels).length > 0) {
    for (const [panelName, content] of Object.entries(panels)) {
      if (panelName === 'notes' || panelName === 'summary') continue;
      const label = panelName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      if (typeof content === 'string' && content.trim()) {
        md += `## ${label}\n\n${content}\n\n`;
      } else if (typeof content === 'object' && content !== null) {
        md += `## ${label}\n\n`;
        for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
          if (v) {
            md += `**${k}:** ${v}\n\n`;
          }
        }
      }
    }
  }

  // Add transcript
  md += `## Transcript\n\n${formatTranscript(transcript)}\n`;

  return md;
}
