// Filter DSL — port of TiddlyWiki's filter expression language.
// TiddlyWiki uses `[tag[physics]!sort[modified]limit[10]]` to select
// tiddlers; our adaptation operates on Notes (and any record with
// `id`, `title`, `content`, `courseId`, `tags`, `documentType`,
// `updatedAt`, `createdAt`).
//
// Syntax:
//   [tag[exam]]              keep items whose tags include "exam"
//   [type[reading]]          keep items whose documentType === "reading"
//   [course[CS101]]          keep items in the course with that code OR id
//   [title[chapter]]         title contains "chapter" (case-insensitive)
//   [text[deadline]]         content contains "deadline" (case-insensitive)
//   [!tag[draft]]            negation — exclude items tagged "draft"
//   [sort[updated]]          sort by updatedAt descending
//   [sort[title]]            sort by title ascending
//   [limit[20]]              keep at most 20 items
//
// Multiple filters can be chained inside one `[...]`:
//   [tag[exam]type[reading]sort[updated]limit[5]]
// Or stacked across multiple bracket groups (intersection):
//   [tag[exam]] [type[reading]]
//
// Plain query (no brackets at all) falls back to substring search across
// title + content, matching the existing search behavior. This means a
// user can keep typing simple words and only opt into DSL when they
// type a `[`.

export interface FilterableItem {
  id: string
  title?: string
  content?: string
  courseId?: string
  tags?: string[]
  documentType?: string
  updatedAt?: number
  createdAt?: number
}

export interface CourseLookup {
  id: string
  code?: string
  name: string
}

interface ParsedFilter {
  /** Field operator: tag/type/course/title/text/sort/limit. */
  op: string
  /** Value inside the inner brackets. */
  value: string
  /** True when prefixed with `!` (negation). */
  negate: boolean
}

interface ParsedExpression {
  filters: ParsedFilter[]
}

/** Parse a single bracket group like `[tag[exam]!type[draft]sort[updated]]`.
 *  Returns the list of (op, value, negate) tuples in order. Returns null
 *  if the group is malformed. */
function parseGroup(group: string): ParsedFilter[] | null {
  const filters: ParsedFilter[] = []
  let i = 0
  while (i < group.length) {
    while (i < group.length && /\s/.test(group[i])) i++
    if (i >= group.length) break
    let negate = false
    if (group[i] === '!') { negate = true; i++ }
    const opStart = i
    while (i < group.length && /[a-zA-Z]/.test(group[i])) i++
    const op = group.slice(opStart, i)
    if (!op) return null
    if (group[i] !== '[') return null
    i++ // consume '['
    const valStart = i
    while (i < group.length && group[i] !== ']') i++
    if (group[i] !== ']') return null
    const value = group.slice(valStart, i)
    i++ // consume ']'
    filters.push({ op: op.toLowerCase(), value, negate })
  }
  return filters
}

/** Parse the full filter expression. Top-level pieces are bracket groups
 *  and optionally a leading plain-text substring. Returns null if any
 *  bracket group is malformed (caller falls back to substring match). */
export function parseFilterExpression(expr: string): ParsedExpression | null {
  const trimmed = expr.trim()
  if (!trimmed) return { filters: [] }

  const groups: ParsedFilter[] = []
  let i = 0
  while (i < trimmed.length) {
    while (i < trimmed.length && /\s/.test(trimmed[i])) i++
    if (i >= trimmed.length) break
    if (trimmed[i] !== '[') return null  // not a DSL — caller falls back
    i++ // consume '['
    let depth = 1
    const start = i
    while (i < trimmed.length && depth > 0) {
      if (trimmed[i] === '[') depth++
      else if (trimmed[i] === ']') depth--
      if (depth > 0) i++
    }
    if (depth !== 0) return null
    const inner = trimmed.slice(start, i)
    i++ // consume closing ']'
    const parsed = parseGroup(inner)
    if (!parsed) return null
    groups.push(...parsed)
  }
  return { filters: groups }
}

/** Apply the parsed expression to a list of items. Performs filtering
 *  (tag/type/course/title/text), then sort, then limit. */
export function applyFilter<T extends FilterableItem>(
  items: T[],
  expr: ParsedExpression,
  courses: CourseLookup[] = []
): T[] {
  let result = items.slice()
  let sortBy: string | null = null
  let limit: number | null = null

  for (const f of expr.filters) {
    const v = f.value.toLowerCase()
    switch (f.op) {
      case 'tag':
        result = result.filter(it => {
          const has = (it.tags ?? []).some(t => t.toLowerCase() === v)
          return f.negate ? !has : has
        })
        break
      case 'type':
        result = result.filter(it => {
          const match = (it.documentType ?? '').toLowerCase() === v
          return f.negate ? !match : match
        })
        break
      case 'course': {
        // Match courseId OR course code OR course name
        const candidate = courses.find(c =>
          c.id.toLowerCase() === v || (c.code ?? '').toLowerCase() === v || c.name.toLowerCase() === v
        )
        const targetId = candidate?.id ?? f.value  // fall back to literal id
        result = result.filter(it => {
          const match = it.courseId === targetId
          return f.negate ? !match : match
        })
        break
      }
      case 'title':
        result = result.filter(it => {
          const match = (it.title ?? '').toLowerCase().includes(v)
          return f.negate ? !match : match
        })
        break
      case 'text':
        result = result.filter(it => {
          const match = (it.content ?? '').toLowerCase().includes(v)
          return f.negate ? !match : match
        })
        break
      case 'sort':
        sortBy = v
        break
      case 'limit':
        limit = parseInt(f.value, 10) || null
        break
      // Unknown ops are silently ignored — keeps the parser forgiving as
      // the catalog grows.
    }
  }

  if (sortBy) {
    result.sort((a, b) => {
      switch (sortBy) {
        case 'updated': return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
        case 'created': return (b.createdAt ?? 0) - (a.createdAt ?? 0)
        case 'title':   return (a.title ?? '').localeCompare(b.title ?? '')
        default: return 0
      }
    })
  }

  if (limit !== null && limit > 0) result = result.slice(0, limit)
  return result
}

/** Convenience: parse and apply in one call. Falls back to plain-text
 *  substring search when the expression doesn't contain any brackets. */
export function filterItems<T extends FilterableItem>(
  items: T[],
  query: string,
  courses: CourseLookup[] = []
): T[] {
  const trimmed = query.trim()
  if (!trimmed) return items
  if (!trimmed.includes('[')) {
    const q = trimmed.toLowerCase()
    return items.filter(it =>
      (it.title ?? '').toLowerCase().includes(q) ||
      (it.content ?? '').toLowerCase().includes(q)
    )
  }
  const parsed = parseFilterExpression(trimmed)
  if (!parsed) {
    // Malformed — fall back to substring across the whole input
    const q = trimmed.toLowerCase()
    return items.filter(it =>
      (it.title ?? '').toLowerCase().includes(q) ||
      (it.content ?? '').toLowerCase().includes(q)
    )
  }
  return applyFilter(items, parsed, courses)
}
