import { describe, test, expect } from 'vitest';
import { significantWords, hasWordOverlap, calendarDay } from './dedup';

// ── calendarDay ─────────────────────────────────────────────────────────

describe('calendarDay', () => {
  test('returns YYYY-MM-DD for a timestamp', () => {
    // Apr 20 2026
    const ts = new Date(2026, 3, 20, 14, 30).getTime();
    expect(calendarDay(ts)).toBe('2026-04-20');
  });

  test('pads single-digit month and day', () => {
    const ts = new Date(2026, 0, 5).getTime();
    expect(calendarDay(ts)).toBe('2026-01-05');
  });

  test('different times on same day produce same string', () => {
    const morning = new Date(2026, 3, 20, 8, 0).getTime();
    const night = new Date(2026, 3, 20, 23, 59).getTime();
    expect(calendarDay(morning)).toBe(calendarDay(night));
  });
});

// ── significantWords ────────────────────────────────────────────────────

describe('significantWords', () => {
  test('extracts meaningful words, strips stop words', () => {
    const words = significantWords('NPD Report due on Apr 20');
    expect(words.has('npd')).toBe(true);
    expect(words.has('report')).toBe(true);
    expect(words.has('due')).toBe(false);  // stop word
    expect(words.has('on')).toBe(false);   // stop word
    expect(words.has('20')).toBe(true);    // numbers kept
  });

  test('strips punctuation', () => {
    const words = significantWords("Gallardo's: Case Analysis");
    expect(words.has('gallardo')).toBe(true);
    expect(words.has('case')).toBe(true);
    expect(words.has('analysis')).toBe(true);
  });

  test('single-char words removed', () => {
    const words = significantWords('A B report');
    expect(words.has('report')).toBe(true);
    expect(words.size).toBe(1);
  });
});

// ── hasWordOverlap ──────────────────────────────────────────────────────

describe('hasWordOverlap', () => {
  test('returns true when sets share a word', () => {
    const a = significantWords('NPD Report');
    const b = significantWords('NPD Report due Apr 20');
    expect(hasWordOverlap(a, b)).toBe(true);
  });

  test('returns false when sets share no words', () => {
    const a = significantWords('Midterm Exam');
    const b = significantWords('Dell Case Discussion');
    expect(hasWordOverlap(a, b)).toBe(false);
  });

  test('returns true for partial title overlap', () => {
    const a = significantWords('Cumulative Exam');
    const b = significantWords('Cumulative Exam Apr 16');
    expect(hasWordOverlap(a, b)).toBe(true);
  });
});

// ── Integration: dedupe scenarios ───────────────────────────────────────

describe('dedupe scenarios for syllabus:confirmImport', () => {
  // Simulate the dedupe logic from the confirm handler

  function wouldDedup(
    assignments: Array<{ title: string; dueDate?: number }>,
    deadline: { title: string; deadlineAt: number }
  ): boolean {
    const fingerprints = assignments
      .filter(a => a.dueDate)
      .map(a => ({ day: calendarDay(a.dueDate!), words: significantWords(a.title) }));

    const dDay = calendarDay(deadline.deadlineAt);
    const dWords = significantWords(deadline.title);
    return fingerprints.some(af => af.day === dDay && hasWordOverlap(af.words, dWords));
  }

  test('NPD Report assignment dedupes matching NPD Report deadline', () => {
    const apr20 = new Date(2026, 3, 20, 23, 59).getTime();
    expect(wouldDedup(
      [{ title: 'NPD Report', dueDate: apr20 }],
      { title: 'NPD Report', deadlineAt: apr20 }
    )).toBe(true);
  });

  test('Cumulative Exam assignment dedupes matching exam deadline', () => {
    const apr16 = new Date(2026, 3, 16, 23, 59).getTime();
    expect(wouldDedup(
      [{ title: 'Cumulative Exam', dueDate: apr16 }],
      { title: 'Cumulative Exam Apr 16', deadlineAt: apr16 }
    )).toBe(true);
  });

  test('unrelated deadline on same date is NOT deduped', () => {
    const apr20 = new Date(2026, 3, 20, 23, 59).getTime();
    expect(wouldDedup(
      [{ title: 'NPD Report', dueDate: apr20 }],
      { title: 'Dell Case Checkpoint', deadlineAt: apr20 }
    )).toBe(false);
  });

  test('same title on different date is NOT deduped', () => {
    const apr20 = new Date(2026, 3, 20, 23, 59).getTime();
    const may5 = new Date(2026, 4, 5, 23, 59).getTime();
    expect(wouldDedup(
      [{ title: 'Final Presentation', dueDate: apr20 }],
      { title: 'Final Presentation', deadlineAt: may5 }
    )).toBe(false);
  });

  test('case checkpoint deadlines are preserved (no matching assignment)', () => {
    const feb3 = new Date(2026, 1, 3, 23, 59).getTime();
    const feb19 = new Date(2026, 1, 19, 23, 59).getTime();
    const assignments = [
      { title: 'NPD Report', dueDate: new Date(2026, 3, 20).getTime() },
      { title: 'Cumulative Exam', dueDate: new Date(2026, 3, 16).getTime() },
    ];
    expect(wouldDedup(assignments, { title: "Gallardo's Case", deadlineAt: feb3 })).toBe(false);
    expect(wouldDedup(assignments, { title: 'Dell Case Discussion', deadlineAt: feb19 })).toBe(false);
  });

  test('assignment without dueDate does not cause false dedup', () => {
    const apr20 = new Date(2026, 3, 20, 23, 59).getTime();
    expect(wouldDedup(
      [{ title: 'NPD Report' }],  // no dueDate
      { title: 'NPD Report', deadlineAt: apr20 }
    )).toBe(false);
  });

  test('Final Presentation assignment dedupes "Final Product/Brand Presentation Decks" deadline on same date', () => {
    const may2 = new Date(2026, 4, 2, 23, 59).getTime();
    expect(wouldDedup(
      [{ title: 'Final Product Brand Presentation', dueDate: may2 }],
      { title: 'Final Product/Brand Presentation Decks', deadlineAt: may2 }
    )).toBe(true);
  });
});
