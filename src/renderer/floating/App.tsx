import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppState } from '@shared/hooks/useAppState'
import { PHASE_LABELS } from '@shared/constants'
import type { TimerPhase } from '@shared/types'
import { ipc } from '@shared/ipc-client'
import type {
  AcademicDeadline,
  AttentionAlert,
  Capture,
  ClassSession,
  ConfusionItem,
  Course,
  Note,
  Settings,
  StudyItem,
  Todo,
} from '@schema'
import { OnboardingScreen } from './components/OnboardingScreen'
import { SettingsPanel } from './components/SettingsPanel'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { cn } from '@shared/lib/utils'
import {
  getNotchBadges,
  getNotchIdleChips,
  getNotchLiveStatus,
  NOTCH_FEATURE_ORDER,
  type NotchFeatureId,
} from './notch/notchModel'
import { getNotchSize, type NotchState } from './notch/notchSizing'
import { NotchShell } from './notch/NotchShell'
import type { NotchDockItem } from './notch/NotchFeatureButton'
import {
  ArrowRight,
  Bell,
  Bookmark,
  Brain,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  FileText,
  GraduationCap,
  Plus,
  Settings as SettingsIcon,
  Target,
} from 'lucide-react'

const PHASE_RGB: Record<TimerPhase, [number, number, number]> = {
  focus: [255, 77, 77],
  break: [48, 209, 88],
  longBreak: [10, 132, 255],
  rest: [148, 163, 184],
}

const ONBOARD = { w: 480, h: 520 }
const SETTINGS = { w: 560, h: 640 }

type FeatureId = NotchFeatureId

