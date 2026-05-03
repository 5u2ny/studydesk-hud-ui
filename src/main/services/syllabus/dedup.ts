/**
 * Dedupe helpers for syllabus confirm-import.
 *
 * When assignmentService.create() is called with a dueDate, it auto-creates
 * an AcademicDeadline. The confirm handler must skip standalone deadlines
 * that would duplicate those auto-created records.
 *
 * Rule: same calendar day + at least one significant title word in common.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
  'is', 'are', 'was', 'were', 'be', 'by', 'with', 'from', 'due', 'thu',
  'tue', 'wed', 'mon', 'fri', 'sat', 'sun',
]);

/** Reduce a title to its significant lowercase words (no stop words, no punctuation). */
export function significantWords(title: string): Set<string> {
  return new Set(
    title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

/** True if sets share at least one significant word. */
export function hasWordOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) {
    if (b.has(w)) return true;
  }
  return false;
}

/** Return a YYYY-MM-DD string for a timestamp (local timezone). */
export function calendarDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True if a deadline duplicates an already-created assignment (same day + title overlap). */
export function isDuplicateOfAssignment(
  deadline: { title: string; deadlineAt: number },
  assignmentFingerprints: Array<{ day: string; words: Set<string> }>
): boolean {
  const dDay = calendarDay(deadline.deadlineAt);
  const dWords = significantWords(deadline.title);
  return assignmentFingerprints.some(af => af.day === dDay && hasWordOverlap(af.words, dWords));
}
