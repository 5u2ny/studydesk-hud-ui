import type { AppState, AppSettings, FocusAPI, TimerPhase } from './types'
import { DEFAULT_SETTINGS } from './constants'
import { DEFAULT_SETTINGS as DEFAULT_SCHEMA_SETTINGS } from '@schema'
import type {
  AcademicDeadline,
  Assignment,
  AttentionAlert,
  Capture,
  ClassSession,
  ConfusionItem,
  Course,
  CriticalEmailAlert,
  Note,
  Settings,
  StudyItem,
  Todo,
} from '@schema'

export function installMockAPI() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  ;(window as any).__FOCUS_OS_WEB_PREVIEW__ = true
  const now = new Date('2026-04-27T17:44:00-04:00').getTime()

  const courses: Course[] = [
    {
      id: 'preview-course-1',
      name: 'Introduction to Psychology',
      code: 'PSYC 101',
      professorName: 'Dr. Rivera',
      professorEmail: 'rivera@example.edu',
      officeHours: 'Tue 2:00 PM',
      term: 'Spring 2026',
      color: '#22d3ee',
      createdAt: now,
      updatedAt: now,
      archived: false,
    },
  ]

  const deadlines: AcademicDeadline[] = [
    {
      id: 'preview-deadline-1',
      courseId: 'preview-course-1',
      title: 'Research reflection draft',
      deadlineAt: now + 1000 * 60 * 60 * 5,
      type: 'assignment',
      sourceType: 'manual',
      confirmed: true,
      completed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'preview-deadline-2',
      courseId: 'preview-course-1',
      title: 'Chapter 4 reading notes',
      deadlineAt: now + 1000 * 60 * 60 * 28,
      type: 'reading',
      sourceType: 'syllabus',
      confirmed: true,
      completed: false,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const assignments: Assignment[] = []
  const notes: Note[] = [
    {
      id: 'preview-note-1',
      title: 'Research reflection draft',
      content: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Working memory and retrieval practice' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Working memory is limited, so the study plan should use retrieval practice, spacing, and short correction loops instead of rereading.' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Deliverable: submit a 900 word reflection with two citations by April 29 at 11:59 PM.' }] },
        ],
      }),
      courseId: 'preview-course-1',
      documentType: 'assignment_prompt',
      tags: ['reflection', 'draft'],
      capturedFromIds: ['preview-capture-1'],
      createdAt: now - 1000 * 60 * 60 * 3,
      updatedAt: now - 1000 * 60 * 18,
    },
    {
      id: 'preview-note-2',
      title: 'Syllabus checkpoints',
      content: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Quiz 2 is next week. Final project proposal is due May 6.' }] },
        ],
      }),
      courseId: 'preview-course-1',
      documentType: 'syllabus',
      tags: ['syllabus'],
      capturedFromIds: [],
      createdAt: now - 1000 * 60 * 60 * 24,
      updatedAt: now - 1000 * 60 * 60 * 2,
    },
  ]
  const captures: Capture[] = [
    {
      id: 'preview-capture-1',
      text: 'Working memory is limited, so study sessions should force retrieval instead of rereading.',
      source: 'highlight',
      sourceApp: 'Preview Reader',
      labels: ['key_concept'],
      createdAt: now - 1000 * 60 * 12,
      pinned: false,
    },
  ]
  const studyItems: StudyItem[] = [
    {
      id: 'preview-study-1',
      courseId: 'preview-course-1',
      type: 'flashcard',
      front: 'What is retrieval practice?',
      back: 'Actively recalling information instead of passively rereading it.',
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  ]
  const classSessions: ClassSession[] = []
  const confusions: ConfusionItem[] = [
    {
      id: 'preview-confusion-1',
      courseId: 'preview-course-1',
      question: 'How is working memory different from short-term memory?',
      status: 'unresolved',
      nextStep: 'Ask during office hours',
      createdAt: now,
    },
  ]
  const alerts: CriticalEmailAlert[] = []
  const attentionAlerts: AttentionAlert[] = [
    {
      id: 'preview-attention-1',
      sourceType: 'deadline',
      sourceId: 'preview-deadline-1',
      courseId: 'preview-course-1',
      title: 'Research reflection draft',
      reason: 'Deadline is due within 24 hours.',
      actionLabel: 'Open deadline',
      priority: 'high',
      status: 'new',
      dueAt: deadlines[0].deadlineAt,
      createdAt: now,
      updatedAt: now,
    },
  ]
  const todos: Todo[] = []
  let focusSettings: Settings = { ...DEFAULT_SCHEMA_SETTINGS, hasCompletedOnboarding: true }

  const state: AppState = {
    phase: 'focus',
    isRunning: false,
    remainingSeconds: 25 * 60,
    totalSeconds: 25 * 60,
    cycleCount: 0,
    currentTask: '',
    isFrozen: false,
    freezeRemainingSeconds: 0,
    settings: { ...DEFAULT_SETTINGS },
  }

  let timerInterval: ReturnType<typeof setInterval> | null = null
  let startTime = 0
  let phaseDuration = state.settings.focusDuration

  function emit(channel: string, data?: unknown) {
    listeners[channel]?.forEach(cb => cb(data))
  }

  function broadcast() {
    emit('state:updated', { ...state })
  }

  function getDuration(phase: TimerPhase): number {
    switch (phase) {
      case 'focus': return state.settings.focusDuration
      case 'break': return state.settings.breakDuration
      case 'longBreak': return state.settings.longBreakDuration
      case 'rest': return 60 // 1 minute mock rest break
      default: return state.settings.focusDuration
    }
  }

  function startFreeze(phase: TimerPhase) {
    const dur = getDuration(phase)
    state.isFrozen = true
    state.freezeRemainingSeconds = dur
    broadcast()
    emit('freeze:enter', { phase, durationSeconds: dur })

    let remaining = dur
    const freezeInt = setInterval(() => {
      remaining--
      state.freezeRemainingSeconds = remaining
      emit('freeze:tick', { remainingSeconds: remaining })
      if (remaining <= 0) {
        clearInterval(freezeInt)
        state.isFrozen = false
        state.freezeRemainingSeconds = 0
        emit('freeze:exit')
        broadcast()
      }
    }, 1000)
  }

  function advancePhase() {
    const prev = state.phase
    if (prev === 'focus') {
      state.cycleCount++
      state.phase = state.cycleCount >= state.settings.cyclesBeforeLongBreak ? 'longBreak' : 'break'
      if (state.phase === 'longBreak') state.cycleCount = 0
    } else {
      state.phase = 'focus'
    }
    phaseDuration = getDuration(state.phase)
    state.remainingSeconds = phaseDuration
    state.totalSeconds = phaseDuration
    state.isRunning = false

    emit('timer:phaseChanged', { newPhase: state.phase, cycleCount: state.cycleCount })
    broadcast()

    startFreeze(state.phase)
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
    state.isRunning = false
  }

  function startTimer() {
    if (state.isRunning) return
    state.isRunning = true
    startTime = Date.now() - (phaseDuration - state.remainingSeconds) * 1000
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      state.remainingSeconds = Math.max(0, phaseDuration - elapsed)
      emit('timer:tick', { remainingSeconds: state.remainingSeconds, phase: state.phase, isRunning: true })
      broadcast()
      if (state.remainingSeconds <= 0) {
        stopTimer()
        advancePhase()
      }
    }, 1000)
    broadcast()
  }

  const api: FocusAPI = {
    startTimer: () => { startTimer(); return Promise.resolve() },
    pauseTimer: () => { stopTimer(); broadcast(); return Promise.resolve() },
    resetTimer: () => { stopTimer(); state.remainingSeconds = phaseDuration; broadcast(); return Promise.resolve() },
    skipPhase:  () => { stopTimer(); advancePhase(); return Promise.resolve() },
    toggleTimer:() => { if (timerInterval) { stopTimer(); broadcast() } else { startTimer() } return Promise.resolve() },
    setTask:    (task: string) => { state.currentTask = task; broadcast(); return Promise.resolve() },
    getSettings: () => Promise.resolve({ ...state.settings }),
    saveSettings: (s: AppSettings) => { state.settings = { ...s }; phaseDuration = getDuration(state.phase); broadcast(); return Promise.resolve() },
    getState: () => Promise.resolve({ ...state }),
    resizeWindow: (_height: number, _width?: number, _isIsland?: boolean) => Promise.resolve(),
    onTimerTick:    (cb) => { (listeners['timer:tick'] ??= []).push(cb as (...a: unknown[]) => void) },
    onPhaseChanged: (cb) => { (listeners['timer:phaseChanged'] ??= []).push(cb as (...a: unknown[]) => void) },
    onFreezeEnter:  (cb) => { (listeners['freeze:enter'] ??= []).push(cb as (...a: unknown[]) => void) },
    onFreezeTick:   (cb) => { (listeners['freeze:tick'] ??= []).push(cb as (...a: unknown[]) => void) },
    onFreezeExit:   (cb) => { (listeners['freeze:exit'] ??= []).push(cb as (...a: unknown[]) => void) },
    onStateUpdated: (cb) => { (listeners['state:updated'] ??= []).push(cb as (...a: unknown[]) => void) },
    removeAllListeners: (ch) => { delete listeners[ch] },

  }

  ;(window as Window & { focusAPI: FocusAPI }).focusAPI = api

  ;(window as any).electron = {
    invoke: (channel: string, req?: any) => {
      switch (channel) {
        case 'today:get':
          return Promise.resolve({
            currentFocusTask: null,
            nextDeadline: deadlines[0],
            dueToday: [deadlines[0]],
            dueTomorrow: [],
            dueThisWeek: deadlines,
            criticalAlerts: alerts,
            activeAssignment: null,
            unresolvedConfusions: confusions,
            classSessionsToday: [],
            recommendedNextAction: 'Start with the research reflection draft.',
          })
        case 'focus:settings:get':
          return Promise.resolve(focusSettings)
        case 'focus:settings:update':
          focusSettings = { ...focusSettings, ...(req ?? {}) }
          return Promise.resolve(focusSettings)
        case 'course:list':
          return Promise.resolve(courses)
        case 'assignment:list':
          return Promise.resolve(assignments)
        case 'deadline:list':
          return Promise.resolve(deadlines.filter(d => !d.completed))
        case 'capture:list':
          return Promise.resolve(captures)
        case 'notes:list':
          return Promise.resolve(notes)
        case 'notes:get':
          return Promise.resolve(notes.find(n => n.id === req?.id) ?? null)
        case 'notes:create': {
          const note: Note = {
            id: `preview-note-${notes.length + 1}`,
            title: req?.title ?? 'Untitled note',
            content: req?.content ?? '',
            documentType: 'note',
            tags: [],
            capturedFromIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          notes.unshift(note)
          return Promise.resolve(note)
        }
        case 'notes:update': {
          const index = notes.findIndex(n => n.id === req?.id)
          if (index === -1) return Promise.resolve(null)
          notes[index] = { ...notes[index], ...(req?.patch ?? {}), updatedAt: Date.now() }
          return Promise.resolve(notes[index])
        }
        case 'notes:delete': {
          const index = notes.findIndex(n => n.id === req?.id)
          if (index >= 0) notes.splice(index, 1)
          return Promise.resolve()
        }
        case 'study:list':
          return Promise.resolve(studyItems)
        case 'class:list':
          return Promise.resolve(classSessions)
        case 'confusion:list':
          return Promise.resolve(confusions)
        case 'criticalAlerts:list':
          return Promise.resolve(alerts)
        case 'attentionAlerts:list':
          return Promise.resolve(attentionAlerts.filter(a => !['dismissed', 'resolved'].includes(a.status)))
        case 'deadline:complete': {
          const deadline = deadlines.find(d => d.id === req?.id)
          if (deadline) deadline.completed = true
          return Promise.resolve(deadline)
        }
        case 'course:create': {
          const course: Course = {
            id: `preview-course-${courses.length + 1}`,
            name: req.name,
            code: req.code,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archived: false,
          }
          courses.unshift(course)
          return Promise.resolve(course)
        }
        case 'deadline:create': {
          const deadline: AcademicDeadline = {
            id: `preview-deadline-${deadlines.length + 1}`,
            title: req.title,
            deadlineAt: req.deadlineAt,
            type: req.type ?? 'assignment',
            confirmed: true,
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          deadlines.unshift(deadline)
          return Promise.resolve(deadline)
        }
        case 'assignment:parse':
          return Promise.resolve({
            title: req?.title ?? 'Parsed assignment',
            dueDate: now + 1000 * 60 * 60 * 36,
            deliverables: [{ text: 'Submit reflection draft' }],
            formatRequirements: [{ text: '900 words with two citations' }],
            rubricItems: [{ text: 'Explain the concept and apply it to study behavior' }],
            submissionChecklist: [{ text: 'Review thesis, citations, and deadline' }],
          })
        case 'assignment:create': {
          const assignment: Assignment = {
            id: `preview-assignment-${assignments.length + 1}`,
            title: req?.title ?? 'Parsed assignment',
            courseId: req?.courseId,
            dueDate: req?.dueDate,
            sourceType: req?.sourceType,
            sourceId: req?.sourceId,
            deliverables: (req?.deliverables ?? []).map((item: any, index: number) => ({
              id: `preview-deliverable-${index + 1}`,
              text: item.text ?? String(item),
              completed: false,
              source: 'parser',
              createdAt: Date.now(),
            })),
            formatRequirements: (req?.formatRequirements ?? []).map((item: any, index: number) => ({
              id: `preview-format-${index + 1}`,
              text: item.text ?? String(item),
              completed: false,
              source: 'parser',
              createdAt: Date.now(),
            })),
            rubricItems: (req?.rubricItems ?? []).map((item: any, index: number) => ({
              id: `preview-rubric-${index + 1}`,
              text: item.text ?? String(item),
              completed: false,
              source: 'rubric',
              createdAt: Date.now(),
            })),
            submissionChecklist: (req?.submissionChecklist ?? []).map((item: any, index: number) => ({
              id: `preview-check-${index + 1}`,
              text: item.text ?? String(item),
              completed: false,
              source: 'parser',
              createdAt: Date.now(),
            })),
            status: 'not_started',
            priority: 'high',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          assignments.unshift(assignment)
          return Promise.resolve(assignment)
        }
        case 'syllabus:parse':
          return Promise.resolve({
            course: { name: 'Introduction to Psychology', code: 'PSYC 101', term: 'Spring 2026' },
            deadlines: [
              { title: 'Quiz 2', deadlineAt: now + 1000 * 60 * 60 * 72, type: 'quiz', sourceType: 'syllabus' },
              { title: 'Final project proposal', deadlineAt: now + 1000 * 60 * 60 * 24 * 9, type: 'project', sourceType: 'syllabus' },
            ],
          })
        case 'syllabus:confirmImport':
          deadlines.unshift(...(req?.deadlines ?? []).map((deadline: any, index: number) => ({
            id: `preview-syllabus-deadline-${Date.now()}-${index}`,
            courseId: req?.courseId,
            title: deadline.title,
            deadlineAt: deadline.deadlineAt,
            type: deadline.type ?? 'assignment',
            sourceType: 'syllabus',
            confirmed: true,
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })))
          return Promise.resolve({ importedDeadlines: req?.deadlines ?? [] })
        case 'class:start':
          {
          const session: ClassSession = {
            id: `preview-class-${Date.now()}`,
            courseId: req?.courseId,
            title: req?.title ?? 'Class session',
            startedAt: Date.now(),
            notes: [],
            captureIds: [],
            professorHints: [],
            examHints: [],
            assignmentHints: [],
            questions: [],
            actionItems: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          classSessions.unshift(session)
          return Promise.resolve(session)
          }
        case 'class:end': {
          const session = classSessions.find(s => s.id === req?.id)
          if (session) {
            session.endedAt = Date.now()
            session.updatedAt = Date.now()
          }
          return Promise.resolve(session)
        }
        case 'study:create': {
          const item: StudyItem = {
            id: `preview-study-${studyItems.length + 1}`,
            type: req.type ?? 'flashcard',
            front: req.front,
            sourceCaptureId: req.sourceCaptureId,
            courseId: req.courseId,
            reviewCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          studyItems.unshift(item)
          return Promise.resolve(item)
        }
        case 'study:review': {
          const item = studyItems.find(i => i.id === req?.id)
          if (item) {
            item.difficulty = req?.difficulty
            item.reviewCount += 1
            item.nextReviewAt = Date.now() + 60 * 60_000
            item.updatedAt = Date.now()
          }
          return Promise.resolve(item)
        }
        case 'confusion:create': {
          const item: ConfusionItem = {
            id: `preview-confusion-${confusions.length + 1}`,
            question: req.question,
            context: req.context,
            sourceCaptureId: req.sourceCaptureId,
            courseId: req.courseId,
            status: 'unresolved',
            createdAt: Date.now(),
          }
          confusions.unshift(item)
          return Promise.resolve(item)
        }
        case 'confusion:resolve': {
          const item = confusions.find(c => c.id === req?.id)
          if (item) {
            item.status = 'resolved'
            item.resolvedAt = Date.now()
          }
          return Promise.resolve(item)
        }
        case 'capture:update':
          return Promise.resolve(captures.find(c => c.id === req?.id))
        case 'criticalAlerts:dismiss':
        case 'attentionAlerts:dismiss': {
          const alert = attentionAlerts.find(a => a.id === req?.id)
          if (alert) alert.status = 'dismissed'
          return Promise.resolve(alert)
        }
        case 'attentionAlerts:resolve': {
          const alert = attentionAlerts.find(a => a.id === req?.id)
          if (alert) alert.status = 'resolved'
          return Promise.resolve(alert)
        }
        case 'attentionAlerts:snooze': {
          const alert = attentionAlerts.find(a => a.id === req?.id)
          if (alert) {
            alert.status = 'snoozed'
            alert.snoozedUntil = req?.snoozedUntil
          }
          return Promise.resolve(alert)
        }
        case 'criticalAlerts:convertToTask':
        case 'gmail:list':
        case 'gmail:fetchNow':
        case 'category:list':
          return Promise.resolve([])
        case 'permission:checkAccessibility':
        case 'system:safeStorageAvailable':
        case 'gmail:hasShippedOAuth':
          return Promise.resolve(false)
        case 'permission:openAccessibilitySettings':
        case 'gmail:disconnect':
        case 'gmail:resetOAuthCredentials':
        case 'focus:settings:setLLMKey':
        case 'todo:setActive':
        case 'window:openWorkspace':
          return Promise.resolve()
        case 'todo:list':
          return Promise.resolve(todos)
        case 'todo:create': {
          const todo: Todo = {
            id: `preview-todo-${todos.length + 1}`,
            text: req.text,
            completed: false,
            isActive: false,
            createdAt: Date.now(),
          }
          todos.unshift(todo)
          return Promise.resolve(todo)
        }
        default:
          return Promise.resolve(null)
      }
    },
    on: (channel: string, cb: (data: unknown) => void) => {
      (listeners[channel] ??= []).push(cb as (...a: unknown[]) => void)
    },
    off: (channel: string) => {
      delete listeners[channel]
    },
  }
  
  // Expose for preview/testing
  ;(window as any).simulateRest = () => startFreeze('rest')
}