interface TodaySummary {
  currentFocusTask?: Todo
  nextDeadline?: AcademicDeadline
  dueToday: AcademicDeadline[]
  dueTomorrow: AcademicDeadline[]
  dueThisWeek: AcademicDeadline[]
  criticalAlerts: unknown[]
  activeAssignment?: unknown
  unresolvedConfusions: ConfusionItem[]
  classSessionsToday: ClassSession[]
  recommendedNextAction: string
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function dueLabel(ts?: number) {
  if (!ts) return 'No date'
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function App() {
  const state = useAppState()
  const [activePopover, setActivePopover] = useState<FeatureId | null>(() => (window as any).__FOCUS_OS_WEB_PREVIEW__ ? 'today' : null)
  const [hoverDock, setHoverDock] = useState(false)
  const [workspaceOpening, setWorkspaceOpening] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [focusSettings, setFocusSettings] = useState<Settings | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [captures, setCaptures] = useState<Capture[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([])
  const [studyItems, setStudyItems] = useState<StudyItem[]>([])
  const [confusions, setConfusions] = useState<ConfusionItem[]>([])
  const [attentionAlerts, setAttentionAlerts] = useState<AttentionAlert[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [today, setToday] = useState<TodaySummary | null>(null)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseCode, setNewCourseCode] = useState('')
  const [newDeadlineTitle, setNewDeadlineTitle] = useState('')
  const [newDeadlineDate, setNewDeadlineDate] = useState('')
  const [newStudyFront, setNewStudyFront] = useState('')
  const [captureFlash, setCaptureFlash] = useState(false)
  const activeTrigger = useRef<FeatureId | null>(null)
  const triggerRefs = useRef<Partial<Record<FeatureId, HTMLButtonElement | null>>>({})

  // Live hardware notch height. Idle / hoverDock / workspaceOpening all
  // use this for window height so the shell matches the physical notch
  // pixel-for-pixel; activePopover keeps its own larger height.
  const [notchHeight, setNotchHeight] = useState<number>(38)
  useEffect(() => {
    window.focusAPI.getNotchHeight?.().then((h: number) => {
      if (h && h > 0) {
        setNotchHeight(h)
        document.documentElement.style.setProperty('--actual-notch-height', `${h}px`)
      }
    }).catch(() => {})
  }, [])

  const resizeNotch = useCallback((notchState: NotchState) => {
    const size = getNotchSize(notchState)
    const h = notchState === 'activePopover' ? size.h : notchHeight
    window.focusAPI.resizeWindow(h, size.w, true)
  }, [notchHeight])

  const refreshAcademic = useCallback(async () => {
    const [todayData, courseData, deadlineData, captureData, studyData, confusionData, alertData, noteData] = await Promise.all([
      ipc.invoke<TodaySummary>('today:get'),
      ipc.invoke<Course[]>('course:list', {}),
      ipc.invoke<AcademicDeadline[]>('deadline:list', {}),
      ipc.invoke<Capture[]>('capture:list', { limit: 80 }),
      ipc.invoke<StudyItem[]>('study:list', {}),
      ipc.invoke<ConfusionItem[]>('confusion:list', {}),
      ipc.invoke<AttentionAlert[]>('attentionAlerts:list', {}),
      ipc.invoke<Note[]>('notes:list'),
    ])
    setToday(todayData)
    setCourses(courseData)
    setDeadlines(deadlineData)
    setCaptures(captureData)
    setStudyItems(studyData)
    setConfusions(confusionData)
    setAttentionAlerts(alertData)
    setNotes(noteData)
  }, [])

  useEffect(() => {
    ipc.invoke<Settings>('focus:settings:get').then(s => {
      setFocusSettings(s)
      if (s && !s.hasCompletedOnboarding) window.focusAPI.resizeWindow(ONBOARD.h, ONBOARD.w)
      else resizeNotch('idle')
    }).catch(() => {})
    refreshAcademic().catch(() => {})
  }, [refreshAcademic, resizeNotch])

  useEffect(() => {
    if (state?.currentTask && state.currentTask !== taskInput) setTaskInput(state.currentTask)
  }, [state?.currentTask])

  useEffect(() => {
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
      setCaptureFlash(true)
      setTimeout(() => setCaptureFlash(false), 1400)
      activeTrigger.current = 'capture'
      setActivePopover('capture')
      resizeNotch('activePopover')
    })
    ipc.on('gmail:newEmails', () => refreshAcademic().catch(() => {}))
    ipc.on('ui:openSettings', () => {
      setActivePopover(null)
      setShowSettings(true)
      window.focusAPI.resizeWindow(SETTINGS.h, SETTINGS.w, false)
    })
    return () => {
      ipc.off('capture:new')
      ipc.off('gmail:newEmails')
      ipc.off('ui:openSettings')
    }
  }, [refreshAcademic, resizeNotch])

  useEffect(() => {
    if (!state) return
    const [r, g, b] = PHASE_RGB[state.phase] ?? PHASE_RGB.focus
    const root = document.documentElement
    root.style.setProperty('--phase-r', String(r))
    root.style.setProperty('--phase-g', String(g))
    root.style.setProperty('--phase-b', String(b))
  }, [state?.phase])

  const handleStartPause = useCallback(async () => {
    if (!state) return
    if (taskInput.trim() && taskInput !== state.currentTask) await window.focusAPI.setTask(taskInput.trim())
    if (state.isRunning) await window.focusAPI.pauseTimer()
    else await window.focusAPI.startTimer()
  }, [state, taskInput])

  const togglePopover = useCallback((next: FeatureId) => {
    activeTrigger.current = next
    setActivePopover(current => {
      const value = current === next ? null : next
      resizeNotch(value ? 'activePopover' : 'idle')
      if (value) setHoverDock(false)
      return value
    })
  }, [resizeNotch])

  const closePopover = useCallback((returnFocus = true) => {
    const lastTrigger = activeTrigger.current
    setActivePopover(null)
    setHoverDock(false)
    resizeNotch('idle')
    if (returnFocus && lastTrigger) {
      requestAnimationFrame(() => triggerRefs.current[lastTrigger]?.focus())
    }
  }, [resizeNotch])

  const openSettingsPanel = useCallback(() => {
    setActivePopover(null)
    setShowSettings(true)
    window.focusAPI.resizeWindow(SETTINGS.h, SETTINGS.w, false)
  }, [])

  const addCourse = useCallback(async () => {
    if (!newCourseName.trim()) return
    await ipc.invoke('course:create', { name: newCourseName.trim(), code: newCourseCode.trim() || undefined })
    setNewCourseName('')
    setNewCourseCode('')
    await refreshAcademic()
  }, [newCourseName, newCourseCode, refreshAcademic])

  const addDeadline = useCallback(async () => {
    if (!newDeadlineTitle.trim() || !newDeadlineDate) return
    await ipc.invoke('deadline:create', {
      title: newDeadlineTitle.trim(),
      deadlineAt: new Date(newDeadlineDate).getTime(),
      type: 'assignment',
      confirmed: true,
    })
    setNewDeadlineTitle('')
    setNewDeadlineDate('')
    await refreshAcademic()
  }, [newDeadlineTitle, newDeadlineDate, refreshAcademic])

  const completeDeadline = useCallback(async (id: string) => {
    await ipc.invoke('deadline:complete', { id })
    await refreshAcademic()
  }, [refreshAcademic])

  const addStudyItem = useCallback(async () => {
    if (!newStudyFront.trim()) return
    await ipc.invoke('study:create', { front: newStudyFront.trim(), type: 'flashcard' })
    setNewStudyFront('')
    await refreshAcademic()
  }, [newStudyFront, refreshAcademic])

  const captureToStudy = useCallback(async (capture: Capture, type: StudyItem['type']) => {
    await ipc.invoke('study:create', { front: capture.text, type, sourceCaptureId: capture.id, courseId: capture.courseId })
    await ipc.invoke('capture:update', { id: capture.id, patch: { labels: [...(capture.labels ?? []), type === 'flashcard' ? 'flashcard' : 'key_concept'] } })
    await refreshAcademic()
  }, [refreshAcademic])

  const captureToConfusion = useCallback(async (capture: Capture) => {
    await ipc.invoke('confusion:create', { question: capture.text, sourceCaptureId: capture.id, courseId: capture.courseId })
    await ipc.invoke('capture:update', { id: capture.id, patch: { labels: [...(capture.labels ?? []), 'confusing'] } })
    await refreshAcademic()
  }, [refreshAcademic])

  const dismissAttentionAlert = useCallback(async (id: string) => {
    await ipc.invoke('attentionAlerts:dismiss', { id })
    await refreshAcademic()
  }, [refreshAcademic])

  const snoozeAttentionAlert = useCallback(async (id: string) => {
    await ipc.invoke('attentionAlerts:snooze', { id, snoozedUntil: Date.now() + 60 * 60_000 })
    await refreshAcademic()
  }, [refreshAcademic])

  const openWorkspace = useCallback(async () => {
    setWorkspaceOpening(true)
    try {
      await ipc.invoke('window:openWorkspace', {})
      closePopover(false)
    } finally {
      setWorkspaceOpening(false)
    }
  }, [closePopover])

  const closeSettings = useCallback(() => {
    setShowSettings(false)
    resizeNotch(activePopover ? 'activePopover' : 'idle')
    ipc.invoke<Settings>('focus:settings:get').then(setFocusSettings).catch(() => {})
  }, [activePopover, resizeNotch])

  useEffect(() => {
    const tabByDigit: Record<string, FeatureId> = {
      '1': 'today',
      '2': 'courses',
      '3': 'deadlines',
      '4': 'capture',
      '5': 'study',
      '6': 'alerts',
      '7': 'workspace',
      '8': 'settings',
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showSettings) { closeSettings(); return }
        if (activePopover) closePopover()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="working on"]')
        input?.focus()
        input?.select()
      } else if ((e.metaKey || e.ctrlKey) && tabByDigit[e.key]) {
        e.preventDefault()
        togglePopover(tabByDigit[e.key])
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleStartPause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePopover, showSettings, closeSettings, closePopover, togglePopover, handleStartPause])

