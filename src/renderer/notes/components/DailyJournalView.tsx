// Daily journal pane — ported from lostdesign/linked.
//
// Linked's core idea: one entry per day, date is the primary key, navigation
// is keyboard-first (Today / Prev / Next). No "create note" friction —
// opening a date opens or creates that day's entry.
//
// Adapted for StudyDesk: daily entries are scoped per course (or workspace
// when no course is selected), use the existing TipTap editor, and live in
// the same Note store with documentType: 'daily_entry'.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Sparkles } from 'lucide-react'
import type { Note, Course } from '@schema'
import { ipc } from '@shared/ipc-client'
import { Editor } from '../Editor'
import { cn } from '@shared/lib/utils'

interface Props {
  notes: Note[]
  currentCourse?: Course
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onRefresh: () => void
  onSelect?: (note: Note) => void
}

// Local-tz YYYY-MM-DD formatter — avoids UTC drift that breaks "today" across timezones.
function dayKeyOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shiftDayKey(key: string, delta: number): string {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + delta)
  return dayKeyOf(d)
}

function humanLabel(key: string): string {
  const d = parseDayKey(key)
  const today = dayKeyOf(new Date())
  const yesterday = dayKeyOf(new Date(Date.now() - 86_400_000))
  const tomorrow = dayKeyOf(new Date(Date.now() + 86_400_000))
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  if (key === tomorrow) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function dateLabel(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DailyJournalView({ notes, currentCourse, onUpdate, onRefresh, onSelect }: Props) {
  const [activeKey, setActiveKey] = useState<string>(() => dayKeyOf(new Date()))
  const courseId = currentCourse?.id

  // Find the daily entry for (activeKey, courseId). courseId === undefined means "workspace-wide".
  const entry = useMemo(() => {
    return notes.find(n =>
      n.documentType === 'daily_entry' &&
      n.dayKey === activeKey &&
      (n.courseId ?? undefined) === (courseId ?? undefined)
    ) ?? null
  }, [notes, activeKey, courseId])

  // Recently used days (for the bottom strip)
  const recentDays = useMemo(() => {
    return notes
      .filter(n => n.documentType === 'daily_entry' && (n.courseId ?? undefined) === (courseId ?? undefined))
      .map(n => n.dayKey!)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 7)
  }, [notes, courseId])

  const goPrev = useCallback(() => setActiveKey(k => shiftDayKey(k, -1)), [])
  const goNext = useCallback(() => setActiveKey(k => shiftDayKey(k, +1)), [])
  const goToday = useCallback(() => setActiveKey(dayKeyOf(new Date())), [])

  // Linked's keyboard model: Cmd+T (today), Cmd+[ (prev), Cmd+] (next)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      // Don't hijack typing in input/textarea/contenteditable
      const inEditor = target?.closest('input, textarea, [contenteditable="true"], .ProseMirror')
      if (inEditor) return
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); goToday() }
      else if (e.key === '[' ) { e.preventDefault(); goPrev() }
      else if (e.key === ']' ) { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, goToday])

  // Lazy-create the daily entry on first edit so empty days don't pollute the store.
  const [creating, setCreating] = useState(false)
  const createForToday = useCallback(async () => {
    if (entry || creating) return entry
    setCreating(true)
    try {
      const title = humanLabel(activeKey) === 'Today' ? `Daily — ${dateLabel(activeKey)}` : `Daily — ${dateLabel(activeKey)}`
      const note = await ipc.invoke<Note>('notes:create', { title, content: '' })
      const updated = await ipc.invoke<Note>('notes:update', {
        id: note.id,
        patch: {
          documentType: 'daily_entry',
          courseId,
          dayKey: activeKey,
          tags: ['daily'],
        },
      })
      onRefresh()
      onSelect?.(updated)
      return updated
    } finally {
      setCreating(false)
    }
  }, [entry, creating, activeKey, courseId, onRefresh, onSelect])

  const handleEditorUpdate = useCallback(async (patch: Partial<Note>) => {
    if (entry) {
      await onUpdate(entry.id, patch)
      return
    }
    // First write on an empty day -> create + apply patch
    const created = await createForToday()
    if (created) await onUpdate(created.id, patch)
  }, [entry, onUpdate, createForToday])

  const isToday = activeKey === dayKeyOf(new Date())
  const isPast = activeKey < dayKeyOf(new Date())
  const isFuture = activeKey > dayKeyOf(new Date())

  return (
    <div className="flex flex-col h-full">
      {/* Header — date navigation, "linked" feel: minimal, keyboard-first */}
      <div className="px-6 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1.5">
              Daily{currentCourse ? ` · ${currentCourse.code ?? currentCourse.name}` : ''}
            </div>
            <h1 className="text-[28px] font-bold text-white leading-tight tracking-tight">
              {humanLabel(activeKey)}
            </h1>
            <div className="text-[12px] text-white/45 mt-0.5">{dateLabel(activeKey)}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={goPrev}
              className="w-8 h-8 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Previous day  (⌘[)"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={goToday}
              disabled={isToday}
              className={cn(
                'h-8 px-3 rounded-md text-[12px] font-semibold border transition-all',
                isToday
                  ? 'bg-white/[0.04] border-white/[0.06] text-white/45 cursor-default'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-200 hover:bg-blue-500/20'
              )}
              title="Jump to today  (⌘T)"
            >
              Today
            </button>
            <button
              onClick={goNext}
              className="w-8 h-8 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Next day  (⌘])"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Body — single-pane editor (linked's distraction-free principle) */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
        {entry ? (
          <Editor
            key={entry.id}
            note={entry}
            captures={[]}
            onUpdate={handleEditorUpdate}
          />
        ) : (
          <DayEmptyState
            isFuture={isFuture}
            isPast={isPast}
            label={humanLabel(activeKey)}
            onStart={createForToday}
            disabled={creating}
          />
        )}
      </div>

      {/* Recent days strip */}
      {recentDays.length > 0 && (
        <div className="px-6 py-3 border-t border-white/[0.06] flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          <CalendarDays size={11} className="text-white/40 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold mr-1 shrink-0">Recent</span>
          {recentDays.map(k => {
            const active = k === activeKey
            return (
              <button
                key={k}
                onClick={() => setActiveKey(k)}
                className={cn(
                  'shrink-0 h-7 px-2.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all',
                  active
                    ? 'bg-white/[0.10] text-white border border-white/[0.10]'
                    : 'text-white/55 hover:text-white/95 hover:bg-white/[0.04] border border-transparent'
                )}
              >
                {humanLabel(k) === 'Today' || humanLabel(k) === 'Yesterday' ? humanLabel(k) : dateLabel(k)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DayEmptyState({
  isFuture, isPast, label, onStart, disabled,
}: { isFuture: boolean; isPast: boolean; label: string; onStart: () => void; disabled: boolean }) {
  const headline = isFuture
    ? `Plan ahead for ${label.toLowerCase()}`
    : isPast
      ? `Reflect on ${label.toLowerCase()}`
      : `What's on your mind today?`
  const sub = isFuture
    ? 'Outline what you want to study, prep, or finish.'
    : isPast
      ? 'Capture what you learned, what stuck, what didn\'t.'
      : 'A daily entry for class notes, questions, decisions, or rough thinking.'

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-16 text-center max-w-[520px] mx-auto">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/15 border border-white/[0.10] flex items-center justify-center mb-4">
        <Sparkles size={18} className="text-blue-300" />
      </div>
      <h2 className="text-[18px] font-bold text-white mb-2">{headline}</h2>
      <p className="text-[13px] text-white/55 leading-relaxed mb-6">{sub}</p>
      <button
        onClick={onStart}
        disabled={disabled}
        className="h-9 px-5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-200 hover:bg-blue-500/25 hover:border-blue-500/50 disabled:opacity-50 text-[13px] font-semibold transition-all"
      >
        {disabled ? 'Creating…' : 'Start writing'}
      </button>
      <div className="mt-6 flex items-center gap-3 text-[10px] text-white/35 uppercase tracking-wider font-semibold">
        <kbd className="px-1.5 py-0.5 rounded border border-white/[0.10] bg-white/[0.04]">⌘T</kbd> today
        <span>·</span>
        <kbd className="px-1.5 py-0.5 rounded border border-white/[0.10] bg-white/[0.04]">⌘[</kbd> prev
        <span>·</span>
        <kbd className="px-1.5 py-0.5 rounded border border-white/[0.10] bg-white/[0.04]">⌘]</kbd> next
      </div>
    </div>
  )
}
