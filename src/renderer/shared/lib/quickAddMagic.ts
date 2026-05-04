// Natural-language quick-add parser — port of Vikunja's quickAddMagic.
//
// Source pattern: type a single string like
//   "Read Kant chapter 3 tomorrow at 5pm *urgent +philosophy !1"
// → extracts:
//   { title: "Read Kant chapter 3",
//     deadlineAt: <epoch ms for tomorrow 5pm>,
//     labels: ["urgent"],
//     courseCode: "philosophy",
//     priority: 1 }
//
// Parsers run in order of "narrowness": prefix tokens (`*`, `+`, `!`)
// removed first, then date phrases removed, then whatever survives is
// the title. This matches Vikunja's approach in
//   frontend/src/modules/quickAddMagic/quickAddMagic.ts
// although their priority symbol is "!" and project "+" — we keep both.
//
// We deliberately do NOT pull in chrono-node or another date library;
// keeping the parser self-contained so it ships in the renderer with
// zero added bytes. Common patterns (today / tomorrow / weekday names /
// "in N days" / "5pm" / "MM/DD") cover ~95% of academic deadline entry.

export interface QuickAddResult {
  title: string
  deadlineAt?: number
  labels: string[]
  courseCode?: string
  priority?: 1 | 2 | 3 | 4 | 5
}

/** Vikunja prefixParser logic, ported as-is. Splits on ' '+prefix, then
 *  for each fragment after the first either takes a quoted string or the
 *  first word. Leading prefix (text starts with prefix) is also handled. */
export function getItemsFromPrefix(text: string, prefix: string): string[] {
  const items: string[] = []
  const itemParts = text.split(' ' + prefix)
  if (text.startsWith(prefix)) itemParts.unshift(text.split(prefix)[1])
  itemParts.forEach((p, i) => {
    if (i < 1 && !text.startsWith(prefix)) return
    let cur = p
    if (cur.startsWith(prefix)) cur = cur.substring(1)
    let itemText: string | undefined
    if (cur.charAt(0) === '"')      itemText = cur.split('"')[1]
    else if (cur.charAt(0) === "'") itemText = cur.split("'")[1]
    else                             itemText = cur.split(' ')[0]
    if (itemText) items.push(itemText)
  })
  return Array.from(new Set(items))
}

/** Strip every occurrence of `prefix + value` (where value is the first
 *  word or a quoted string starting with that prefix) from the text. */
function stripPrefixTokens(text: string, prefix: string): string {
  let out = text
  // Quoted form first, e.g. *"high priority"
  out = out.replace(new RegExp(`(?:^|\\s)\\${prefix}"([^"]+)"`, 'g'), '')
  out = out.replace(new RegExp(`(?:^|\\s)\\${prefix}'([^']+)'`, 'g'), '')
  // Bare-word form
  out = out.replace(new RegExp(`(?:^|\\s)\\${prefix}([\\w-]+)`, 'g'), '')
  return out
}

// ── Date parsing ────────────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const WEEKDAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface DateMatch { date: Date; matched: string }

function parseTime(str: string): { hour: number; minute: number } | null {
  // "5pm", "5:30pm", "5 pm", "17:00", "23:59"
  const ampm = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0
    const meridian = ampm[3].toLowerCase()
    if (meridian === 'pm' && h !== 12) h += 12
    if (meridian === 'am' && h === 12) h = 0
    return { hour: h, minute: m }
  }
  const h24 = str.match(/^(\d{1,2}):(\d{2})\b/)
  if (h24) {
    const h = parseInt(h24[1], 10)
    const m = parseInt(h24[2], 10)
    if (h <= 23 && m <= 59) return { hour: h, minute: m }
  }
  return null
}

/** Find the first recognized date phrase in `text` and return both the
 *  resolved Date and the substring that matched (for stripping). */