  // Tiny grace window so quick mouse-outs (crossing button gaps,
  // overshooting the wing edge by a few pixels) don't collapse the dock
  // and re-trigger the resize animation.
  const closeTimer = useRef<number | null>(null)

  const openHoverDock = useCallback(() => {
    if (activePopover || showSettings) return
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setHoverDock(true)
    resizeNotch('hoverDock')
  }, [activePopover, showSettings, resizeNotch])

  const closeHoverDock = useCallback(() => {
    if (activePopover || showSettings) return
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setHoverDock(false)
      resizeNotch('idle')
    }, 150)
  }, [activePopover, showSettings, resizeNotch])

  const handleShellBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    closeHoverDock()
  }, [closeHoverDock])

  const setTriggerRef = useCallback((id: FeatureId, node: HTMLButtonElement | null) => {
    triggerRefs.current[id] = node
  }, [])

  const handleFeatureClick = useCallback((id: FeatureId) => {
    togglePopover(id)
  }, [togglePopover])

  if (focusSettings && !focusSettings.hasCompletedOnboarding) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl p-6 overflow-auto pretty-scroll">
          <OnboardingScreen
            onComplete={() => {
              ipc.invoke('focus:settings:update', { hasCompletedOnboarding: true })
              setFocusSettings(s => s ? { ...s, hasCompletedOnboarding: true } : s)
              resizeNotch('idle')
            }}
          />
        </div>
      </div>
    )
  }

  if (showSettings && state) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl overflow-hidden">
          <SettingsPanel
            settings={state.settings}
            focusSettings={focusSettings}
            onSave={async (s) => { await window.focusAPI.saveSettings(s) }}
            onClose={closeSettings}
          />
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl flex items-center justify-center text-white/40 text-xs">
          Loading...
        </div>
      </div>
    )
  }

  const phaseLabel = PHASE_LABELS[state.phase]
  const nextDeadline = today?.nextDeadline
  const dueTodayCount = (today?.dueToday ?? []).length
  const timerLabel = `${fmt(state.remainingSeconds)} ${phaseLabel}`
  const liveStatus = getNotchLiveStatus({
    alerts: attentionAlerts,
    isRunning: state.isRunning,
    timerLabel: `${fmt(state.remainingSeconds)} ${phaseLabel.toLowerCase()}`,
    captureFlash,
    nextDeadline,
    studyItems,
  })
  const badges = getNotchBadges({ dueTodayCount, captures, studyItems, alerts: attentionAlerts })
  const idleChips = getNotchIdleChips({
    timerLabel,
    nextDeadline,
    studyItems,
    formatDeadline: deadline => `${deadline.title} · ${dueLabel(deadline.deadlineAt)}`,
  })

  // Right-wing dock — limited to 3 items so the shell never widens enough
  // to encroach on other apps' menu-bar status icons or window title bars.
  const dockItems: NotchDockItem[] = [
    { id: 'today',     label: 'Today',     title: 'What needs attention now',          icon: <Target size={14} /> },
    { id: 'deadlines', label: 'Deadlines', title: 'Due work, not calendar clutter',    icon: <CalendarDays size={14} />, badge: badges.deadlines },
    { id: 'settings',  label: 'Settings',  title: 'HUD controls and preferences',      icon: <SettingsIcon size={14} /> },
  ]

  const PopoverContent = () => {
    switch (activePopover) {
      case 'today':
        return (
          <PopoverPanel title="Today" subtitle="What needs attention now">
            <div className="island-hero-row">
              <div>
                <p className="student-eyebrow">Start here</p>
                <h2>{today?.recommendedNextAction ?? 'Pick one academic action'}</h2>
                <p>{nextDeadline ? `${nextDeadline.title} is next. Due ${dueLabel(nextDeadline.deadlineAt)}.` : 'Add a course and deadline to build your day.'}</p>
              </div>
              <button className="student-primary-action" onClick={handleStartPause}>{state.isRunning ? 'Pause' : 'Start'} <ArrowRight size={16} /></button>
            </div>
            <CompactList>
              {(today?.dueToday ?? []).slice(0, 3).map(d => <DeadlineRow key={d.id} d={d} onComplete={() => completeDeadline(d.id)} />)}
              {(today?.dueToday ?? []).length === 0 && <EmptyState compact icon={<Check size={20} />} title="Nothing due today" body="The island will surface due work here." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'courses':
        return (
          <PopoverPanel title="Courses" subtitle="Organize work by class">
            <section className="student-action-strip compact-form">
              <Input value={newCourseCode} onChange={e => setNewCourseCode(e.target.value)} placeholder="Code" />
              <Input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCourse()} placeholder="Course name" />
              <Button variant="phase" onClick={addCourse} disabled={!newCourseName.trim()}><Plus size={15} /> Add</Button>
            </section>
            <CompactList>
              {courses.slice(0, 5).map(course => <SimpleRow key={course.id} title={course.name} meta={course.code ?? 'Course'} icon={<GraduationCap size={15} />} />)}
              {courses.length === 0 && <EmptyState compact icon={<GraduationCap size={20} />} title="Add your first course" body="Courses connect deadlines, notes, captures, and study." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'deadlines':
        return (
          <PopoverPanel title="Deadlines" subtitle="Due work, not calendar clutter">
            <section className="student-action-strip compact-form">
              <Input value={newDeadlineTitle} onChange={e => setNewDeadlineTitle(e.target.value)} placeholder="What is due?" />
              <Input value={newDeadlineDate} onChange={e => setNewDeadlineDate(e.target.value)} type="datetime-local" />
              <Button variant="phase" onClick={addDeadline} disabled={!newDeadlineTitle.trim() || !newDeadlineDate}><Plus size={15} /> Add</Button>
            </section>
            <CompactList>
              {deadlines.slice(0, 5).map(d => <DeadlineRow key={d.id} d={d} onComplete={() => completeDeadline(d.id)} />)}
            </CompactList>
          </PopoverPanel>
        )
      case 'capture':
        return (
          <PopoverPanel title="Capture" subtitle="Turn highlights into study material">
            <CompactList>
              {captures.slice(0, 4).map(c => (
                <article key={c.id} className="student-capture-card compact">
                  <p>{c.text}</p>
                  <div className="student-capture-actions">
                    <Button variant="ghost" size="sm" onClick={() => captureToStudy(c, 'flashcard')}>Flashcard</Button>
                    <Button variant="ghost" size="sm" onClick={() => captureToStudy(c, 'concept')}>Concept</Button>
                    <Button variant="ghost" size="sm" onClick={() => captureToConfusion(c)}>Question</Button>
                  </div>
                </article>
              ))}
              {captures.length === 0 && <EmptyState compact icon={<Bookmark size={20} />} title="No captures yet" body="Captured reading and class notes will appear here." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'study':
        return (
          <PopoverPanel title="Study" subtitle="Review queue and parked questions">
            <section className="student-action-strip slim">
              <Input value={newStudyFront} onChange={e => setNewStudyFront(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStudyItem()} placeholder="Create flashcard or concept" />
              <Button variant="phase" onClick={addStudyItem} disabled={!newStudyFront.trim()}><Plus size={15} /> Add</Button>
            </section>
            <CompactList>
              {studyItems.slice(0, 4).map(i => (
                <article key={i.id} className="student-simple-row">
                  <div className="student-row-icon"><Brain size={15} /></div>
                  <div className="min-w-0 flex-1"><h3>{i.front}</h3><p>{i.type} · {i.reviewCount} reviews</p></div>
                  {(['again', 'hard', 'good', 'easy'] as const).map(r => (
                    <button key={r} className="island-mini-action" onClick={() => ipc.invoke('study:review', { id: i.id, difficulty: r }).then(refreshAcademic)}>{r}</button>
                  ))}
                </article>
              ))}
              {confusions.slice(0, 2).map(c => <SimpleRow key={c.id} title={c.question} meta={c.nextStep ?? c.status} icon={<CircleHelp size={15} />} />)}
            </CompactList>
          </PopoverPanel>
        )
      case 'alerts':
        return (
          <PopoverPanel title="Local alerts" subtitle="Academic items that need attention">
            <CompactList>
              {attentionAlerts.slice(0, 5).map(alert => (
                <article key={alert.id} className="student-alert-card">
                  <div><h3>{alert.title}</h3><p>{alert.reason}</p></div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => snoozeAttentionAlert(alert.id)}>Snooze</Button>
                    <Button variant="ghost" size="sm" onClick={() => dismissAttentionAlert(alert.id)}>Dismiss</Button>
                  </div>
                </article>
              ))}
              {attentionAlerts.length === 0 && <EmptyState compact icon={<Bell size={20} />} title="No local alerts" body="Deadlines, study reviews, and unresolved questions will surface here." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'workspace':
        return (
          <PopoverPanel title="StudyDesk Workspace" subtitle="Open the full native academic workspace">
            <div className="island-hero-row workspace">
              <div>
                <p className="student-eyebrow">Native app window</p>
                <h2>Write, parse, review, and plan from one study desk.</h2>
                <p>Your notes, courses, deadlines, captures, and study tools open in a dedicated desktop window.</p>
              </div>
              <button className="student-primary-action" onClick={openWorkspace} disabled={workspaceOpening}>
                {workspaceOpening ? 'Opening...' : 'Open StudyDesk'} <ArrowRight size={16} />
              </button>
            </div>
            <CompactList>
              {notes.slice(0, 4).map(note => <SimpleRow key={note.id} title={note.title || 'Untitled'} meta={note.documentType ?? 'note'} icon={<FileText size={15} />} />)}
              {notes.length === 0 && <EmptyState compact icon={<FileText size={20} />} title="No documents yet" body="Open StudyDesk to create your first note or import a syllabus." />}
            </CompactList>
          </PopoverPanel>
        )
      case 'settings':
        return (
          <PopoverPanel title="Settings" subtitle="HUD controls and preferences">
            <div className="island-settings-grid">
              <button onClick={openSettingsPanel}>
                <Clock3 size={16} />
                <span>Timer settings</span>
              </button>
              <button onClick={openSettingsPanel}>
                <Bookmark size={16} />
                <span>Capture settings</span>
              </button>
              <button onClick={openSettingsPanel}>
                <SettingsIcon size={16} />
                <span>Full settings</span>
              </button>
            </div>
            <p className="island-settings-note">Gmail and email-agent controls are outside the core StudyDesk flow.</p>
          </PopoverPanel>
        )
      default:
        return null
    }
  }

  const handleRootMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activePopover) return
    const target = event.target as HTMLElement
    if (target.closest('.studydesk-notch-shell') || target.closest('.studydesk-notch-popover')) return
    closePopover(false)
  }

  const handleDockKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    const active = document.activeElement as HTMLElement | null
    const current = active?.dataset.feature as FeatureId | undefined
    const currentIndex = current ? NOTCH_FEATURE_ORDER.indexOf(current) : -1
    let nextIndex = currentIndex
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = NOTCH_FEATURE_ORDER.length - 1
    else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % NOTCH_FEATURE_ORDER.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + NOTCH_FEATURE_ORDER.length) % NOTCH_FEATURE_ORDER.length
    event.preventDefault()
    triggerRefs.current[NOTCH_FEATURE_ORDER[nextIndex]]?.focus()
  }

  const renderedPopover = <PopoverContent />

  return (
    <NotchShell
      activeFeature={activePopover}
      hoverDock={hoverDock}
      captureFlash={captureFlash}
      isRunning={state.isRunning}
      dockItems={dockItems}
      idleChips={idleChips}
      liveStatus={liveStatus}
      onRootMouseDown={handleRootMouseDown}
      onMouseEnter={openHoverDock}
      onMouseLeave={closeHoverDock}
      onFocusCapture={openHoverDock}
      onBlurCapture={handleShellBlur}
      onTimerClick={handleStartPause}
      onFeatureClick={handleFeatureClick}
      onDockKeyDown={handleDockKeyDown}
      setTriggerRef={setTriggerRef}
      onClosePopover={() => closePopover()}
      onOpenWorkspace={openWorkspace}
    >
      {renderedPopover}
    </NotchShell>
  )
}


function PopoverPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="island-popover-panel">
      <header className="island-popover-header">
        <div>
          <p className="student-eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="island-popover-body">{children}</div>
    </div>
  )
}

