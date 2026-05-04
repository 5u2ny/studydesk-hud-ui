// Dedup helpers for the Quiz / Flashcards tabs.
//
// Pulled out of App.tsx so the comparison logic can be unit-tested in
// isolation. The audit caught a real bug: shallow equality (item.front
// === draft.front) would miss duplicates whenever either side carried
// stray whitespace, and undefined-vs-empty-string mismatches on `back`
// also produced false negatives. Both sides are now normalized.

import type { StudyItem } from '@schema'

/** True if `front` already exists as the trimmed front of any study item. */
export function isDuplicateQuestion(items: ReadonlyArray<Pick<StudyItem, 'front'>>, front: string): boolean {
  const f = front.trim()
  if (!f) return false
  return items.some(item => (item.front ?? '').trim() === f)
}

/** True if a flashcard with this front + back combo already exists. The
 *  comparison normalizes whitespace on both fronts and treats empty
 *  string and undefined back as equivalent. */
export function isDuplicateFlashcard(
  items: ReadonlyArray<Pick<StudyItem, 'front' | 'back'>>,
  front: string,
  back: string | undefined,
): boolean {
  const f = front.trim()
  if (!f) return false
  const b = (back ?? '').trim() || undefined
  return items.some(item => {
    const itemFront = (item.front ?? '').trim()
    const itemBack = (item.back ?? '').trim() || undefined
    return itemFront === f && itemBack === b
  })
}
