import { describe, it, expect } from 'vitest'
import { parseFilterExpression, applyFilter, filterItems, type FilterableItem, type CourseLookup } from './filterDsl'

const NOW = 1_700_000_000_000

const items: FilterableItem[] = [
  { id: 'n1', title: 'Chapter 1: Intro', content: 'Welcome to the course.', tags: ['exam'], documentType: 'reading', courseId: 'c1', updatedAt: NOW + 1000 },
  { id: 'n2', title: 'Chapter 2: Methods', content: 'Discusses methodology.', tags: ['exam', 'draft'], documentType: 'reading', courseId: 'c1', updatedAt: NOW + 2000 },
  { id: 'n3', title: 'Lab 1', content: 'Lab steps and a deadline.', tags: ['lab'], documentType: 'note', courseId: 'c2', updatedAt: NOW + 500 },
  { id: 'n4', title: 'Notes from class', content: 'Random notes.', tags: [], documentType: 'class_notes', courseId: 'c1', updatedAt: NOW + 3000 },
]
const courses: CourseLookup[] = [
  { id: 'c1', code: 'BUAD', name: 'Business' },
  { id: 'c2', code: 'CHEM', name: 'Chemistry' },
]

describe('parseFilterExpression', () => {
  it('returns empty filter list for empty input', () => {
    expect(parseFilterExpression('')).toEqual({ filters: [] })
  })
  it('parses a single bracket group', () => {
    const r = parseFilterExpression('[tag[exam]]')
    expect(r).toEqual({ filters: [{ op: 'tag', value: 'exam', negate: false }] })
  })
  it('parses chained filters within one group', () => {
    const r = parseFilterExpression('[tag[exam]type[reading]sort[updated]limit[5]]')
    expect(r?.filters.map(f => f.op)).toEqual(['tag', 'type', 'sort', 'limit'])
  })
  it('parses negation', () => {
    const r = parseFilterExpression('[!tag[draft]]')
    expect(r?.filters[0]).toMatchObject({ op: 'tag', value: 'draft', negate: true })
  })
  it('parses multiple bracket groups (intersection)', () => {
    const r = parseFilterExpression('[tag[exam]] [type[reading]]')
    expect(r?.filters.length).toBe(2)
  })
  it('returns null for malformed input', () => {
    expect(parseFilterExpression('[tag[exam')).toBeNull()
    expect(parseFilterExpression('not a dsl')).toBeNull()
  })
})

describe('applyFilter', () => {
  it('keeps tag matches', () => {
    const r = applyFilter(items, { filters: [{ op: 'tag', value: 'exam', negate: false }] }, courses)
    expect(r.map(i => i.id)).toEqual(['n1', 'n2'])
  })
  it('honors tag negation', () => {
    const r = applyFilter(items, { filters: [{ op: 'tag', value: 'draft', negate: true }] }, courses)
    expect(r.map(i => i.id).sort()).toEqual(['n1', 'n3', 'n4'])
  })
  it('chains tag + type', () => {
    const r = applyFilter(items, {
      filters: [
        { op: 'tag', value: 'exam', negate: false },
        { op: 'type', value: 'reading', negate: false },
      ],
    }, courses)
    expect(r.map(i => i.id)).toEqual(['n1', 'n2'])
  })
  it('matches course by code', () => {
    const r = applyFilter(items, { filters: [{ op: 'course', value: 'BUAD', negate: false }] }, courses)
    expect(r.every(i => i.courseId === 'c1')).toBe(true)
  })
  it('matches course by id', () => {
    const r = applyFilter(items, { filters: [{ op: 'course', value: 'c2', negate: false }] }, courses)
    expect(r.map(i => i.id)).toEqual(['n3'])
  })
  it('text match scans content', () => {
    const r = applyFilter(items, { filters: [{ op: 'text', value: 'deadline', negate: false }] }, courses)
    expect(r.map(i => i.id)).toEqual(['n3'])
  })
  it('sort by updated descending', () => {
    const r = applyFilter(items, { filters: [{ op: 'sort', value: 'updated', negate: false }] }, courses)
    expect(r.map(i => i.id)).toEqual(['n4', 'n2', 'n1', 'n3'])
  })
  it('sort by title ascending', () => {
    const r = applyFilter(items, { filters: [{ op: 'sort', value: 'title', negate: false }] }, courses)
    expect(r.map(i => i.title)).toEqual(['Chapter 1: Intro', 'Chapter 2: Methods', 'Lab 1', 'Notes from class'])
  })
  it('limit caps result count', () => {
    const r = applyFilter(items, { filters: [{ op: 'limit', value: '2', negate: false }] }, courses)
    expect(r).toHaveLength(2)
  })
})

describe('filterItems (parse + apply)', () => {
  it('falls back to substring when no brackets', () => {
    const r = filterItems(items, 'lab', courses)
    expect(r.map(i => i.id)).toEqual(['n3'])
  })
  it('uses DSL when brackets present', () => {
    const r = filterItems(items, '[tag[exam]sort[updated]limit[1]]', courses)
    expect(r.map(i => i.id)).toEqual(['n2'])
  })
  it('falls back to substring when DSL malformed', () => {
    const r = filterItems(items, '[tag[exam', courses)
    expect(r.map(i => i.id)).toEqual([])
  })
  it('empty query returns all items unchanged', () => {
    expect(filterItems(items, '', courses)).toHaveLength(4)
  })
})