function CompactList({ children }: { children: React.ReactNode }) {
  return <div className="student-list compact">{children}</div>
}

function DeadlineRow({ d, onComplete }: { d: AcademicDeadline; onComplete: () => void }) {
  return (
    <article className="student-deadline-row">
      <div className="student-row-icon"><CalendarDays size={16} /></div>
      <div className="min-w-0 flex-1">
        <h3>{d.title}</h3>
        <p>{dueLabel(d.deadlineAt)} · {d.type}{!d.confirmed ? ' · needs review' : ''}</p>
      </div>
      <button onClick={onComplete} aria-label={`Mark ${d.title} complete`} className="student-done-button">
        <Check size={14} /> Done
      </button>
    </article>
  )
}

function SimpleRow({ title, meta, icon }: { title: string; meta?: string; icon?: React.ReactNode }) {
  return (
    <article className="student-simple-row">
      <div className="student-row-icon">{icon ?? <FileText size={15} />}</div>
      <div className="min-w-0 flex-1">
        <h3>{title}</h3>
        {meta && <p>{meta}</p>}
      </div>
    </article>
  )
}

function EmptyState({ icon, title, body, compact = false }: { icon: React.ReactNode; title: string; body: string; compact?: boolean }) {
  return (
    <div className={cn('student-empty', compact && 'compact')}>
      <div className="student-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}
