import { describe, it, expect } from 'vitest'
import { lintNotes, isEmptyContent, findOrphanNoteLinks, summarizeIssues } from './noteHealth'
import type { Note } from '@schema'

const NOW = Date.now()

const makeNote = (over: Partial<Note> = {}): Note => ({
  id: over.id ?? 'n1',
  title: over.title ?? 'Test',
  content: over.content ?? '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}',
  capturedFromIds: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})

describe('isEmptyContent', () => {
  it('flags empty string', () => expect(isEmptyContent('')).toBe(true))
  it('flags whitespace-only string', () => expect(isEmptyContent('   ')).toBe(true))
  it('flags doc with no text nodes', () => {
    expect(isEmptyContent('{"type":"doc","content":[{"type":"paragraph"}]}')).toBe(true)
  })
  it('respects whitespace-only text nodes as empty', () => {
    expect(isEmptyContent('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"   "}]}]}')).toBe(true)
  })
  it('does not flag doc with real text', () => {
    expect(isEmptyContent('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hi"}]}]}')).toBe(false)
  })
})

describe('findOrphanNoteLinks', () => {
  it('returns empty when no noteLink marks', () => {
    const content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"plain"}]}]}'
    expect(findOrphanNoteLinks(content, new Set(['n1']))).toEqual([])
  })
  it('finds note ids not in the known set', () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'A', marks: [{ type: 'noteLink', attrs: { noteId: 'missing' } }] },
        { type: 'text', text: 'B', marks: [{ type: 'noteLink', attrs: { noteId: 'n2' } }] },
      ] }],
    })
    const orphans = findOrphanNoteLinks(content, new Set(['n2']))
    expect(orphans).toEqual(['missing'])
  })
})

describe('lintNotes', () => {
  it('flags untitled notes', () => {
    const issues = lintNotes([makeNote({ title: '' })])
    expect(issues.some(i => i.kind === 'untitled_note')).toBe(true)
  })
  it('flags empty body', () => {
    const issues = lintNotes([makeNote({ content: '{"type":"doc","content":[]}' })])
    expect(issues.some(i => i.kind === 'empty_note')).toBe(true)
  })
  it('flags stale notes by default 60-day threshold', () => {
    const stale = NOW - 100 * 86_400_000
    const issues = lintNotes([makeNote({ updatedAt: stale })])
    expect(issues.some(i => i.kind === 'stale_note')).toBe(true)
  })
  it('respects custom stale threshold', () => {
    const fresh = NOW - 10 * 86_400_000
    const strict = lintNotes([makeNote({ updatedAt: fresh })], { staleDays: 5 })
    expect(strict.some(i => i.kind === 'stale_note')).toBe(true)
    const lax = lintNotes([makeNote({ updatedAt: fresh })], { staleDays: 30 })
    expect(lax.some(i => i.kind === 'stale_note')).toBe(false)
  })
  it('flags dangling parentId', () => {
    const issues = lintNotes([makeNote({ id: 'a', parentId: 'missing' })])
    expect(issues.some(i => i.kind === 'dangling_subpage' && i.related === 'missing')).toBe(true)
  })
  it('does not flag valid parentId', () => {
    const a = makeNote({ id: 'a', title: 'parent' })
    const b = makeNote({ id: 'b', title: 'child', parentId: 'a' })
    const issues = lintNotes([a, b])
    expect(issues.some(i => i.kind === 'dangling_subpage')).toBe(false)
  })
  it('orphan_note_link is severity warn, stale_note is info', () => {
    const a = makeNote({
      id: 'a',
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'x', marks: [{ type: 'noteLink', attrs: { noteId: 'gone' } }] },
        ] }],
      }),
    })
    const issues = lintNotes([a])
    const orphan = issues.find(i => i.kind === 'orphan_note_link')
    expect(orphan?.severity).toBe('warn')
  })
})

describe('summarizeIssues', () => {
  it('counts by kind and severity', () => {
    const issues = lintNotes([
      makeNote({ id: 'a', title: '' }),                     // untitled (info)
      makeNote({ id: 'b', updatedAt: NOW - 1000 * 86_400_000 }),  // stale (info)
      makeNote({ id: 'c', parentId: 'gone' }),              // dangling (warn)
    ])
    const s = summarizeIssues(issues)
    expect(s.total).toBe(3)
    expect(s.warnCount).toBe(1)
    expect(s.infoCount).toBe(2)
    expect(s.byKind.dangling_subpage).toBe(1)
  })
})
