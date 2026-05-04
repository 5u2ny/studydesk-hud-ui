import React, { useEffect, useMemo, useState } from 'react'
import type { AcademicDeadline, Assignment, AttentionAlert, Capture, ChecklistItem, ClassSession, ConfusionItem, Course, Note, StudyItem } from '@schema'
import { Editor } from './Editor'
import { FileDropZone } from './components/FileDropZone'
import { DailyJournalView } from './components/DailyJournalView'
import { ScanSyllabusDropZone } from './components/ScanSyllabusDropZone'
import { RelationMapView } from './components/RelationMapView'
import {
  ShellContainer,
  IconRail,
  LeftSidebar,
  SidebarSection as ShellSidebarSection,
  SidebarRow,
  MainPanel,
  RightPanel,
  RightPanelCollapsedButton,
} from './components/WorkspaceShell'
import { ipc } from '@shared/ipc-client'
import { cn } from '@shared/lib/utils'
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Circle,
  ClipboardList,
  FileText,
  Folder,
  GraduationCap,
  HelpCircle,
  Image,
  LayoutDashboard,
  MoreHorizontal,
  Network,
  PanelTop,
  PenLine,
  Play,
  Search,
  Settings,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react'

// ── Local review types (not persisted) ────────────────────────────────────────
interface AssignmentParseReview {
  title: string
  dueDate?: number
  deliverables: ChecklistItem[]
  formatRequirements: ChecklistItem[]
  rubricItems: ChecklistItem[]
  submissionChecklist: ChecklistItem[]
}

interface SyllabusDeadlineReview {
  title: string
  deadlineAt: number
  type: string
  included: boolean
}

interface SyllabusAssignmentReview {
  title: string
  dueDate?: number
  weight?: string
  type: string
  included: boolean
}

interface SyllabusSetupReview {
  title: string
  category: string
  included: boolean
}

interface SyllabusClassMeetingReview {
  days: string[]
  startTime: string
  endTime: string
  location?: string
}

interface SyllabusParseReview {
  course: { name?: string; code?: string; professorName?: string; professorEmail?: string; term?: string; officeHours?: string; location?: string }
  classMeetings: SyllabusClassMeetingReview[]
  assignments: SyllabusAssignmentReview[]
  deadlines: SyllabusDeadlineReview[]
  setupTasks: SyllabusSetupReview[]
  readings: Array<{ title: string; chapter?: string }>
  scheduleRowCount: number
}

interface SyllabusConfirmResult {
  courseId?: string
  syllabusNoteId?: string
  counts: { deadlines: number; assignments: number; setupAlerts: number }
}

interface FlashcardDraft {
  front: string
  back: string
  type: 'flashcard' | 'concept' | 'definition'
}

interface QuizQuestionDraft {
  question: string
}

type WorkspaceTool = 'today' | 'dashboard' | 'daily' | 'quiz' | 'flashcards' | 'assignment' | 'syllabus' | 'class' | 'map'
type QuickAddKind = 'course' | 'deadline' | 'note' | 'assignment' | 'syllabus' | 'study' | 'question'

interface QuickAddForm {
  title: string
  detail: string
  code: string
  due: string
}

/** Block-level TipTap node types that should be separated by newlines. */
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'codeBlock',
  'bulletList', 'orderedList', 'listItem', 'horizontalRule',
])

function noteText(content: string): string {
  try {
    const json = JSON.parse(content)
    const lines: string[] = []
    const walkBlock = (node: any) => {
      if (!node) return
      if (BLOCK_TYPES.has(node.type)) {
        const texts: string[] = []
        const collectText = (n: any) => {
          if (!n) return
          if (typeof n.text === 'string') texts.push(n.text)
          if (Array.isArray(n.content)) n.content.forEach(collectText)
        }
        collectText(node)
        lines.push(texts.join(''))
      } else if (Array.isArray(node.content)) {
        node.content.forEach(walkBlock)
      }
    }
    walkBlock(json)
    return lines.join('\n').trim()
  } catch {
    return content
  }
}

function firstUsefulLine(text: string): string {
  return text.split(/[.\n]/).map(s => s.trim()).find(s => s.length > 8)?.slice(0, 140) ?? 'Review this concept'
}

function tipTapDocument(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: text.trim()
      ? [{ type: 'paragraph', content: [{ type: 'text', text: text.trim() }] }]
      : [],
  })
}

function extractQuestionsFromNote(note: Note): QuizQuestionDraft[] {
  const text = noteText(note.content)
  return text.split(/\n+/).map(l => l.trim()).filter(l => /^\d+\.\s/.test(l)).map(l => ({ question: l.replace(/^\d+\.\s*/, '') }))
}

function defaultQuickAddForm(kind: QuickAddKind, selectedText = ''): QuickAddForm {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000)
  tomorrow.setMinutes(0, 0, 0)
  return {
    title: kind === 'course' ? '' : kind === 'deadline' ? 'New deadline' : kind === 'study' ? firstUsefulLine(selectedText) : '',
    detail: kind === 'study' ? 'Add the answer during review.' : '',
    code: '',
    due: tomorrow.toISOString().slice(0, 16),
  }
}

function initialWorkspaceTool(): WorkspaceTool {
  const tool = new URLSearchParams(window.location.search).get('tool')
  return tool === 'dashboard' || tool === 'daily' || tool === 'quiz' || tool === 'flashcards' || tool === 'assignment' || tool === 'syllabus' || tool === 'class' || tool === 'map'
    ? tool
    : 'today'
}

function initialQuickAdd(): QuickAddKind | null {
  const kind = new URLSearchParams(window.location.search).get('quickAdd')
  return kind === 'course' || kind === 'deadline' || kind === 'note' || kind === 'assignment' || kind === 'syllabus' || kind === 'study' || kind === 'question'
    ? kind
    : null
}