export function findDateInText(text: string, now: Date = new Date()): DateMatch | null {
  const lower = text.toLowerCase()

  // --- Phrase candidates, longest-first so "next monday" beats "monday" ---

  // "tomorrow at 5pm" / "today at 11:59pm"
  const wordAtTime = lower.match(/\b(today|tomorrow|tonight|yesterday)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i)
  if (wordAtTime) {
    const word = wordAtTime[1].toLowerCase()
    const d = new Date(now)
    if (word === 'tomorrow' || word === 'tonight') d.setDate(d.getDate() + (word === 'tomorrow' ? 1 : 0))
    if (word === 'yesterday') d.setDate(d.getDate() - 1)
    const t = wordAtTime[2] ? parseTime(wordAtTime[2]) : null
    if (t) d.setHours(t.hour, t.minute, 0, 0)
    else if (word === 'tonight') d.setHours(20, 0, 0, 0)
    else d.setHours(23, 59, 0, 0)
    return { date: d, matched: wordAtTime[0] }
  }

  // "next monday at 5pm" / "next week"
  const next = lower.match(/\bnext\s+(week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i)
  if (next) {
    const target = next[1].toLowerCase()
    const d = new Date(now)
    if (target === 'week') d.setDate(d.getDate() + 7)
    else if (target === 'month') d.setMonth(d.getMonth() + 1)
    else if (target === 'year') d.setFullYear(d.getFullYear() + 1)
    else {
      const idx = (WEEKDAYS as readonly string[]).indexOf(target) >= 0
        ? (WEEKDAYS as readonly string[]).indexOf(target)
        : (WEEKDAY_SHORT as readonly string[]).indexOf(target)
      if (idx >= 0) {
        // "next monday" = the Monday AFTER the upcoming Monday.
        // Bare "monday" returns the upcoming Monday; this branch adds 7
        // for the "next" qualifier.
        const upcoming = ((idx - d.getDay() + 7) % 7) || 7
        d.setDate(d.getDate() + upcoming + 7)
      }
    }
    const t = next[2] ? parseTime(next[2]) : null
    if (t) d.setHours(t.hour, t.minute, 0, 0)
    else d.setHours(23, 59, 0, 0)
    return { date: d, matched: next[0] }
  }

  // "in 3 days" / "in 2 weeks"
  const inN = lower.match(/\bin\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i)
  if (inN) {
    const n = parseInt(inN[1], 10)
    const unit = inN[2].toLowerCase()
    const d = new Date(now)
    if (unit.startsWith('day')) d.setDate(d.getDate() + n)
    else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7)
    else if (unit.startsWith('month')) d.setMonth(d.getMonth() + n)
    d.setHours(23, 59, 0, 0)
    return { date: d, matched: inN[0] }
  }

  // bare weekday: "monday at 5pm" or "monday"
  const weekday = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i)
  if (weekday) {
    const target = weekday[1].toLowerCase()
    const idx = (WEEKDAYS as readonly string[]).indexOf(target) >= 0
      ? (WEEKDAYS as readonly string[]).indexOf(target)
      : (WEEKDAY_SHORT as readonly string[]).indexOf(target)
    if (idx >= 0) {
      const d = new Date(now)
      const diff = (idx - d.getDay() + 7) % 7 || 7
      d.setDate(d.getDate() + diff)
      const t = weekday[2] ? parseTime(weekday[2]) : null
      if (t) d.setHours(t.hour, t.minute, 0, 0)
      else d.setHours(23, 59, 0, 0)
      return { date: d, matched: weekday[0] }
    }
  }

  // "MM/DD" or "MM/DD/YYYY" or "MM/DD/YY"
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i)
  if (slash) {
    const m = parseInt(slash[1], 10)
    const day = parseInt(slash[2], 10)
    let y = slash[3] ? parseInt(slash[3], 10) : now.getFullYear()
    if (y < 100) y += 2000
    if (m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      const d = new Date(y, m - 1, day)
      const t = slash[4] ? parseTime(slash[4]) : null
      if (t) d.setHours(t.hour, t.minute, 0, 0)
      else d.setHours(23, 59, 0, 0)
      return { date: d, matched: slash[0] }
    }
  }

  return null
}

// ── Top-level parser ────────────────────────────────────────────────────────

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const result: QuickAddResult = { title: '', labels: [] }

  let text = input

  // Labels (prefix `*`)
  const labels = getItemsFromPrefix(text, '*')
  result.labels = labels
  text = stripPrefixTokens(text, '*')

  // Project / course code (prefix `+`) — first one wins
  const projects = getItemsFromPrefix(text, '+')
  if (projects[0]) result.courseCode = projects[0]
  text = stripPrefixTokens(text, '+')

  // Priority (prefix `!1` to `!5`)
  const prioMatch = text.match(/(?:^|\s)!([1-5])\b/)
  if (prioMatch) {
    result.priority = parseInt(prioMatch[1], 10) as QuickAddResult['priority']
    text = text.replace(/(?:^|\s)!([1-5])\b/, '')
  }

  // Date phrase
  const dateMatch = findDateInText(text, now)
  if (dateMatch) {
    result.deadlineAt = dateMatch.date.getTime()
    // Strip the matched date phrase. Use the original-cased index from the
    // lower-cased match — find the substring case-insensitively.
    const idx = text.toLowerCase().indexOf(dateMatch.matched)
    if (idx >= 0) {
      text = text.slice(0, idx) + text.slice(idx + dateMatch.matched.length)
    }
  }

  // Whatever's left after removing prefix tokens and the date phrase is
  // the title. Collapse multiple spaces.
  result.title = text.replace(/\s+/g, ' ').trim()

  return result
}
