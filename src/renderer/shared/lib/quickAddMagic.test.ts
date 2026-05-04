import { describe, it, expect } from 'vitest'
import { parseQuickAdd, getItemsFromPrefix, findDateInText } from './quickAddMagic'

// Anchor "now" so weekday math is deterministic
// 2026-04-15 (Wednesday) at noon
const NOW = new Date(2026, 3, 15, 12, 0, 0)

describe('getItemsFromPrefix', () => {
  it('extracts a single bare-word label', () => {
    expect(getItemsFromPrefix('do thing *urgent', '*')).toEqual(['urgent'])
  })
  it('extracts multiple bare-word labels', () => {
    expect(getItemsFromPrefix('do thing *a *b *c', '*')).toEqual(['a', 'b', 'c'])
  })
  it('extracts a quoted label', () => {
    expect(getItemsFromPrefix('do thing *"high priority"', '*')).toEqual(['high priority'])
  })
  it('handles leading prefix', () => {
    expect(getItemsFromPrefix('*urgent do thing', '*')).toEqual(['urgent'])
  })
  it('dedupes', () => {
    expect(getItemsFromPrefix('*a *a *b', '*')).toEqual(['a', 'b'])
  })
})

describe('findDateInText', () => {
  it('parses "tomorrow at 5pm"', () => {
    const r = findDateInText('do thing tomorrow at 5pm', NOW)
    expect(r).not.toBeNull()
    expect(r!.date.getHours()).toBe(17)
    expect(r!.date.getMinutes()).toBe(0)
    expect(r!.date.getDate()).toBe(NOW.getDate() + 1)
  })
  it('parses "today at 11:59pm"', () => {
    const r = findDateInText('do thing today at 11:59pm', NOW)
    expect(r).not.toBeNull()
    expect(r!.date.getHours()).toBe(23)
    expect(r!.date.getMinutes()).toBe(59)
    expect(r!.date.toDateString()).toBe(NOW.toDateString())
  })
  it('defaults bare "tomorrow" to 23:59', () => {
    const r = findDateInText('tomorrow', NOW)
    expect(r!.date.getHours()).toBe(23)
    expect(r!.date.getMinutes()).toBe(59)
  })
  it('parses "in 3 days"', () => {
    const r = findDateInText('write report in 3 days', NOW)
    expect(r!.date.getDate()).toBe(NOW.getDate() + 3)
  })
  it('parses "next monday"', () => {
    const r = findDateInText('quiz next monday', NOW)
    // NOW is Wed Apr 15. next monday = Apr 27 (week after the upcoming monday)
    expect(r!.date.getDate()).toBe(27)
    expect(r!.date.getDay()).toBe(1)
  })
  it('parses bare "friday" as the upcoming friday', () => {
    const r = findDateInText('paper friday', NOW)
    // NOW is Wed Apr 15 → friday = Apr 17
    expect(r!.date.getDate()).toBe(17)
    expect(r!.date.getDay()).toBe(5)
  })
  it('parses MM/DD with year defaulting to current', () => {
    const r = findDateInText('exam 12/25', NOW)
    expect(r!.date.getMonth()).toBe(11)
    expect(r!.date.getDate()).toBe(25)
    expect(r!.date.getFullYear()).toBe(NOW.getFullYear())
  })
  it('parses MM/DD/YY with 20XX expansion', () => {
    const r = findDateInText('exam 12/25/27', NOW)
    expect(r!.date.getFullYear()).toBe(2027)
  })
  it('parses 24h time "at 23:59"', () => {
    const r = findDateInText('thing tomorrow at 23:59', NOW)
    expect(r!.date.getHours()).toBe(23)
    expect(r!.date.getMinutes()).toBe(59)
  })
  it('returns null when no date phrase present', () => {
    expect(findDateInText('just a plain title', NOW)).toBeNull()
  })
})

describe('parseQuickAdd', () => {
  it('extracts everything from the canonical example', () => {
    const r = parseQuickAdd(
      'Read Kant chapter 3 tomorrow at 5pm *urgent +philosophy !1',
      NOW
    )
    expect(r.title).toBe('Read Kant chapter 3')
    expect(r.deadlineAt).toBeDefined()
    expect(new Date(r.deadlineAt!).getHours()).toBe(17)
    expect(r.labels).toEqual(['urgent'])
    expect(r.courseCode).toBe('philosophy')
    expect(r.priority).toBe(1)
  })

  it('returns just the title when nothing else is present', () => {
    const r = parseQuickAdd('Plain task title', NOW)
    expect(r.title).toBe('Plain task title')
    expect(r.deadlineAt).toBeUndefined()
    expect(r.labels).toEqual([])
    expect(r.courseCode).toBeUndefined()
    expect(r.priority).toBeUndefined()
  })

  it('handles multiple labels', () => {
    const r = parseQuickAdd('Quiz prep *exam *chapter5 *important', NOW)
    expect(r.labels).toEqual(['exam', 'chapter5', 'important'])
    expect(r.title).toBe('Quiz prep')
  })

  it('preserves quoted course code with spaces', () => {
    const r = parseQuickAdd('Write paper +"BUAD 6461" tomorrow', NOW)
    expect(r.courseCode).toBe('BUAD 6461')
    expect(r.title).toBe('Write paper')
  })

  it('handles MM/DD with a project', () => {
    const r = parseQuickAdd('Midterm 12/25 +finance', NOW)
    expect(r.courseCode).toBe('finance')
    expect(r.deadlineAt).toBeDefined()
    expect(new Date(r.deadlineAt!).getMonth()).toBe(11)
    expect(r.title).toBe('Midterm')
  })

  it('handles priority alone', () => {
    const r = parseQuickAdd('Submit form !2', NOW)
    expect(r.priority).toBe(2)
    expect(r.title).toBe('Submit form')
  })

  it('rejects priority outside 1..5', () => {
    const r = parseQuickAdd('Thing !7', NOW)
    expect(r.priority).toBeUndefined()
    // The "!7" is left in title since regex didn't match — acceptable
  })

  it('collapses multiple spaces in remaining title', () => {
    const r = parseQuickAdd('a   b *x   c', NOW)
    expect(r.title).toBe('a b c')
  })

  it('trims trailing/leading whitespace from title', () => {
    const r = parseQuickAdd('  Read book tomorrow  ', NOW)
    expect(r.title).toBe('Read book')
  })
})