export default function App() {
  const initialQuickAddKind = initialQuickAdd()
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([])
  const [studyItems, setStudyItems] = useState<StudyItem[]>([])
  const [confusions, setConfusions] = useState<ConfusionItem[]>([])
  const [alerts, setAlerts] = useState<AttentionAlert[]>([])
  const [classSessions, setClassSessions] = useState<ClassSession[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<WorkspaceTool>(initialWorkspaceTool)
  const [status, setStatus] = useState('')
  const [quickAdd, setQuickAdd] = useState<QuickAddKind | null>(initialQuickAddKind)
  const [quickAddForm, setQuickAddForm] = useState<QuickAddForm>(initialQuickAddKind ? defaultQuickAddForm(initialQuickAddKind) : { title: '', detail: '', code: '', due: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) => setExpandedSections(p => ({ ...p, [key]: !p[key] }))
  // SurfSense-style right panel: collapsible Documents column with tabs
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [rightTab, setRightTab] = useState<'sources' | 'materials' | 'study'>('sources')

  async function refresh() {
    const [noteData, captureData, courseData, assignmentData, deadlineData, studyData, confusionData, alertData, classData] = await Promise.all([
      ipc.invoke<Note[]>('notes:list'),
      ipc.invoke<Capture[]>('capture:list', { limit: 80 }),
      ipc.invoke<Course[]>('course:list', {}),
      ipc.invoke<Assignment[]>('assignment:list', {}),
      ipc.invoke<AcademicDeadline[]>('deadline:list', {}),
      ipc.invoke<StudyItem[]>('study:list', {}),
      ipc.invoke<ConfusionItem[]>('confusion:list', {}),
      ipc.invoke<AttentionAlert[]>('attentionAlerts:list', {}),
      ipc.invoke<ClassSession[]>('class:list', {}),
    ])
    setNotes(noteData)
    setCaptures(captureData)
    setCourses(courseData)
    setAssignments(assignmentData)
    setDeadlines(deadlineData)
    setStudyItems(studyData)
    setConfusions(confusionData)
    setAlerts(alertData)
    setClassSessions(classData)
    setSelectedAssignmentId(prev => prev && assignmentData.some(a => a.id === prev) ? prev : null)
    setSelected(prev => prev ? noteData.find(n => n.id === prev.id) ?? noteData[0] ?? null : noteData[0] ?? null)
  }

  useEffect(() => {
    refresh().catch(() => {})
    // Trigger a rescan on workspace open so the watcher picks up files added while
    // the notes window was closed. The watcher's start() also runs scans at app
    // boot, but those events are lost if the notes window doesn't exist yet.
    ipc.invoke('folder:rescan', undefined).catch(() => {})
    ipc.on('notes:openNote', (noteId: string) => {
      ipc.invoke<Note>('notes:get', { id: noteId }).then(note => note && setSelected(note)).catch(() => {})
    })
    // [[wiki-link]] click handler — TipTap dispatches this when a user
    // clicks a rendered note-link in the editor. Use IPC for the lookup
    // so this listener always sees the latest stored note (the closure
    // would otherwise capture stale `notes` state).
    const onNoteLinkClick = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId: string }>).detail
      if (!detail?.noteId) return
      ipc.invoke<Note>('notes:get', { id: detail.noteId }).then(target => {
        if (!target) return
        setSelected(target)
        if (target.courseId) setSelectedCourseId(target.courseId)
      }).catch(() => {})
    }
    window.addEventListener('studydesk:open-note-link', onNoteLinkClick)
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
    })
    // Folder watcher: main process detects a new file → renderer reads, extracts, creates note
    ipc.on('folder:fileDetected', async (payload: { courseId: string; path: string; name: string; ext: string; size: number; mtime: number }) => {
      try {
        const buffer = await ipc.invoke<ArrayBuffer>('folder:readFile', { path: payload.path })
        const blob = new Blob([buffer])
        const file = new File([blob], payload.name)
        const { extractFileText } = await import('./lib/extractFileText')
        const result = await extractFileText(file)
        const trimmed = result.text.trim()
        if (!trimmed) throw new Error('No extractable text')

        const note = await ipc.invoke<Note>('notes:create', { title: result.title, content: tipTapDocument(trimmed) })
        const updated = await ipc.invoke<Note>('notes:update', {
          id: note.id,
          patch: { documentType: 'reading', courseId: payload.courseId, tags: [`folder-import`] },
        })
        setNotes(prev => [updated, ...prev.filter(n => n.id !== updated.id)])
        await ipc.invoke('folder:recordImport', {
          courseId: payload.courseId,
          record: { path: payload.path, mtime: payload.mtime, size: payload.size, importedAt: Date.now(), noteId: updated.id },
        })
        // Refresh the course in local state so the "N imported · auto-watching" counter updates
        const refreshedCourses = await ipc.invoke<Course[]>('course:list', {})
        setCourses(refreshedCourses)
        setStatus(`Auto-imported "${updated.title}" from course folder.`)
        setTimeout(() => setStatus(''), 3500)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Folder import failed'
        await ipc.invoke('folder:recordImport', {
          courseId: payload.courseId,
          record: { path: payload.path, mtime: payload.mtime, size: payload.size, importedAt: Date.now(), error: message },
        }).catch(() => {})
        console.warn('[folder import]', payload.name, message)
      }
    })
    return () => {
      ipc.off('notes:openNote'); ipc.off('capture:new'); ipc.off('folder:fileDetected')
      window.removeEventListener('studydesk:open-note-link', onNoteLinkClick)
    }
  }, [])

  // ── Derived filtered state ──────────────────────────────────────────────────
  const selectedText = useMemo(() => selected ? noteText(selected.content) : '', [selected])

  const selectedCourse = selectedCourseId ? courses.find(c => c.id === selectedCourseId) : undefined
  const currentCourse = selectedCourse ?? courses[0]

  // Filter by selectedCourseId when set
  const byCourse = <T extends { courseId?: string }>(items: T[]) =>
    selectedCourseId ? items.filter(i => i.courseId === selectedCourseId) : items

  // Apply text search filter (matches title or content) across notes/captures
  const matchesSearch = (text: string) =>
    searchQuery.trim().length === 0 ||
    text.toLowerCase().includes(searchQuery.trim().toLowerCase())

  const visibleNotes = byCourse(notes).filter(n =>
    matchesSearch(`${n.title} ${n.content}`)
  )
  const visibleCaptures = byCourse(captures).filter(c => matchesSearch(c.text))
  const visibleAssignments = byCourse(assignments)
  const visibleDeadlines = byCourse(deadlines)
  const visibleStudyItems = byCourse(studyItems)
  const visibleConfusions = byCourse(confusions)
  const visibleClassSessions = byCourse(classSessions)
  const visibleAlerts = byCourse(alerts)

  const syllabusNotes = visibleNotes.filter(note => note.documentType === 'syllabus')
  const assignmentNotes = visibleNotes.filter(note => note.documentType === 'assignment_prompt')
  const classNotes = visibleNotes.filter(note => note.documentType === 'class_notes' || note.documentType === 'note')

  const orderedVisibleDeadlines = [...visibleDeadlines]
    .filter(d => !d.completed)
    .sort((a, b) => a.deadlineAt - b.deadlineAt)

  const selectedLinkedAssignment = selected?.linkedAssignmentId
    ? assignments.find(a => a.id === selected.linkedAssignmentId)
    : undefined

  const activeAssignment = selectedAssignmentId
    ? assignments.find(a => a.id === selectedAssignmentId)
    : (selectedLinkedAssignment ?? visibleAssignments.find(a => a.status !== 'archived' && a.status !== 'submitted'))

  const activeAssignmentChecklistItems: ChecklistItem[] = activeAssignment
    ? [
        ...activeAssignment.deliverables,
        ...activeAssignment.formatRequirements,
        ...activeAssignment.rubricItems,
        ...activeAssignment.submissionChecklist,
      ]
    : []
  const checklistTotal = activeAssignmentChecklistItems.length
  const checklistDone = activeAssignmentChecklistItems.filter(i => i.completed).length
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0

  const now = Date.now()
  const dueStudyItems = visibleStudyItems.filter(i => !i.nextReviewAt || i.nextReviewAt <= now)
  const unresolvedConfusions = visibleConfusions.filter(c => c.status !== 'resolved')
  const activeAlerts = visibleAlerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed')

  async function handleCreate(type: Note['documentType'] = 'note') {
    const note = await ipc.invoke<Note>('notes:create', { title: type === 'note' ? 'Untitled note' : `New ${type.replace('_', ' ')}`, content: '' })
    const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType: type, tags: [] } })
    setNotes(prev => [updated, ...prev])
    setSelected(updated)
  }

  // Used by the FileDropZone — creates a note from extracted file text and links it to a course.
  async function handleCreateFromFile(input: { title: string; content: string; courseId?: string; documentType?: Note['documentType'] }): Promise<string> {
    const note = await ipc.invoke<Note>('notes:create', { title: input.title || 'Imported file', content: tipTapDocument(input.content) })
    const updated = await ipc.invoke<Note>('notes:update', {
      id: note.id,
      patch: {
        documentType: input.documentType ?? 'reading',
        courseId: input.courseId,
        tags: [],
      },
    })
    setNotes(prev => [updated, ...prev])
    setSelected(updated)
    setStatus(`Imported "${updated.title}".`)
    setTimeout(() => setStatus(''), 3000)
    return updated.id
  }

  function openQuickAdd(kind: QuickAddKind) {
    setQuickAdd(kind)
    setQuickAddForm(defaultQuickAddForm(kind, selectedText))
  }

  async function submitQuickAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!quickAdd) return
    const title = quickAddForm.title.trim()
    const detail = quickAddForm.detail.trim()
    const fallbackTitle = quickAdd === 'course' ? 'New course' : quickAdd === 'question' ? 'New question' : 'Untitled'
    switch (quickAdd) {
      case 'course':
        await ipc.invoke<Course>('course:create', { name: title || fallbackTitle, code: quickAddForm.code.trim() || undefined })
        setStatus('Course added.')
        break
      case 'deadline':
        await ipc.invoke<AcademicDeadline>('deadline:create', {
          title: title || fallbackTitle,
          deadlineAt: quickAddForm.due ? new Date(quickAddForm.due).getTime() : Date.now() + 24 * 60 * 60_000,
          courseId: currentCourse?.id,
          type: 'assignment',
          sourceType: 'manual',
        })
        setStatus('Deadline added.')
        break
      case 'study':
        await ipc.invoke<StudyItem>('study:create', { front: title || firstUsefulLine(selectedText), back: detail || undefined, type: 'flashcard', courseId: currentCourse?.id })
        setStatus('Flashcard added.')
        break
      case 'question':
        await ipc.invoke<ConfusionItem>('confusion:create', { question: title || fallbackTitle, context: detail || undefined, courseId: currentCourse?.id })
        setStatus('Question added.')
        break
      case 'syllabus':
      case 'assignment':
      case 'note': {
        const documentType: Note['documentType'] = quickAdd === 'syllabus' ? 'syllabus' : quickAdd === 'assignment' ? 'assignment_prompt' : 'note'
        const note = await ipc.invoke<Note>('notes:create', { title: title || fallbackTitle, content: tipTapDocument(detail) })
        const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType, courseId: currentCourse?.id, tags: [] } })
        setSelected(updated)
        setStatus(`${quickAdd === 'assignment' ? 'Assignment prompt' : quickAdd === 'syllabus' ? 'Syllabus note' : 'Note'} added.`)
        break
      }
    }
    setQuickAdd(null)
    await refresh()
  }

  async function handleUpdate(id: string, patch: Partial<Note>) {
    const updated = await ipc.invoke<Note>('notes:update', { id, patch })
    setNotes(prev => prev.map(n => n.id === id ? updated : n))
    setSelected(updated)
  }

  async function handleDelete(id: string) {
    await ipc.invoke('notes:delete', { id })
    const remaining = notes.filter(n => n.id !== id)
    setNotes(remaining)
    setSelected(remaining[0] ?? null)
  }

  function handleToolSave(message: string) {
    return () => { setStatus(message); refresh() }
  }

  async function startClass() {
    const title = selectedCourse ? `${selectedCourse.code ?? selectedCourse.name} class session` : 'Class session'
    await ipc.invoke('class:start', { courseId: selected?.courseId, title })
    setStatus('Class mode started. Capture notes and questions as you work.')
    await refresh()
  }

  async function completeDeadline(id: string) {
    await ipc.invoke('deadline:complete', { id })
    setStatus('Deadline marked complete.')
    await refresh()
  }

  async function reviewStudyItem(id: string, difficulty: NonNullable<StudyItem['difficulty']>) {
    await ipc.invoke('study:review', { id, difficulty })
    setStatus(`Study item reviewed: ${difficulty}.`)
    await refresh()
  }

  async function resolveConfusion(id: string) {
    await ipc.invoke('confusion:resolve', { id })
    setStatus('Question marked resolved.')
    await refresh()
  }

  async function resolveAlert(id: string) {
    await ipc.invoke('attentionAlerts:resolve', { id })
    setStatus('Alert resolved.')
    await refresh()
  }

  async function endClassSession(id: string) {
    await ipc.invoke('class:end', { id })
    setStatus('Class session ended.')
    await refresh()
  }

  const tools: Array<{ id: WorkspaceTool; label: string; icon: React.ReactNode }> = [
    { id: 'today', label: 'Today', icon: <PanelTop size={14} /> },
    { id: 'daily', label: 'Daily', icon: <CalendarDays size={14} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
    { id: 'quiz', label: 'Quiz', icon: <HelpCircle size={14} /> },
    { id: 'flashcards', label: 'Flashcards', icon: <ClipboardList size={14} /> },
    { id: 'assignment', label: 'Assignment Parser', icon: <Sparkles size={14} /> },
    { id: 'syllabus', label: 'Syllabus Import', icon: <FileText size={14} /> },
    { id: 'class', label: 'Class Mode', icon: <GraduationCap size={14} /> },
    { id: 'map', label: 'Map', icon: <Network size={14} /> },
  ]

  // ── SurfSense-style three-column shell render ─────────────────────────────
  const exportDeadlines = async () => {
    const result = await ipc.invoke<{ written: boolean; path: string; count: number } | null>(
      'calendar:exportDeadlines',
      { courseId: selectedCourseId ?? undefined }
    )
    if (result) {
      setStatus(`Exported ${result.count} deadline${result.count === 1 ? '' : 's'} to ${result.path.split('/').pop()}`)
      setTimeout(() => setStatus(''), 4000)
    }
  }

  const sourcesContent = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Upcoming Deadlines</span>
          <div className="flex items-center gap-2">
            {orderedVisibleDeadlines.length > 0 && (
              <button
                onClick={exportDeadlines}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold text-white/55 hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
                title="Export to .ics calendar file"
              >
                <CalendarDays size={9} />Export
              </button>
            )}
            <span className="text-[10px] text-white/40">{orderedVisibleDeadlines.length}</span>
          </div>
        </div>
        {orderedVisibleDeadlines.length > 0 ? (
          <div className="space-y-1.5">
            {orderedVisibleDeadlines.slice(0, 6).map(d => {
              const daysLeft = Math.max(0, Math.ceil((d.deadlineAt - Date.now()) / 86_400_000))
              const sourceNote = d.sourceId ? notes.find(n => n.id === d.sourceId) : undefined
              return (
                <button
                  key={d.id}
                  onClick={sourceNote ? () => setSelected(sourceNote) : undefined}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-lg border transition-colors group',
                    daysLeft === 0
                      ? 'bg-red-500/10 border-red-500/25 hover:bg-red-500/15'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <CalendarDays size={11} className={daysLeft === 0 ? 'text-red-300' : 'text-white/55'} />
                    <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-white/90">{d.title}</span>
                    <span className={cn(
                      'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                      daysLeft === 0 ? 'bg-red-500/20 text-red-200' : 'bg-white/[0.06] text-white/60'
                    )}>{daysLeft === 0 ? 'TODAY' : `${daysLeft}d`}</span>
                  </div>
                  <div className="text-[10.5px] text-white/45">{formatDue(d.deadlineAt)}</div>
                  {sourceNote && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/45 group-hover:text-blue-300">
                      <FileText size={9} /> {sourceNote.title.slice(0, 28)}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-[11px] text-white/35 italic px-2 py-3">No deadlines yet</div>
        )}
      </div>

      {activeAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Local Alerts</span>
            <span className="text-[10px] text-white/40">{activeAlerts.length}</span>
          </div>
          <div className="space-y-1.5">
            {activeAlerts.slice(0, 4).map(alert => (
              <div key={alert.id} className="px-2.5 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <Target size={11} className="text-amber-300 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-white/90 truncate">{alert.title}</div>
                    <div className="text-[10.5px] text-white/55 mt-0.5">{alert.reason}</div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                      >Resolve</button>
                      <button
                        onClick={() => ipc.invoke('attentionAlerts:dismiss', { id: alert.id }).then(refresh)}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors"
                      >Dismiss</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const materialsContent = (
    <div className="space-y-3">
      {selectedCourse ? (
        <>
          <MaterialsFolderRow
            course={selectedCourse}
            onPick={async () => {
              const updated = await ipc.invoke<Course | null>('course:pickMaterialsFolder', { courseId: selectedCourse.id })
              if (updated) {
                setCourses(prev => prev.map(c => c.id === updated.id ? updated : c))
                setStatus(`Watching ${updated.materialsFolderPath} for new files.`)
                setTimeout(() => setStatus(''), 3500)
              }
            }}
            onClear={async () => {
              const updated = await ipc.invoke<Course>('course:clearMaterialsFolder', { courseId: selectedCourse.id })
              setCourses(prev => prev.map(c => c.id === updated.id ? updated : c))
            }}
          />
          {(selectedCourse.materialsImportedFiles ?? []).filter(r => r.noteId).length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">Imported files</div>
              <div className="space-y-1">
                {(selectedCourse.materialsImportedFiles ?? []).filter(r => r.noteId).slice(0, 20).map(r => {
                  const note = notes.find(n => n.id === r.noteId)
                  const fname = r.path.split('/').pop()
                  return (
                    <button
                      key={r.path}
                      onClick={note ? () => setSelected(note) : undefined}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] text-left transition-colors"
                    >
                      <FileText size={11} className="text-white/45 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-[11.5px] text-white/80">{fname}</span>
                      <span className="text-[9px] text-white/35 shrink-0">{new Date(r.importedAt).toLocaleDateString()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-white/40 italic px-2 py-3">
          Pick a course in the rail to manage its materials folder.
        </div>
      )}
    </div>
  )

  const studyContent = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Study Queue</span>
          <span className="text-[10px] text-white/40">{dueStudyItems.length}</span>
        </div>
        {dueStudyItems.length > 0 ? (
          <div className="space-y-1.5">
            {dueStudyItems.slice(0, 6).map(item => (
              <div key={item.id} className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[12px] font-semibold text-white/90 truncate">{item.front}</div>
                <div className="text-[10px] text-white/45 mt-0.5 capitalize">{item.type}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-white/35 italic px-2 py-3">No items due</div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Unresolved Questions</span>
          <span className="text-[10px] text-white/40">{unresolvedConfusions.length}</span>
        </div>
        {unresolvedConfusions.length > 0 ? (
          <div className="space-y-1">
            {unresolvedConfusions.slice(0, 5).map(q => (
              <div key={q.id} className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[11.5px] text-white/85 leading-snug">{q.question}</div>
                {q.nextStep && (
                  <div className="text-[10px] text-blue-300 mt-1 capitalize">→ {q.nextStep.replace(/_/g, ' ')}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-white/35 italic px-2 py-3">No unresolved questions</div>
        )}
      </div>
    </div>
  )

  return (
    <ShellContainer>
      {/* IconRail — narrow course avatars column (SurfSense IconRail) */}
      <IconRail
        courses={courses}
        activeCourseId={selectedCourseId}
        onSelectCourse={(id) => {
          setSelectedCourseId(id)
          if (id) {
            const firstNote = notes.find(n => n.courseId === id)
            if (firstNote) setSelected(firstNote)
          }
        }}
        onAddCourse={() => openQuickAdd('course')}
      />

      {/* Left Sidebar — sources/notes (SurfSense Sidebar) */}
      <LeftSidebar
        searchSpaceLabel={currentCourse ? (currentCourse.code ?? currentCourse.name) : 'All Courses'}
        onCollapse={() => {/* future: hide left sidebar */}}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      >
        <ShellSidebarSection title="Syllabus Imports" icon={FileText} count={syllabusNotes.length} onAdd={() => openQuickAdd('syllabus')}>
          {syllabusNotes.length > 0 ? syllabusNotes.map(note => {
            const importedCount = deadlines.filter(d => d.sourceId === note.id).length
              + assignments.filter(a => a.sourceId === note.id).length
            return (
              <SidebarRow
                key={note.id}
                title={note.title}
                meta={new Date(note.updatedAt).toLocaleDateString()}
                icon={<FileText size={13} />}
                badge={importedCount > 0 ? { label: `${importedCount} imported`, tone: 'imported' } : undefined}
                active={selected?.id === note.id}
                onClick={() => setSelected(note)}
              />
            )
          }) : <div className="px-2 py-2 text-[10.5px] text-white/35 italic">No syllabus imports</div>}
        </ShellSidebarSection>

        <ShellSidebarSection title="Assignment Prompts" icon={ClipboardList} count={assignmentNotes.length} onAdd={() => openQuickAdd('assignment')}>
          {assignmentNotes.length > 0 ? assignmentNotes.map(note => {
            const linked = assignments.find(a => a.sourceId === note.id || a.id === note.linkedAssignmentId)
            return (
              <SidebarRow
                key={note.id}
                title={note.title || 'Untitled'}
                meta={new Date(note.updatedAt).toLocaleDateString()}
                icon={<ClipboardList size={13} />}
                badge={linked ? { label: 'parsed', tone: 'parsed' } : undefined}
                active={selected?.id === note.id}
                onClick={() => setSelected(note)}
              />
            )
          }) : <div className="px-2 py-2 text-[10.5px] text-white/35 italic">No assignment prompts</div>}
        </ShellSidebarSection>

        <ShellSidebarSection title="Notes" icon={FileText} count={classNotes.length} onAdd={() => openQuickAdd('note')}>
          {classNotes.length > 0 ? classNotes.map(note => {
            const cardCount = studyItems.filter(s => s.sourceNoteId === note.id).length
            return (
              <SidebarRow
                key={note.id}
                title={note.title || 'Untitled'}
                meta={new Date(note.updatedAt).toLocaleDateString()}
                icon={<FileText size={13} />}
                badge={cardCount > 0 ? { label: `${cardCount} card${cardCount === 1 ? '' : 's'}`, tone: 'parsed' } : undefined}
                active={selected?.id === note.id}
                onClick={() => setSelected(note)}
              />
            )
          }) : <div className="px-2 py-2 text-[10.5px] text-white/35 italic">No notes</div>}
        </ShellSidebarSection>

        <ShellSidebarSection title="Captures" icon={Image} count={visibleCaptures.length} defaultOpen={false}>
          {visibleCaptures.length > 0 ? visibleCaptures.slice(0, 30).map(cap => (
            <SidebarRow
              key={cap.id}
              title={cap.text.slice(0, 40)}
              meta={new Date(cap.createdAt).toLocaleDateString()}
              icon={<Image size={13} />}
            />
          )) : <div className="px-2 py-2 text-[10.5px] text-white/35 italic">No captures</div>}
        </ShellSidebarSection>
      </LeftSidebar>

      {/* Main Panel — tabs + WorkspaceSurface (SurfSense MainContentPanel) */}
      <MainPanel
        tabs={tools}
        activeTabId={activeTool}
        onTabSelect={(id) => setActiveTool(id as WorkspaceTool)}
        rightActions={
          <>
            <button className="w-8 h-8 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors relative" title="Notifications">
              <Bell size={14} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
            </button>
            <button className="w-8 h-8 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors" title="Settings">
              <Settings size={14} />
            </button>
            {!rightPanelOpen && (
              <button
                onClick={() => setRightPanelOpen(true)}
                className="ml-1 px-2.5 h-8 rounded-md flex items-center gap-1.5 text-[11.5px] font-semibold text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
              >
                <PanelTop size={12} className="rotate-90" /> Sources
              </button>
            )}
          </>
        }
      >
        <WorkspaceSurface
          activeTool={activeTool}
          selected={selected}
          selectedText={selectedText}
          captures={visibleCaptures}
          notes={notes}
          courses={courses}
          deadlines={orderedVisibleDeadlines}
          assignments={visibleAssignments}
          studyItems={visibleStudyItems}
          confusions={unresolvedConfusions}
          alerts={activeAlerts}
          classSessions={visibleClassSessions}
          currentCourse={currentCourse}
          linkedAssignment={selectedLinkedAssignment}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onCreateFromFile={handleCreateFromFile}
          onAssignmentSave={handleToolSave('Assignment checklist saved.')}
          onSyllabusConfirm={handleToolSave('Syllabus deadlines imported.')}
          onFlashcardSave={handleToolSave('Flashcards saved to study queue.')}
          onQuizSave={(note: Note) => { setSelected(note); setStatus('Quiz draft created.'); refresh() }}
          onStartClass={startClass}
          onCompleteDeadline={completeDeadline}
          onReviewStudyItem={reviewStudyItem}
          onResolveConfusion={resolveConfusion}
          onResolveAlert={resolveAlert}
          onEndClassSession={endClassSession}
          onRefresh={refresh}
          onStatus={setStatus}
          onSelect={setSelected}
        />
      </MainPanel>

      {/* Right Panel — Documents tabs (SurfSense RightPanel) */}
      {rightPanelOpen ? (
        <RightPanel
          open={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeTab={rightTab}
          onTabChange={setRightTab}
          sourcesSlot={sourcesContent}
          materialsSlot={materialsContent}
          studySlot={studyContent}
        />
      ) : (
        <RightPanelCollapsedButton
          onClick={() => setRightPanelOpen(true)}
          badge={orderedVisibleDeadlines.filter(d => Math.ceil((d.deadlineAt - Date.now()) / 86_400_000) <= 1).length}
        />
      )}

      {/* Status banner overlay */}
      {status && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 backdrop-blur-md flex items-center gap-3 text-[12px] text-blue-100 shadow-lg">
          {status}
          <button
            onClick={() => setStatus('')}
            className="text-blue-200/70 hover:text-blue-100 font-bold"
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      {/* QuickAdd overlay (form sheet for adding course/note/etc.) */}
      {quickAdd && (
        <QuickAddSheet
          kind={quickAdd}
          form={quickAddForm}
          onChange={setQuickAddForm}
          onClose={() => setQuickAdd(null)}
          onSubmit={submitQuickAdd}
        />
      )}
    </ShellContainer>
  )
}

function WorkspaceSurface({
  activeTool,
  selected,
  selectedText,
  captures,
  notes,
  courses,
  deadlines,
  assignments,
  studyItems,
  confusions,
  alerts,
  classSessions,
  currentCourse,
  linkedAssignment,
  onUpdate,
  onDelete,
  onCreate,
  onCreateFromFile,
  onAssignmentSave,
  onSyllabusConfirm,
  onFlashcardSave,
  onQuizSave,
  onStartClass,
  onCompleteDeadline,
  onReviewStudyItem,
  onResolveConfusion,
  onResolveAlert,
  onEndClassSession,
  onRefresh,
  onStatus,
  onSelect,
}: {
  activeTool: WorkspaceTool
  selected: Note | null
  selectedText: string
  captures: Capture[]
  notes: Note[]
  courses: Course[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  studyItems: StudyItem[]
  confusions: ConfusionItem[]
  alerts: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>[]
  classSessions: ClassSession[]
  currentCourse?: Course
  linkedAssignment?: Assignment
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (type?: Note['documentType']) => Promise<void>
  onCreateFromFile: (input: { title: string; content: string; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
  onAssignmentSave: () => void
  onSyllabusConfirm: () => void
  onFlashcardSave: () => void
  onQuizSave: (note: Note) => void
  onStartClass: () => Promise<void>
  onCompleteDeadline: (id: string) => Promise<void>
  onReviewStudyItem: (id: string, difficulty: NonNullable<StudyItem['difficulty']>) => Promise<void>
  onResolveConfusion: (id: string) => Promise<void>
  onResolveAlert: (id: string) => Promise<void>
  onEndClassSession: (id: string) => Promise<void>
  onRefresh: () => void
  onStatus: (msg: string) => void
  onSelect: (note: Note) => void
}) {
  switch (activeTool) {
    case 'dashboard':
      return <DashboardView courses={courses} deadlines={deadlines} studyItems={studyItems} alerts={alerts} onCompleteDeadline={onCompleteDeadline} onResolveAlert={onResolveAlert} />
    case 'daily':
      return <DailyJournalView notes={notes} currentCourse={currentCourse} onUpdate={onUpdate} onRefresh={onRefresh} onSelect={onSelect} />
    case 'quiz':
      return <QuizView selected={selected} selectedText={selectedText} courseId={currentCourse?.id} studyItems={studyItems} onSave={onQuizSave} />
    case 'flashcards':
      return <FlashcardsView selectedText={selectedText} studyItems={studyItems} courseId={currentCourse?.id} onReviewStudyItem={onReviewStudyItem} onSave={onFlashcardSave} onStatus={onStatus} />
    case 'assignment':
      return <AssignmentParserView selected={selected} selectedText={selectedText} courseId={currentCourse?.id} deadlines={deadlines} onSave={onAssignmentSave} />
    case 'syllabus':
      return <SyllabusImportView selected={selected} selectedText={selectedText} courseId={currentCourse?.id} onCreate={onCreate} onConfirm={onSyllabusConfirm} onRefresh={onRefresh} onStatus={onStatus} />
    case 'class':
      return <ClassModeView currentCourse={currentCourse} captures={captures} confusions={confusions} classSessions={classSessions} onStartClass={onStartClass} onResolveConfusion={onResolveConfusion} onEndClassSession={onEndClassSession} onRefresh={onRefresh} />
    case 'map':
      return <RelationMapView notes={notes} courses={courses} deadlines={deadlines} assignments={assignments} studyItems={studyItems} captures={captures} courseId={currentCourse?.id} onSelectNote={onSelect} />
    case 'today':
    default:
      return <DocumentWorkspace selected={selected} selectedText={selectedText} captures={captures} notes={notes} currentCourse={currentCourse} linkedAssignment={linkedAssignment} onUpdate={onUpdate} onDelete={onDelete} onCreate={onCreate} onCreateFromFile={onCreateFromFile} onRefresh={onRefresh} onSelect={onSelect} />
  }
}

function DocumentWorkspace({
  selected,
  selectedText,
  captures,
  notes,
  currentCourse,
  linkedAssignment,
  onUpdate,
  onDelete,
  onCreate,
  onCreateFromFile,
  onRefresh,
  onSelect,
}: {
  selected: Note | null
  selectedText: string
  captures: Capture[]
  notes: Note[]
  currentCourse?: Course
  linkedAssignment?: Assignment
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (type?: Note['documentType']) => Promise<void>
  onCreateFromFile: (input: { title: string; content: string; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
  onRefresh: () => void
  onSelect: (n: Note) => void
}) {
  const [questionStatus, setQuestionStatus] = useState('')

  // Reverse-link discovery: scan all notes' content (TipTap JSON serialized
  // as a string) for occurrences of the current note's id inside a noteLink
  // mark. Cheap because we already have all notes in memory and the content
  // is just a string. ~O(n) per render, acceptable for hundreds of notes.
  const backlinks = useMemo(() => {
    if (!selected) return []
    const targetId = selected.id
    return notes.filter(n => {
      if (n.id === targetId) return false
      // The TipTap JSON string contains `"noteId":"<id>"` for each link
      return typeof n.content === 'string' && n.content.includes(`"noteId":"${targetId}"`)
    })
  }, [notes, selected])

  async function createQuestionFromDoc() {
    if (!selected || !selectedText) return
    const text = selectedText.trim().slice(0, 200)
    const question = text.includes('?') ? text : `What should I understand about: ${text.split(/[.\n]/)[0]?.slice(0, 100) || text.slice(0, 100)}?`
    if (!question.trim()) return
    await ipc.invoke('confusion:create', { question, context: `From note: ${selected.title}`, courseId: selected.courseId ?? currentCourse?.id })
    setQuestionStatus('Question created.')
    onRefresh()
    setTimeout(() => setQuestionStatus(''), 2000)
  }

  return (
    <section className="studydesk-document-card">
      <header className="document-card-header">
        <div>
          <button className="ghost-icon"><ChevronRight size={16} /></button>
          <span>{selected?.documentType?.replace('_', ' ') ?? 'Document'}</span>
        </div>
        <div className="document-actions">
          {selected && <span>Saved {new Date(selected.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          <button className="icon-pill compact"><MoreHorizontal size={16} /></button>
        </div>
      </header>
      {selected ? (
        <>
          <div className="document-context-row">
            {currentCourse && <><span>{currentCourse.code ?? currentCourse.name}</span><Circle size={4} fill="currentColor" /></>}
            <span>{selected.documentType?.replace('_', ' ') ?? 'note'}</span>
            {linkedAssignment?.dueDate && <><Circle size={4} fill="currentColor" /><span>Due {formatDue(linkedAssignment.dueDate)}</span></>}
            {selectedText && <button onClick={createQuestionFromDoc}>Create question</button>}
            <button onClick={() => onDelete(selected.id)}>Delete</button>
            {questionStatus && <em>{questionStatus}</em>}
          </div>
          <Editor
            key={selected.id}
            note={selected}
            captures={captures}
            onUpdate={(patch) => onUpdate(selected.id, patch)}
          />
          {backlinks.length > 0 && (
            <section className="document-backlinks" aria-label="Linked from these notes">
              <header><span>Linked from</span><em>{backlinks.length}</em></header>
              <ul>
                {backlinks.slice(0, 8).map(n => (
                  <li key={n.id}>
                    <button onClick={() => onSelect(n)} className="document-backlink-item">
                      <span className="dot" aria-hidden="true">•</span>
                      <strong>{n.title || 'Untitled'}</strong>
                      <em>{(n.documentType ?? 'note').replace('_', ' ')}</em>
                    </button>
                  </li>
                ))}
                {backlinks.length > 8 && (
                  <li className="document-backlink-more">+{backlinks.length - 8} more</li>
                )}
              </ul>
            </section>
          )}
          <footer className="document-footer">
            <span>Last saved {new Date(selected.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </footer>
        </>
      ) : (
        <div className="notes-empty">
          <p>No document selected</p>
          <FileDropZone
            courseId={currentCourse?.id}
            documentType="reading"
            onCreate={onCreateFromFile}
            onCreated={() => onRefresh()}
          />
          <div className="notes-empty-actions">
            <button className="notes-create-btn" onClick={() => onCreate('assignment_prompt')}>Create assignment prompt</button>
            <button className="notes-create-btn ghost" onClick={() => onCreate('note')}>New blank note</button>
          </div>
        </div>
      )}
    </section>
  )
}

function AssignmentParserView({ selected, selectedText, courseId, deadlines, onSave }: { selected: Note | null; selectedText: string; courseId?: string; deadlines: AcademicDeadline[]; onSave: () => void }) {
  const [review, setReview] = useState<AssignmentParseReview | null>(null)
  const [parsing, setParsing] = useState(false)

  async function handleParse() {
    if (!selectedText) return
    setParsing(true)
    try {
      const result = await ipc.invoke<AssignmentParseReview>('assignment:parse', { text: selectedText, courseId, title: selected?.title })
      setReview(result)
    } finally { setParsing(false) }
  }

  async function handleSave() {
    if (!review || !selected) return
    const title = review.title.trim() || selected.title || 'Untitled assignment'
    const patch = {
      title,
      courseId,
      dueDate: review.dueDate,
      sourceType: 'assignment_prompt' as const,
      sourceId: selected.id,
      deliverables: review.deliverables,
      formatRequirements: review.formatRequirements,
      rubricItems: review.rubricItems,
      submissionChecklist: review.submissionChecklist,
    }
    let assignmentId: string
    if (selected.linkedAssignmentId) {
      // Update existing linked assignment
      const updated = await ipc.invoke<Assignment>('assignment:update', { id: selected.linkedAssignmentId, patch })
      assignmentId = updated.id
    } else {
      // Create new assignment
      const created = await ipc.invoke<Assignment>('assignment:create', patch)
      assignmentId = created.id
      // Link note to assignment
      await ipc.invoke('notes:update', { id: selected.id, patch: { documentType: 'assignment_prompt', linkedAssignmentId: assignmentId, courseId } })
    }
    // Create or update academic deadline from due date
    if (review.dueDate) {
      const existing = deadlines.find(d => d.assignmentId === assignmentId || (d.sourceId === selected.id && d.sourceType === 'assignment_prompt'))
      if (existing) {
        await ipc.invoke('deadline:update', { id: existing.id, patch: { title: review.title, deadlineAt: review.dueDate, courseId } })
      } else {
        await ipc.invoke('deadline:create', { title: review.title, deadlineAt: review.dueDate, courseId, assignmentId, type: 'assignment', sourceType: 'assignment_prompt', sourceId: selected.id, confirmed: true })
      }
    }
    setReview(null)
    onSave()
  }

  return (
    <section className="parser-card">
      <header className="parser-header">
        <div className="parser-tab"><FileText size={15} /> {selected?.title || 'Untitled'}</div>
        {!review
          ? <button className="review-button" onClick={handleParse} disabled={!selectedText || parsing}><Sparkles size={15} /> {parsing ? 'Parsing...' : 'Parse assignment'}</button>
          : <button className="review-button" onClick={handleSave}><Sparkles size={15} /> Save assignment</button>
        }
      </header>
      {!selectedText && !review && (
        <EmptyHint message="No document selected" hint="Select a document with assignment text to parse." />
      )}
      {selectedText && !review && (
        <div className="parser-grid">
          <article className="parser-source">
            <p className="eyebrow">Source: <strong>{selected?.title}</strong></p>
            <p>{selectedText.slice(0, 300)}{selectedText.length > 300 ? '...' : ''}</p>
          </article>
          <article className="parser-details">
            <p className="empty-hint">Click "Parse assignment" to extract details for review.</p>
          </article>
        </div>
      )}
      {review && (
        <div className="parser-grid">
          <article className="parser-source">
            <label><span>Title</span><input value={review.title} onChange={e => setReview({ ...review, title: e.target.value })} /></label>
            <label><span>Due date</span><input type="datetime-local" value={review.dueDate ? new Date(review.dueDate).toISOString().slice(0, 16) : ''} onChange={e => setReview({ ...review, dueDate: e.target.value ? new Date(e.target.value).getTime() : undefined })} /></label>
          </article>
          <article className="parser-details">
            <h2><Sparkles size={17} /> Extracted details</h2>
            <ReviewChecklistSection title="Deliverables" items={review.deliverables} />
            <ReviewChecklistSection title="Format requirements" items={review.formatRequirements} />
            <ReviewChecklistSection title="Rubric items" items={review.rubricItems} />
            <ReviewChecklistSection title="Submission checklist" items={review.submissionChecklist} />
          </article>
        </div>
      )}
    </section>
  )
}

function ReviewChecklistSection({ title, items }: { title: string; items: ChecklistItem[] }) {
  if (items.length === 0) return <div className="review-section"><strong>{title}</strong><em>Not found</em></div>
  return (
    <div className="review-section">
      <strong>{title}</strong>
      {items.map(item => <div key={item.id} className="check-row"><span>{'○'}</span><span>{item.text}</span></div>)}
    </div>
  )
}

function DashboardView({
  courses,
  deadlines,
  studyItems,
  alerts,
  onCompleteDeadline,
  onResolveAlert,
}: {
  courses: Course[]
  deadlines: AcademicDeadline[]
  studyItems: StudyItem[]
  alerts: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>[]
  onCompleteDeadline: (id: string) => Promise<void>
  onResolveAlert: (id: string) => Promise<void>
}) {
  const dueSoon = deadlines.filter(deadline => !deadline.completed).slice(0, 3)
  return (
    <section className="phase3-card dashboard-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Academic dashboard</p>
          <h1>Today’s operating picture</h1>
          <span>Courses, deadlines, study queue, and local alerts stay in one glass workspace.</span>
        </div>
        <button className="share-button"><BarChart3 size={15} /> Review day</button>
      </header>
      <div className="metric-grid">
        <MetricCard label="Courses" value={courses.length} detail="Active this term" icon={<BookOpen size={20} />} />
        <MetricCard label="Deadlines" value={deadlines.length} detail="Tracked locally" icon={<CalendarDays size={20} />} />
        <MetricCard label="Study items" value={studyItems.length} detail="Ready to review" icon={<ClipboardList size={20} />} />
        <MetricCard label="Alerts" value={alerts.length} detail="Need attention" icon={<Bell size={20} />} />
      </div>
      <div className="dashboard-grid">
        <section className="phase3-panel wide">
          <h2>Deadline timeline</h2>
          {dueSoon.map((deadline, index) => (
            <div className="timeline-row" key={deadline.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{deadline.title}</strong>
                <em>{formatDue(deadline.deadlineAt)}</em>
              </div>
              <button className="inline-action" onClick={() => onCompleteDeadline(deadline.id)}>{index === 0 ? 'Complete' : 'Done'}</button>
            </div>
          ))}
        </section>
        <section className="phase3-panel">
          <h2>Attention queue</h2>
          {alerts.slice(0, 2).map(alert => (
            <div className="compact-row action-row" key={alert.id}>
              <Bell size={18} />
              <div><strong>{alert.title}</strong><em>{alert.priority} priority</em></div>
              <button onClick={() => onResolveAlert(alert.id)}>Resolve</button>
            </div>
          ))}
          <h2 className="section-spacer">Course load</h2>
          {courses.slice(0, 4).map(course => (
            <div className="compact-row" key={course.id}>
              <span className="section-icon course-token">{course.code?.slice(0, 2) ?? 'CR'}</span>
              <div><strong>{course.code ?? course.name}</strong><em>{course.name}</em></div>
            </div>
          ))}
        </section>
      </div>
    </section>
  )
}

function QuizView({ selected, selectedText, courseId, studyItems, onSave }: { selected: Note | null; selectedText: string; courseId?: string; studyItems: StudyItem[]; onSave: (note: Note) => void }) {
  const [drafts, setDrafts] = useState<QuizQuestionDraft[]>([])
  const [savedNote, setSavedNote] = useState<Note | null>(null)

  function generate() {
    if (!selectedText) return
    const questions: QuizQuestionDraft[] = []
    const lines = selectedText.split(/\n+/).map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line.length < 10) continue
      // Headings or short standalone lines -> concept question
      if (line.length < 60 && !line.includes('.')) {
        questions.push({ question: `What should you remember about ${line}?` })
      // Definition patterns
      } else if (/\b(is|means|refers to|defined as)\b/i.test(line)) {
        const term = line.split(/\b(is|means|refers to|defined as)\b/i)[0].trim()
        if (term.length > 3 && term.length < 80) {
          questions.push({ question: `What does "${term}" mean?` })
        }
      // Longer meaningful sentences
      } else if (line.length > 40) {
        const shortened = line.slice(0, 80).replace(/[.,;:]+$/, '')
        questions.push({ question: `Why is this important: ${shortened}?` })
      }
      if (questions.length >= 8) break
    }
    setDrafts(questions)
  }

  function removeQuestion(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index))
  }

  function updateQuestion(index: number, value: string) {
    setDrafts(prev => prev.map((q, i) => i === index ? { question: value } : q))
  }

  async function handleSave() {
    if (drafts.length === 0) return
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Quiz draft' }] },
        ...drafts.map((q, i) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `${i + 1}. ${q.question}` }],
        })),
      ],
    })
    const note = await ipc.invoke<Note>('notes:create', { title: `Quiz: ${selected?.title || 'Study'}`, content })
    const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType: 'reading', courseId, tags: ['quiz'] } })
    setSavedNote(updated)
    onSave(updated)
  }

  async function saveAsStudyItems() {
    if (drafts.length === 0 && !savedNote) return
    const questions = drafts.length > 0 ? drafts : []
    // If already saved as note, re-derive questions from the saved note
    const items = questions.length > 0 ? questions : (savedNote ? extractQuestionsFromNote(savedNote) : [])
    for (const q of items) {
      if (!q.question.trim()) continue
      const isDuplicate = studyItems.some(s => s.front === q.question.trim())
      if (isDuplicate) continue
      await ipc.invoke('study:create', { front: q.question.trim(), type: 'question', courseId })
    }
    setDrafts([])
    setSavedNote(null)
  }

  return (
    <section className="phase3-card quiz-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Quiz builder</p>
          <h1>{selected ? `Quiz from ${selected.title}` : 'Quiz builder'}</h1>
          <span>Generate questions from selected document text. Review and edit before saving.</span>
        </div>
        {drafts.length === 0 && !savedNote
          ? <button className="review-button" onClick={generate} disabled={!selectedText}><HelpCircle size={15} /> Generate questions</button>
          : drafts.length > 0
            ? <div className="phase3-actions"><button className="review-button" onClick={handleSave}><HelpCircle size={15} /> Save quiz draft</button><button className="outline-button" onClick={saveAsStudyItems}><ClipboardList size={15} /> Also save as study questions</button></div>
            : savedNote
              ? <button className="outline-button" onClick={saveAsStudyItems}><ClipboardList size={15} /> Also save as study questions</button>
              : null
        }
      </header>
      {!selectedText && drafts.length === 0 && !savedNote && (
        <EmptyHint message="No document selected" hint="Select a document to generate quiz questions from its content." />
      )}
      {selectedText && drafts.length === 0 && !savedNote && (
        <div className="phase3-panel">
          <p className="empty-hint">Click "Generate questions" to create quiz candidates from the selected document.</p>
        </div>
      )}
      {drafts.length > 0 && (
        <div className="quiz-grid">
          {drafts.map((draft, index) => (
            <article className="quiz-card" key={index}>
              <small>Question {index + 1} <button className="inline-action" onClick={() => removeQuestion(index)}>Remove</button></small>
              <input value={draft.question} onChange={e => updateQuestion(index, e.target.value)} className="quiz-edit-input" />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function FlashcardsView({ selectedText, studyItems, courseId, onReviewStudyItem, onSave, onStatus }: { selectedText: string; studyItems: StudyItem[]; courseId?: string; onReviewStudyItem: (id: string, difficulty: NonNullable<StudyItem['difficulty']>) => Promise<void>; onSave: () => void; onStatus: (msg: string) => void }) {
  const [drafts, setDrafts] = useState<FlashcardDraft[]>([])

  function generate() {
    if (!selectedText) return
    const cards: FlashcardDraft[] = []
    const lines = selectedText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 5)
    for (const line of lines) {
      // Lines containing ':' -> front/back
      if (line.includes(':')) {
        const [front, ...rest] = line.split(':')
        const back = rest.join(':').trim()
        if (front.trim().length > 3 && back.length > 3) {
          cards.push({ front: front.trim(), back, type: 'flashcard' })
          continue
        }
      }
      // Definition patterns
      const defMatch = line.match(/^(.+?)\b(is|means|refers to|defined as)\b(.+)/i)
      if (defMatch && defMatch[1].trim().length > 3 && defMatch[3].trim().length > 5) {
        cards.push({ front: defMatch[1].trim(), back: defMatch[3].trim(), type: 'definition' })
        continue
      }
      // Short standalone lines -> concept
      if (line.length < 60 && !line.includes('.')) {
        cards.push({ front: line, back: '', type: 'concept' })
      }
      if (cards.length >= 10) break
    }
    setDrafts(cards)
  }

  function removeDraft(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index))
  }

  function updateDraft(index: number, patch: Partial<FlashcardDraft>) {
    setDrafts(prev => prev.map((d, i) => i === index ? { ...d, ...patch } : d))
  }

  async function handleSave() {
    if (drafts.length === 0) return
    const validDrafts = drafts.filter(d => d.front.trim().length > 0)
    let saved = 0
    let skipped = 0
    for (const draft of validDrafts) {
      const isDuplicate = studyItems.some(item => item.front === draft.front.trim() && item.back === (draft.back?.trim() || undefined))
      if (isDuplicate) { skipped++; continue }
      await ipc.invoke('study:create', { front: draft.front.trim(), back: draft.back?.trim() || undefined, type: 'flashcard', courseId })
      saved++
    }
    setDrafts([])
    onStatus(skipped > 0 ? `${saved} saved, ${skipped} skipped (duplicates).` : `${saved} flashcards saved.`)
    onSave()
  }

  const cards = studyItems.slice(0, 6)
  return (
    <section className="phase3-card flashcards-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Flashcards</p>
          <h1>Generate and review</h1>
          <span>{selectedText ? 'Extract flashcard candidates from the selected document.' : 'Select a document to generate flashcards.'}</span>
        </div>
        <div className="flashcards-header-actions">
          {drafts.length === 0 && (
            <button
              className="review-button"
              onClick={async () => {
                const r = await ipc.invoke<{ notesProcessed: number; totalCreated: number; totalUpdated: number; totalDeleted: number }>('study:syncAllNotes', {})
                onStatus(`Sync: +${r.totalCreated} new, ${r.totalUpdated} updated, ${r.totalDeleted} removed across ${r.notesProcessed} note(s).`)
                onSave()
              }}
              title="Re-derive flashcards from all notes (heading-based, level 3)"
            >
              <Sparkles size={15} /> Sync from notes
            </button>
          )}
          {drafts.length === 0
            ? <button className="review-button" onClick={generate} disabled={!selectedText}><ClipboardList size={15} /> Generate from document</button>
            : <button className="review-button" onClick={handleSave}><ClipboardList size={15} /> Save flashcards ({drafts.length})</button>
          }
        </div>
      </header>
      {drafts.length > 0 && (
        <div className="flashcard-board">
          {drafts.map((draft, index) => (
            <article className="study-card" key={index}>
              <span>Draft {index + 1} <button className="inline-action" onClick={() => removeDraft(index)}>Remove</button></span>
              <input value={draft.front} onChange={e => updateDraft(index, { front: e.target.value })} placeholder="Front" className="quiz-edit-input" />
              <input value={draft.back} onChange={e => updateDraft(index, { back: e.target.value })} placeholder="Back" className="quiz-edit-input" />
              <small>{draft.type}</small>
            </article>
          ))}
        </div>
      )}
      {drafts.length === 0 && cards.length > 0 && (
        <>
          <h2 className="section-spacer">Study queue ({studyItems.length})</h2>
          <div className="flashcard-board">
            {cards.map((item, index) => (
              <article className="study-card" key={item.id}>
                <span>Card {index + 1}</span>
                <h2>{item.front}</h2>
                <p>{item.back || 'Answer will be added during review.'}</p>
                <footer><small>{item.type}</small><strong>{item.reviewCount} reviews</strong></footer>
                <div className="review-actions">
                  {(['again', 'hard', 'good', 'easy'] as const).map(difficulty => (
                    <button key={difficulty} onClick={() => onReviewStudyItem(item.id, difficulty)}>{difficulty}</button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {drafts.length === 0 && cards.length === 0 && !selectedText && (
        <EmptyHint message="No flashcards yet" hint="Select a document to generate flashcards, or create them manually." />
      )}
    </section>
  )
}

function SyllabusImportView({ selected, selectedText, courseId, onCreate, onConfirm, onRefresh, onStatus }: {
  selected: Note | null
  selectedText: string
  courseId?: string
  onCreate: (type?: Note['documentType']) => Promise<void>
  onConfirm: () => void
  onRefresh: () => void
  onStatus: (msg: string) => void
}) {
  const [review, setReview] = useState<SyllabusParseReview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [confirmResult, setConfirmResult] = useState<SyllabusConfirmResult | null>(null)
  const [rawPaste, setRawPaste] = useState('')

  /** Text to parse: raw paste takes priority over note content. */
  const parseText = rawPaste.trim() || selectedText

  // ── Parse ───────────────────────────────────────────────────────────
  async function handleParse() {
    if (!parseText) return
    setParsing(true)
    try {
      const r = await ipc.invoke<{
        course: SyllabusParseReview['course']
        classMeetings: SyllabusClassMeetingReview[]
        assignments: Array<{ title: string; dueDate?: number; weight?: string; type: string }>
        deadlines: Array<{ title: string; deadlineAt: number; type: string }>
        readings: Array<{ title: string; chapter?: string }>
        setupTasks: Array<{ title: string; category: string }>
        scheduleRows: unknown[]
      }>('syllabus:parse', { text: parseText, courseId })
      setReview({
        course: r.course,
        classMeetings: r.classMeetings ?? [],
        assignments: (r.assignments ?? []).map(a => ({ ...a, included: true })),
        deadlines: (r.deadlines ?? []).map(d => ({ title: d.title, deadlineAt: d.deadlineAt, type: d.type, included: true })),
        setupTasks: (r.setupTasks ?? []).map(t => ({ ...t, included: true })),
        readings: r.readings ?? [],
        scheduleRowCount: r.scheduleRows?.length ?? 0,
      })
      setConfirmResult(null)
    } finally { setParsing(false) }
  }

  // ── Confirm ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!review) return
    const payload = {
      courseId,
      course: !courseId ? review.course : undefined,
      syllabusNoteId: selected?.id,
      sourceText: !selected ? parseText : undefined,
      assignments: review.assignments.filter(a => a.included).map(a => ({
        title: a.title, dueDate: a.dueDate, confirmed: true,
      })),
      deadlines: review.deadlines.filter(d => d.included).map(d => ({
        title: d.title, deadlineAt: d.deadlineAt, type: d.type,
        confirmed: true, sourceType: 'syllabus', sourceId: selected?.id,
      })),
      setupTasks: review.setupTasks.filter(t => t.included).map(t => ({
        title: t.title, category: t.category, confirmed: true,
      })),
    }
    const result = await ipc.invoke<SyllabusConfirmResult>('syllabus:confirmImport', payload)
    if (selected) {
      await ipc.invoke('notes:update', { id: selected.id, patch: { documentType: 'syllabus', courseId: result?.courseId ?? courseId } })
    }
    setConfirmResult(result)
    const c = result.counts
    onStatus(`Import complete: ${c.assignments} assignment(s), ${c.deadlines} deadline(s), ${c.setupAlerts} setup task(s).`)
    onRefresh()
  }

  // ── Inline edit helpers ─────────────────────────────────────────────
  function updateCourse(field: keyof SyllabusParseReview['course'], value: string) {
    if (!review) return
    setReview({ ...review, course: { ...review.course, [field]: value } })
  }

  function toggleAssignment(i: number) {
    if (!review) return
    const next = [...review.assignments]
    next[i] = { ...next[i], included: !next[i].included }
    setReview({ ...review, assignments: next })
  }
  function editAssignment(i: number, field: keyof SyllabusAssignmentReview, value: string | number) {
    if (!review) return
    const next = [...review.assignments]
    next[i] = { ...next[i], [field]: value }
    setReview({ ...review, assignments: next })
  }

  function toggleDeadline(i: number) {
    if (!review) return
    const next = [...review.deadlines]
    next[i] = { ...next[i], included: !next[i].included }
    setReview({ ...review, deadlines: next })
  }
  function editDeadline(i: number, field: keyof SyllabusDeadlineReview, value: string | number) {
    if (!review) return
    const next = [...review.deadlines]
    next[i] = { ...next[i], [field]: value }
    setReview({ ...review, deadlines: next })
  }

  function toggleSetup(i: number) {
    if (!review) return
    const next = [...review.setupTasks]
    next[i] = { ...next[i], included: !next[i].included }
    setReview({ ...review, setupTasks: next })
  }
  function editSetup(i: number, field: keyof SyllabusSetupReview, value: string) {
    if (!review) return
    const next = [...review.setupTasks]
    next[i] = { ...next[i], [field]: value }
    setReview({ ...review, setupTasks: next })
  }

  function resetImport() { setReview(null); setConfirmResult(null) }

  // ── Post-import onboarding ──────────────────────────────────────────
  if (confirmResult) {
    const c = confirmResult.counts
    return (
      <section className="phase3-card syllabus-view">
        <header className="phase3-header">
          <div>
            <p className="phase3-eyebrow">Import complete</p>
            <h1>Syllabus imported successfully</h1>
          </div>
          <div className="phase3-actions">
            <button className="outline-button" onClick={resetImport}><Upload size={15} /> Import another</button>
          </div>
        </header>
        <div className="syllabus-grid">
          <section className="phase3-panel">
            <h2>Created records</h2>
            <div className="source-preview">
              <span>{c.assignments} assignment(s)</span>
              <span>{c.deadlines} deadline(s)</span>
              <span>{c.setupAlerts} setup task(s)</span>
            </div>
          </section>
          <section className="phase3-panel wide">
            <h2>Next steps: upload course materials</h2>
            <p className="empty-hint" style={{ marginBottom: 8 }}>
              The syllabus tells you what to study, but the materials contain the actual content.
              Upload each type to unlock flashcards, quizzes, and study tools.
            </p>
            <div className="syllabus-onboarding-list">
              <div className="timeline-row"><BookOpen size={14} /><div><strong>Readings and textbook chapters</strong><em>Upload PDFs or paste text for each assigned reading.</em></div></div>
              <div className="timeline-row"><FileText size={14} /><div><strong>Cases (HBP coursepack)</strong><em>Upload case PDFs to enable case analysis prep.</em></div></div>
              <div className="timeline-row"><ClipboardList size={14} /><div><strong>Assignment prompts</strong><em>Upload assignment briefs to extract deliverables and checklists.</em></div></div>
              <div className="timeline-row"><PanelTop size={14} /><div><strong>Lecture slides</strong><em>Upload slides to capture key concepts and exam hints.</em></div></div>
              <div className="timeline-row"><Target size={14} /><div><strong>Generate flashcards</strong><em>Available after uploading readings or slides.</em></div></div>
              <div className="timeline-row"><HelpCircle size={14} /><div><strong>Generate quizzes</strong><em>Available after uploading readings or slides.</em></div></div>
            </div>
          </section>
        </div>
      </section>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <section className="phase3-card syllabus-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Syllabus import</p>
          <h1>Extract course structure and deadlines</h1>
          <span>Parse syllabus text, review and edit, then confirm import.</span>
        </div>
        <div className="phase3-actions">
          <button className="outline-button" onClick={() => onCreate('syllabus')}><Upload size={15} /> New syllabus note</button>
          {!review
            ? <button className="review-button" onClick={handleParse} disabled={!parseText || parsing}><Sparkles size={15} /> {parsing ? 'Parsing...' : 'Parse syllabus'}</button>
            : <button className="review-button" onClick={handleConfirm}><Sparkles size={15} /> Confirm import</button>
          }
        </div>
      </header>

      {!review && (
        <div className="syllabus-grid">
          <section className="phase3-panel">
            <h2>Paste syllabus text</h2>
            <textarea
              className="syllabus-paste-area"
              placeholder="Paste your syllabus text here (plain text works best)..."
              value={rawPaste}
              onChange={e => setRawPaste(e.target.value)}
              rows={12}
            />
            {rawPaste.trim() && (
              <p className="empty-hint" style={{ marginTop: 6 }}>{rawPaste.trim().split('\n').length} lines pasted. Click "Parse syllabus" to extract.</p>
            )}
            {/* Image OCR fallback (port from syllabus-scanner concept).
                Drops the OCR'd text into the same paste area so the existing
                regex parser handles it identically to typed/pasted text. */}
            <ScanSyllabusDropZone onText={(text) => setRawPaste(prev => prev ? `${prev}\n\n${text}` : text)} />
          </section>
          <section className="phase3-panel wide">
            {selected && selectedText && !rawPaste.trim() ? (
              <>
                <h2>Or use selected note</h2>
                <div className="source-preview">
                  <FileText size={22} />
                  <strong>{selected.title ?? 'Untitled'}</strong>
                  <span>{selected.documentType?.replace('_', ' ') ?? 'document'}</span>
                </div>
                <p className="empty-hint" style={{ marginTop: 8 }}>Note content will be used if the paste area is empty.</p>
              </>
            ) : !rawPaste.trim() ? (
              <>
                <h2>Or select a syllabus note</h2>
                <p className="empty-hint">Create a syllabus note from the sidebar, paste text into it, then return here.</p>
              </>
            ) : (
              <p className="empty-hint">Pasted text will be used. Click "Parse syllabus" to extract course structure.</p>
            )}
          </section>
        </div>
      )}

      {review && (
        <div className="syllabus-grid">
          {/* ── Course info (editable) ─────────────────────────────── */}
          <section className="phase3-panel">
            <h2>Course info</h2>
            <div className="syllabus-form">
              <label>Code <input value={review.course.code ?? ''} onChange={e => updateCourse('code', e.target.value)} /></label>
              <label>Name <input value={review.course.name ?? ''} onChange={e => updateCourse('name', e.target.value)} /></label>
              <label>Instructor <input value={review.course.professorName ?? ''} onChange={e => updateCourse('professorName', e.target.value)} /></label>
              <label>Email <input value={review.course.professorEmail ?? ''} onChange={e => updateCourse('professorEmail', e.target.value)} /></label>
              <label>Term <input value={review.course.term ?? ''} onChange={e => updateCourse('term', e.target.value)} /></label>
            </div>
            {review.classMeetings.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Class meetings</h2>
                {review.classMeetings.map((m, i) => (
                  <div className="timeline-row" key={i}>
                    <Clock3 size={14} />
                    <div>
                      <strong>{m.days.join('/')}</strong>
                      <em>{m.startTime} - {m.endTime}</em>
                      {m.location && <em>{m.location}</em>}
                    </div>
                  </div>
                ))}
              </>
            )}
            {review.readings.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Readings ({review.readings.length})</h2>
                {review.readings.slice(0, 10).map((r, i) => (
                  <div className="timeline-row" key={i}>
                    <BookOpen size={14} />
                    <div><strong>{r.title}</strong>{r.chapter && <em>{r.chapter}</em>}</div>
                  </div>
                ))}
                {review.readings.length > 10 && <p className="empty-hint">+{review.readings.length - 10} more</p>}
              </>
            )}
            {review.scheduleRowCount > 0 && (
              <p className="empty-hint" style={{ marginTop: 8 }}>{review.scheduleRowCount} schedule row(s) extracted.</p>
            )}
          </section>

          {/* ── Right column: assignments, deadlines, setup ────────── */}
          <section className="phase3-panel wide">
            {/* Assignments */}
            <h2>Assignments ({review.assignments.filter(a => a.included).length}/{review.assignments.length})</h2>
            {review.assignments.length === 0 && <EmptyHint message="No assignments found" hint="No graded components detected." />}
            {review.assignments.map((a, i) => (
              <div className="timeline-row" key={`a-${i}`}>
                <input type="checkbox" checked={a.included} onChange={() => toggleAssignment(i)} />
                <div style={{ flex: 1 }}>
                  <input className="syllabus-inline-edit" value={a.title} onChange={e => editAssignment(i, 'title', e.target.value)} />
                  <em>
                    {a.weight && <span>{a.weight}</span>}
                    {a.dueDate && <span> - {formatDue(a.dueDate)}</span>}
                    {' '}{a.type}
                  </em>
                </div>
              </div>
            ))}

            {/* Deadlines */}
            <h2 style={{ marginTop: 16 }}>Deadlines ({review.deadlines.filter(d => d.included).length}/{review.deadlines.length})</h2>
            {review.deadlines.length === 0 && <EmptyHint message="No deadlines found" hint="No dates detected in this document." />}
            {review.deadlines.map((d, i) => (
              <div className="timeline-row" key={`d-${i}`}>
                <input type="checkbox" checked={d.included} onChange={() => toggleDeadline(i)} />
                <div style={{ flex: 1 }}>
                  <input className="syllabus-inline-edit" value={d.title} onChange={e => editDeadline(i, 'title', e.target.value)} />
                  <em>
                    {formatDue(d.deadlineAt)}
                    {' - '}
                    <select className="syllabus-inline-select" value={d.type} onChange={e => editDeadline(i, 'type', e.target.value)}>
                      <option value="assignment">assignment</option>
                      <option value="exam">exam</option>
                      <option value="quiz">quiz</option>
                      <option value="reading">reading</option>
                      <option value="project">project</option>
                      <option value="presentation">presentation</option>
                      <option value="other">other</option>
                    </select>
                  </em>
                </div>
              </div>
            ))}

            {/* Setup tasks */}
            {review.setupTasks.length > 0 && (
              <>
                <h2 style={{ marginTop: 16 }}>Setup tasks ({review.setupTasks.filter(t => t.included).length}/{review.setupTasks.length})</h2>
                {review.setupTasks.map((t, i) => (
                  <div className="timeline-row" key={`s-${i}`}>
                    <input type="checkbox" checked={t.included} onChange={() => toggleSetup(i)} />
                    <div style={{ flex: 1 }}>
                      <input className="syllabus-inline-edit" value={t.title} onChange={e => editSetup(i, 'title', e.target.value)} />
                      <em>
                        <select className="syllabus-inline-select" value={t.category} onChange={e => editSetup(i, 'category', e.target.value)}>
                          <option value="textbook">textbook</option>
                          <option value="software">software</option>
                          <option value="account">account</option>
                          <option value="material">material</option>
                          <option value="other">other</option>
                        </select>
                      </em>
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

function ClassModeView({
  currentCourse,
  captures,
  confusions,
  classSessions,
  onStartClass,
  onResolveConfusion,
  onEndClassSession,
  onRefresh,
}: {
  currentCourse?: Course
  captures: Capture[]
  confusions: ConfusionItem[]
  classSessions: ClassSession[]
  onStartClass: () => Promise<void>
  onResolveConfusion: (id: string) => Promise<void>
  onEndClassSession: (id: string) => Promise<void>
  onRefresh: () => void
}) {
  const [questionInput, setQuestionInput] = useState('')
  const [actionInput, setActionInput] = useState('')
  const activeSession = classSessions.find(session => !session.endedAt)
  const recentSessions = classSessions.filter(s => s.endedAt).slice(0, 3)

  async function addQuestion() {
    if (!questionInput.trim() || !activeSession) return
    const text = questionInput.trim()
    await ipc.invoke('class:update', { id: activeSession.id, patch: { questions: [...activeSession.questions, text] } })
    // Also create a confusion item
    await ipc.invoke('confusion:create', { question: text, context: `Asked during: ${activeSession.title}`, courseId: activeSession.courseId })
    setQuestionInput('')
    onRefresh()
  }

  async function addActionItem() {
    if (!actionInput.trim() || !activeSession) return
    const text = actionInput.trim()
    await ipc.invoke('class:update', { id: activeSession.id, patch: { actionItems: [...activeSession.actionItems, text] } })
    setActionInput('')
    onRefresh()
  }

  return (
    <section className="phase3-card class-view">
      <header className="phase3-header">
        <div>
          <p className="phase3-eyebrow">Class mode</p>
          <h1>{currentCourse ? `${currentCourse.code ?? currentCourse.name} session` : 'Live class capture'}</h1>
          <span>Capture notes, questions, and follow-ups during class.</span>
        </div>
        {activeSession
          ? <button className="outline-button phase4-end" onClick={() => onEndClassSession(activeSession.id)}><Clock3 size={15} /> End class</button>
          : <button className="review-button" onClick={onStartClass}><GraduationCap size={15} /> Start class</button>
        }
      </header>
      <div className="class-grid">
        <section className="phase3-panel wide">
          <h2>{activeSession ? `Active: ${activeSession.title}` : 'Captures'}</h2>
          {activeSession && (
            <div className="class-inputs">
              <div className="class-input-row">
                <input value={questionInput} onChange={e => setQuestionInput(e.target.value)} placeholder="Add a question..." onKeyDown={e => e.key === 'Enter' && addQuestion()} />
                <button className="inline-action" onClick={addQuestion} disabled={!questionInput.trim()}>+ Question</button>
              </div>
              <div className="class-input-row">
                <input value={actionInput} onChange={e => setActionInput(e.target.value)} placeholder="Add an action item..." onKeyDown={e => e.key === 'Enter' && addActionItem()} />
                <button className="inline-action" onClick={addActionItem} disabled={!actionInput.trim()}>+ Action</button>
              </div>
              {activeSession.questions.length > 0 && (
                <div className="class-list">
                  <strong>Questions ({activeSession.questions.length})</strong>
                  {activeSession.questions.slice(-3).map((q, i) => <div className="compact-row" key={i}><HelpCircle size={14} /><span>{q}</span></div>)}
                </div>
              )}
              {activeSession.actionItems.length > 0 && (
                <div className="class-list">
                  <strong>Action items ({activeSession.actionItems.length})</strong>
                  {activeSession.actionItems.slice(-3).map((a, i) => <div className="compact-row" key={i}><Target size={14} /><span>{a}</span></div>)}
                </div>
              )}
            </div>
          )}
          {!activeSession && captures.length > 0
            ? captures.slice(0, 5).map(capture => (
                <div className="capture-row" key={capture.id}>
                  <PenLine size={16} />
                  <p>{capture.text}</p>
                </div>
              ))
            : !activeSession && <EmptyHint message="No captures" hint="Highlight text in any app during class to capture it here." />
          }
          {recentSessions.length > 0 && (
            <>
              <h2 className="section-spacer">Recent sessions</h2>
              {recentSessions.map(session => (
                <div className="compact-row" key={session.id}>
                  <GraduationCap size={16} />
                  <div><strong>{session.title}</strong><em>{new Date(session.startedAt).toLocaleDateString()}</em></div>
                </div>
              ))}
            </>
          )}
        </section>
        <section className="phase3-panel">
          <h2>Unresolved questions</h2>
          {confusions.length > 0
            ? confusions.slice(0, 4).map(item => (
                <div className="compact-row action-row" key={item.id}>
                  <HelpCircle size={18} />
                  <div><strong>{item.question}</strong><em>{item.nextStep ?? item.status}</em></div>
                  <button onClick={() => onResolveConfusion(item.id)}>Resolve</button>
                </div>
              ))
            : <EmptyHint message="No unresolved questions" hint="Questions captured during class appear here." />
          }
        </section>
      </div>
    </section>
  )
}

function MetricCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) {
  return (
    <article className="metric-card">
      <span>{icon}</span>
      <div><strong>{value}</strong><em>{label}</em></div>
      <small>{detail}</small>
    </article>
  )
}

function WorkspaceSection({ title, children, onAdd, count }: { title: string; children: React.ReactNode; onAdd?: () => void; count?: number }) {
  return (
    <section className="workspace-section">
      <header>
        <h2>{title}{typeof count === 'number' && count > 0 && <span className="section-count">{count}</span>}</h2>
        {onAdd && <button onClick={onAdd}>+</button>}
      </header>
      {children}
    </section>
  )
}

function QuickAddSheet({
  kind,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  kind: QuickAddKind
  form: QuickAddForm
  onChange: (form: QuickAddForm) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const titleLabel = kind === 'course' ? 'Course name' : kind === 'question' ? 'Question' : kind === 'study' ? 'Front' : 'Title'
  const detailLabel = kind === 'study' ? 'Back' : kind === 'question' ? 'Context' : 'Details'
  return (
    <div className="quick-add-backdrop">
      <form className="quick-add-sheet" onSubmit={onSubmit}>
        <header>
          <div>
            <p className="phase3-eyebrow">Quick add</p>
            <h2>{quickAddTitle(kind)}</h2>
          </div>
          <button type="button" className="icon-pill compact" onClick={onClose}><X size={16} /></button>
        </header>
        <label>
          <span>{titleLabel}</span>
          <input value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} autoFocus />
        </label>
        {kind === 'course' && (
          <label>
            <span>Course code</span>
            <input value={form.code} onChange={event => onChange({ ...form, code: event.target.value })} placeholder="PSYC 101" />
          </label>
        )}
        {kind === 'deadline' && (
          <label>
            <span>Due date</span>
            <input type="datetime-local" value={form.due} onChange={event => onChange({ ...form, due: event.target.value })} />
          </label>
        )}
        {kind !== 'course' && kind !== 'deadline' && (
          <label>
            <span>{detailLabel}</span>
            <textarea value={form.detail} onChange={event => onChange({ ...form, detail: event.target.value })} rows={4} />
          </label>
        )}
        <footer>
          <button type="button" className="outline-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="review-button">Add</button>
        </footer>
      </form>
    </div>
  )
}

function quickAddTitle(kind: QuickAddKind) {
  switch (kind) {
    case 'course': return 'Course'
    case 'deadline': return 'Deadline'
    case 'assignment': return 'Assignment prompt'
    case 'syllabus': return 'Syllabus note'
    case 'study': return 'Flashcard'
    case 'question': return 'Question'
    case 'note':
    default: return 'Note'
  }
}

function EmptyHint({ message, hint }: { message: string; hint: string }) {
  return <div className="empty-hint"><strong>{message}</strong><span>{hint}</span></div>
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return <div className="check-row"><span className={done ? 'done' : ''}>{done ? '✓' : '○'}</span><span className={done ? 'done' : ''}>{label}</span></div>
}

function SidebarItem({ title, meta, icon, tone, active, onClick, badge }: { title: string; meta: string; icon: React.ReactNode; tone: string; active?: boolean; onClick?: () => void; badge?: { label: string; variant: 'imported' | 'parsed' | 'pending' } }) {
  return (
    <button className={`sidebar-item ${tone} ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="section-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <em>{meta}</em>
      </span>
      {badge && <span className={`sidebar-badge sidebar-badge-${badge.variant}`}>{badge.label}</span>}
    </button>
  )
}

function Panel({ title, children, action, badge }: { title: string; children: React.ReactNode; action?: string; badge?: string }) {
  return <section className="studydesk-panel"><header><h2>{title}</h2>{action && <button>{action}</button>}{badge && <span>{badge}</span>}</header>{children}</section>
}

function MaterialsFolderRow({ course, onPick, onClear }: { course: Course; onPick: () => void; onClear: () => void }) {
  const folder = course.materialsFolderPath
  const importedCount = (course.materialsImportedFiles ?? []).filter(r => r.noteId).length
  if (!folder) {
    return (
      <button className="materials-folder-row materials-folder-empty" onClick={onPick}>
        <Folder size={13} />
        <span>Watch a Materials folder…</span>
      </button>
    )
  }
  const display = folder.split('/').slice(-2).join('/')
  return (
    <div className="materials-folder-row">
      <Folder size={13} />
      <div className="materials-folder-info">
        <strong>{display}</strong>
        <em>{importedCount} imported · auto-watching</em>
      </div>
      <button className="materials-folder-clear" onClick={onClear} title="Stop watching this folder">×</button>
    </div>
  )
}

function RailItem({ title, meta, icon, status, hot, source, onSourceClick }: { title: string; meta: string; icon: React.ReactNode; status?: string; hot?: boolean; source?: string; onSourceClick?: () => void }) {
  return (
    <article className={`studydesk-rail-item ${hot ? 'hot' : ''}`}>
      <span className="rail-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <em>{meta}</em>
        {source && (
          <button className="rail-source" onClick={onSourceClick} title={`Open source: ${source}`}>
            <FileText size={10} /> {source}
          </button>
        )}
      </div>
      {status && <small>{status}</small>}
    </article>
  )
}

function QueueRow({ title, meta }: { title: string; meta: string }) {
  return <div className="queue-row"><strong>{title}</strong><span>{meta}</span><button><Play size={12} fill="currentColor" /></button></div>
}

function RailText({ title, meta }: { title: string; meta: string }) {
  return <div className="rail-text"><strong>{title}</strong><span>{meta}</span><ChevronRight size={13} /></div>
}

function AlertCard({ alert, onDismiss, onResolve }: { alert: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>; onDismiss: () => void; onResolve: () => void }) {
  return <div className="studydesk-alert"><Target size={19} /><div><strong>{alert.title}</strong><span>{alert.reason}</span></div><button onClick={onResolve}>Resolve</button><button onClick={onDismiss}>Dismiss</button></div>
}

function formatDue(value: number) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

