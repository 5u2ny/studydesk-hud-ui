import { describe, it, expect } from 'vitest';
import { buildICS, defaultFilename } from './icsExport';
import type { AcademicDeadline, Course } from '../../../shared/schema/index';

function dl(over: Partial<AcademicDeadline> = {}): AcademicDeadline {
  return {
    id: 'd1',
    title: 'Assignment 1',
    deadlineAt: Date.UTC(2026, 4, 12, 23, 59), // May 12, 2026 23:59 UTC
    type: 'assignment',
    confirmed: true,
    completed: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const course: Course = {
  id: 'c1',
  name: 'Product Management',
  code: 'BUAD 6461',
  createdAt: 0,
  updatedAt: 0,
  archived: false,
};

describe('buildICS', () => {
  it('uses CRLF line endings (RFC 5545 mandate)', () => {
    const ics = buildICS([dl()], []);
    expect(ics).toMatch(/\r\n/);
    // No bare LFs
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/);
  });

  it('wraps in VCALENDAR with required headers', () => {
    const ics = buildICS([], []);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//StudyDesk//Deadlines 1.0//EN');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('emits one VEVENT per deadline', () => {
    const ics = buildICS([dl({ id: 'a' }), dl({ id: 'b' })], []);
    const matches = ics.match(/BEGIN:VEVENT/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('emits stable UID derived from deadline id', () => {
    const ics = buildICS([dl({ id: 'abc-123' })], []);
    expect(ics).toContain('UID:deadline-abc-123@studydesk.local');
  });

  it('formats DTSTART as UTC YYYYMMDDTHHMMSSZ', () => {
    const ics = buildICS([dl({ deadlineAt: Date.UTC(2026, 4, 12, 23, 59, 0) })], []);
    expect(ics).toContain('DTSTART:20260512T235900Z');
  });

  it('DTEND is DTSTART + 1h', () => {
    const ics = buildICS([dl({ deadlineAt: Date.UTC(2026, 4, 12, 23, 0, 0) })], []);
    expect(ics).toContain('DTSTART:20260512T230000Z');
    expect(ics).toContain('DTEND:20260513T000000Z');
  });

  it('escapes commas, semicolons, backslashes, newlines in TEXT fields', () => {
    const ics = buildICS([dl({ title: 'Read: Chapter 3, sections 1; 2 \\ note\nmore' })], []);
    expect(ics).toContain('SUMMARY:Read: Chapter 3\\, sections 1\\; 2 \\\\ note\\nmore');
  });

  it('prefixes summary with course code when course provided', () => {
    const ics = buildICS([dl({ courseId: 'c1' })], [course]);
    expect(ics).toContain('SUMMARY:BUAD 6461: Assignment 1');
  });

  it('falls back to plain title when no course', () => {
    const ics = buildICS([dl({ courseId: undefined })], []);
    expect(ics).toContain('SUMMARY:Assignment 1');
  });

  it('includes course name in DESCRIPTION when present', () => {
    const ics = buildICS([dl({ courseId: 'c1' })], [course]);
    expect(ics).toMatch(/DESCRIPTION:[^\r\n]*Course: Product Management/);
  });

  it('CATEGORIES uses uppercased deadline type', () => {
    const ics = buildICS([dl({ type: 'exam' })], []);
    expect(ics).toContain('CATEGORIES:EXAM');
  });

  it('skips completed deadlines by default', () => {
    const ics = buildICS([dl({ completed: true })], []);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('includes completed deadlines when opted in', () => {
    const ics = buildICS([dl({ completed: true })], [], { includeCompleted: true });
    expect(ics).toContain('BEGIN:VEVENT');
  });

  it('filters by courseId when option set', () => {
    const events = [dl({ id: 'a', courseId: 'c1' }), dl({ id: 'b', courseId: 'c2' })];
    const ics = buildICS(events, [course], { courseId: 'c1' });
    expect(ics).toContain('UID:deadline-a@');
    expect(ics).not.toContain('UID:deadline-b@');
  });

  it('folds lines longer than 75 octets at 75/74 boundaries', () => {
    const longTitle = 'A'.repeat(200);
    const ics = buildICS([dl({ title: longTitle })], []);
    const lines = ics.split('\r\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // Continuation lines start with a space
    expect(ics).toMatch(/\r\n /);
  });
});

describe('defaultFilename', () => {
  it('uses studydesk-deadlines for no course', () => {
    expect(defaultFilename()).toMatch(/^studydesk-deadlines-\d{4}-\d{2}-\d{2}\.ics$/);
  });

  it('uses course code when present', () => {
    expect(defaultFilename(course)).toMatch(/^BUAD_6461-deadlines-\d{4}-\d{2}-\d{2}\.ics$/);
  });

  it('falls back to course name when no code', () => {
    expect(defaultFilename({ ...course, code: undefined })).toMatch(/^Product_Management-deadlines/);
  });
});
