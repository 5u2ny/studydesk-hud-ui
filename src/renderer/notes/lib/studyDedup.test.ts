import { describe, it, expect } from 'vitest'
import { isDuplicateQuestion, isDuplicateFlashcard } from './studyDedup'

describe('isDuplicateQuestion', () => {
  it('returns false for empty input', () => {
    expect(isDuplicateQuestion([], 'What is X?')).toBe(false)
    expect(isDuplicateQuestion([{ front: 'foo' }], '')).toBe(false)
    expect(isDuplicateQuestion([{ front: 'foo' }], '   ')).toBe(false)
  })

  it('detects an exact match', () => {
    expect(isDuplicateQuestion([{ front: 'What is X?' }], 'What is X?')).toBe(true)
  })

  it('normalizes whitespace on the stored side (regression: audit bug)', () => {
    // Real-world case: a study item saved with trailing newline from a
    // multi-line drag would silently fail dedup against a clean draft.
    expect(isDuplicateQuestion([{ front: '  What is X?  \n' }], 'What is X?')).toBe(true)
  })

  it('normalizes whitespace on the input side', () => {
    expect(isDuplicateQuestion([{ front: 'What is X?' }], '  What is X?  ')).toBe(true)
  })

  it('does not match different questions', () => {
    expect(isDuplicateQuestion([{ front: 'What is X?' }], 'What is Y?')).toBe(false)
  })

  it('handles missing front field gracefully', () => {
    expect(isDuplicateQuestion([{ front: undefined as any }], 'foo')).toBe(false)
  })
})

describe('isDuplicateFlashcard', () => {
  it('treats empty-string and undefined back as equivalent (regression: audit bug)', () => {
    // The previous shallow check `item.back === draft.back?.trim()` would
    // return false for stored=undefined vs draft.back='' even though both
    // mean "no answer yet".
    expect(isDuplicateFlashcard([{ front: 'X', back: undefined }], 'X', '')).toBe(true)
    expect(isDuplicateFlashcard([{ front: 'X', back: '' }], 'X', undefined)).toBe(true)
    expect(isDuplicateFlashcard([{ front: 'X', back: undefined }], 'X', undefined)).toBe(true)
  })

  it('matches identical front + back pair', () => {
    expect(isDuplicateFlashcard([{ front: 'X', back: 'Y' }], 'X', 'Y')).toBe(true)
  })

  it('does not match different backs', () => {
    expect(isDuplicateFlashcard([{ front: 'X', back: 'Y' }], 'X', 'Z')).toBe(false)
  })

  it('does not match different fronts', () => {
    expect(isDuplicateFlashcard([{ front: 'X', back: 'Y' }], 'A', 'Y')).toBe(false)
  })

  it('normalizes whitespace on both sides', () => {
    expect(isDuplicateFlashcard([{ front: '  X ', back: ' Y\n' }], 'X', 'Y')).toBe(true)
    expect(isDuplicateFlashcard([{ front: 'X', back: 'Y' }], '  X', '  Y  ')).toBe(true)
  })

  it('returns false for empty front', () => {
    expect(isDuplicateFlashcard([{ front: 'X', back: 'Y' }], '', 'Y')).toBe(false)
    expect(isDuplicateFlashcard([{ front: 'X', back: 'Y' }], '   ', 'Y')).toBe(false)
  })

  it('returns false for empty corpus', () => {
    expect(isDuplicateFlashcard([], 'X', 'Y')).toBe(false)
  })
})
