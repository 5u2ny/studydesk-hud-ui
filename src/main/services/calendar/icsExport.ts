// RFC 5545 .ics calendar export.
//
// Takes our existing AcademicDeadline records (already parsed by the syllabus
// pipeline) and emits a VCALENDAR with one VEVENT each. Handles:
//   - CRLF line endings (required by RFC 5545)
//   - 75-octet line folding (required, otherwise some clients reject)
//   - TEXT escaping: backslash, comma, semicolon, newline
//   - Stable UIDs so re-importing updates events instead of duplicating them
//   - Deadlines are point-in-time so DTEND = DTSTART + 1h (RFC 5545 wants both)
//
// Source repo (jjeongin/Syllabus-to-Calendar) was CSV-only with a JVM-bound
// NLP date parser — nothing to port. This emitter is written from spec.

import type { AcademicDeadline, Course } from '../../../shared/schema/index';

const PRODID = '-//StudyDesk//Deadlines 1.0//EN';
const APP_DOMAIN = 'studydesk.local';

/** Escape RFC 5545 TEXT field. Order matters: backslash first. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Format epoch ms as UTC datetime "YYYYMMDDTHHMMSSZ". */
function formatUTC(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** RFC 5545 §3.1 line folding: split at 75 octets, continuation lines start with " ". */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  // First chunk: 75 chars
  parts.push(line.slice(0, 75));
  i = 75;
  // Subsequent: 74 chars (one octet reserved for the leading space)
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

/** Build a single VEVENT block. Returns array of folded lines (no terminator). */
function buildEvent(d: AcademicDeadline, course?: Course): string[] {
  const uid = `deadline-${d.id}@${APP_DOMAIN}`;
  const dtStamp = formatUTC(Date.now());
  const dtStart = formatUTC(d.deadlineAt);
  // Deadlines are point-in-time. RFC 5545 requires DTEND xor DURATION.
  // We use DTEND = DTSTART + 1h so calendar UIs render a visible block.
  const dtEnd = formatUTC(d.deadlineAt + 60 * 60 * 1000);

  const summary = course
    ? `${course.code ?? course.name}: ${d.title}`
    : d.title;

  const descLines: string[] = [];
  descLines.push(`Type: ${d.type}`);
  if (course) descLines.push(`Course: ${course.name}`);
  if (d.confidence !== undefined) descLines.push(`Confidence: ${(d.confidence * 100).toFixed(0)}%`);
  if (d.sourceType) descLines.push(`Source: ${d.sourceType}`);
  const description = descLines.join('\\n');

  const lines = [
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    foldLine(`DTSTAMP:${dtStamp}`),
    foldLine(`DTSTART:${dtStart}`),
    foldLine(`DTEND:${dtEnd}`),
    foldLine(`SUMMARY:${escapeText(summary)}`),
    foldLine(`DESCRIPTION:${description}`),
    foldLine(`CATEGORIES:${d.type.toUpperCase()}`),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];
  return lines;
}

export interface ExportOptions {
  includeCompleted?: boolean;
  /** If set, only export deadlines for this course. */
  courseId?: string;
  /** Calendar name shown in some clients (e.g. Apple Calendar shows X-WR-CALNAME). */
  calendarName?: string;
}

export function buildICS(
  deadlines: AcademicDeadline[],
  courses: Course[],
  opts: ExportOptions = {}
): string {
  const courseById = new Map(courses.map(c => [c.id, c]));
  const filtered = deadlines.filter(d => {
    if (!opts.includeCompleted && d.completed) return false;
    if (opts.courseId && d.courseId !== opts.courseId) return false;
    return true;
  });

  const calName = opts.calendarName ?? (opts.courseId ? courseById.get(opts.courseId)?.name : 'StudyDesk Deadlines') ?? 'StudyDesk Deadlines';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    foldLine(`PRODID:${PRODID}`),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(calName)}`),
    foldLine(`X-WR-CALDESC:${escapeText('Deadlines exported from StudyDesk')}`),
  ];

  for (const d of filtered) {
    const course = d.courseId ? courseById.get(d.courseId) : undefined;
    lines.push(...buildEvent(d, course));
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 mandates CRLF
  return lines.join('\r\n') + '\r\n';
}

/** Default export filename, sanitized for filesystems. */
export function defaultFilename(course?: Course): string {
  const base = course ? `${course.code ?? course.name}-deadlines` : 'studydesk-deadlines';
  const safe = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  return `${safe}-${stamp}.ics`;
}
