// Timeline view — port from Markwhen / awesome-markdown-editors entry.
//
// Collects every dated entity StudyDesk tracks (deadlines, daily entries,
// captures, study items) and renders them on a horizontal time axis.
// Cards are bucketed by week so a year of activity stays readable;
// within each week, entries stack vertically. Click any entry to open
// the underlying note (or focus the deadline panel).

import React, { useMemo, useRef, useEffect } from 'react'
import { CalendarDays, FileText, Sparkles, Image as ImageIcon, ClipboardList } from 'lucide-react'
import type { Note, AcademicDeadline, Capture, StudyItem, Course } from '@schema'

interface Props {
  notes: Note[]
  deadlines: AcademicDeadline[]
  captures: Capture[]
  studyItems: StudyItem[]
  courses: Course[]
  /** Optional course filter — undefined shows everything. */
  courseId?: string
  onSelectNote: (note: Note) => void
}

type ItemKind = 'deadline' | 'daily' | 'note' | 'capture' | 'study'

interface TimelineItem {
  id: string
  kind: ItemKind
  title: string
  /** Epoch ms — the X-axis position. */
  at: number
  /** Course code or name, for grouping color. */
  courseLabel?: string
  /** Optional click target (a note to open). */
  noteId?: string
}

/** Compute the Monday of the week containing the given timestamp. */
function weekStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day  // Monday = start of week
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

const KIND_META: Record<ItemKind, { color: string; icon: React.ComponentType<any>; label: string }> = {
  deadline: { color: '#ff6b2d', icon: CalendarDays, label: 'Deadline' },
  daily:    { color: '#5fa1ff', icon: Sparkles, label: 'Daily entry' },
  note:     { color: '#10a6a3', icon: FileText, label: 'Note' },
  capture:  { color: '#ffb84d', icon: ImageIcon, label: 'Capture' },
  study:    { color: '#955aff', icon: ClipboardList, label: 'Study item' },
}

export function TimelineView({ notes, deadlines, captures, studyItems, courses, courseId, onSelectNote }: Props) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = []
    const inCourse = <T extends { courseId?: string }>(x: T) => !courseId || x.courseId === courseId
    const courseLabel = (id?: string) => {
      if (!id) return undefined
      const c = courses.find(cr => cr.id === id)
      return c?.code ?? c?.name
    }

    for (const d of deadlines.filter(inCourse)) {
      out.push({
        id: `d:${d.id}`,
        kind: 'deadline',
        title: d.title,
        at: d.deadlineAt,
        courseLabel: courseLabel(d.courseId),
        noteId: d.sourceId,
      })
    }
    for (const n of notes.filter(inCourse)) {
      const isDaily = n.documentType === 'daily_entry'
      out.push({
        id: `n:${n.id}`,
        kind: isDaily ? 'daily' : 'note',
        title: n.title || 'Untitled',
        at: n.updatedAt || n.createdAt,
        courseLabel: courseLabel(n.courseId),
        noteId: n.id,
      })
    }
    for (const c of captures.filter(inCourse)) {
      out.push({
        id: `c:${c.id}`,
        kind: 'capture',
        title: c.text.slice(0, 60),
        at: c.createdAt,
        courseLabel: courseLabel(c.courseId),
      })
    }
    for (const s of studyItems.filter(inCourse)) {
      out.push({
        id: `s:${s.id}`,
        kind: 'study',
        title: s.front.slice(0, 60),
        at: s.createdAt,
        courseLabel: courseLabel(s.courseId),
      })
    }
    return out.sort((a, b) => a.at - b.at)
  }, [notes, deadlines, captures, studyItems, courses, courseId])

  // Group items by week start
  const weeks = useMemo(() => {
    const map = new Map<number, TimelineItem[]>()
    for (const item of items) {
      const wk = weekStart(item.at)
      if (!map.has(wk)) map.set(wk, [])
      map.get(wk)!.push(item)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [items])

  // Auto-scroll to today on first render
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scrollerRef.current || weeks.length === 0) return
    const today = weekStart(Date.now())
    const target = scrollerRef.current.querySelector(`[data-week="${today}"]`) as HTMLElement | null
    if (target) {
      const offset = target.offsetLeft - scrollerRef.current.clientWidth / 2 + target.clientWidth / 2
      scrollerRef.current.scrollLeft = Math.max(0, offset)
    } else {
      // No week-of-today bucket — scroll to the rightmost (most-recent) week
      scrollerRef.current.scrollLeft = scrollerRef.current.scrollWidth
    }
  }, [weeks.length])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
        <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
          <CalendarDays size={20} className="text-white/55" />
        </div>
        <h2 className="text-[16px] font-bold text-white mb-2">No timeline data yet</h2>
        <p className="text-[12px] text-white/55 max-w-sm">
          Add deadlines, write daily entries, or capture passages — they'll plot here in chronological order.
        </p>
      </div>
    )
  }

  const todayWeek = weekStart(Date.now())

  return (
    <div className="timeline-view">
      <header className="timeline-view-header">
        <div>
          <p className="timeline-eyebrow">Timeline</p>
          <h1>Activity over time</h1>
          <span>Deadlines · daily entries · notes · captures · study items, plotted by week</span>
        </div>
        <div className="timeline-legend">
          {(Object.keys(KIND_META) as ItemKind[]).map(k => (
            <span key={k} className="timeline-legend-chip">
              <span className="legend-dot" style={{ background: KIND_META[k].color }} />
              {KIND_META[k].label}
            </span>
          ))}
        </div>
      </header>

      <div className="timeline-scroller scrollbar-thin" ref={scrollerRef}>
        <div className="timeline-track">
          {weeks.map(([wk, weekItems]) => {
            const weekDate = new Date(wk)
            const isCurrent = wk === todayWeek
            const isPast = wk < todayWeek
            return (
              <div key={wk} data-week={wk} className={`timeline-week${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`}>
                <div className="timeline-week-label">
                  <strong>{weekDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                  <em>{weekDate.toLocaleDateString(undefined, { year: 'numeric' })}</em>
                </div>
                <div className="timeline-week-items">
                  {weekItems.map(item => {
                    const meta = KIND_META[item.kind]
                    const Icon = meta.icon
                    const note = item.noteId ? notes.find(n => n.id === item.noteId) : undefined
                    return (
                      <button
                        key={item.id}
                        className="timeline-item"
                        style={{ borderLeftColor: meta.color }}
                        onClick={() => { if (note) onSelectNote(note) }}
                        disabled={!note}
                        title={`${meta.label}${item.courseLabel ? ' · ' + item.courseLabel : ''}`}
                      >
                        <Icon size={11} />
                        <span className="timeline-item-title">{item.title}</span>
                        {item.courseLabel && <span className="timeline-item-course">{item.courseLabel}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
