import React, { useEffect, useMemo, useState } from 'react'
import type { AcademicDeadline, AttentionAlert, Capture, ConfusionItem, Course, Note, StudyItem } from '@schema'
import { Editor } from './Editor'
import { ipc } from '@shared/ipc-client'
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  FileText,
  GraduationCap,
  HelpCircle,
  Image,
  LayoutDashboard,
  MoreHorizontal,
  PanelTop,
  Play,
  Search,
  Settings,
  Share2,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'

type WorkspaceTool = 'today' | 'dashboard' | 'quiz' | 'flashcards' | 'assignment' | 'syllabus' | 'class'

function noteText(content: string): string {
  try {
    const json = JSON.parse(content)
    const parts: string[] = []
    const walk = (node: any) => {
      if (!node) return
      if (typeof node.text === 'string') parts.push(node.text)
      if (Array.isArray(node.content)) node.content.forEach(walk)
    }
    walk(json)
    return parts.join(' ').trim()
  } catch {
    return content
  }
}

function firstUsefulLine(text: string): string {
  return text.split(/[.\n]/).map(s => s.trim()).find(s => s.length > 8)?.slice(0, 140) ?? 'Review this concept'
}

function initialWorkspaceTool(): WorkspaceTool {
  const tool = new URLSearchParams(window.location.search).get('tool')
  return tool === 'dashboard' || tool === 'quiz' || tool === 'flashcards' || tool === 'assignment' || tool === 'syllabus' || tool === 'class'
    ? tool
    : 'today'
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([])
  const [studyItems, setStudyItems] = useState<StudyItem[]>([])
  const [confusions, setConfusions] = useState<ConfusionItem[]>([])
  const [alerts, setAlerts] = useState<AttentionAlert[]>([])
  const [activeTool, setActiveTool] = useState<WorkspaceTool>(initialWorkspaceTool)
  const [status, setStatus] = useState('')

  async function refresh() {
    const [noteData, captureData, courseData, deadlineData, studyData, confusionData, alertData] = await Promise.all([
      ipc.invoke<Note[]>('notes:list'),
      ipc.invoke<Capture[]>('capture:list', { limit: 80 }),
      ipc.invoke<Course[]>('course:list', {}),
      ipc.invoke<AcademicDeadline[]>('deadline:list', {}),
      ipc.invoke<StudyItem[]>('study:list', {}),
      ipc.invoke<ConfusionItem[]>('confusion:list', {}),
      ipc.invoke<AttentionAlert[]>('attentionAlerts:list', {}),
    ])
    setNotes(noteData)
    setCaptures(captureData)
    setCourses(courseData)
    setDeadlines(deadlineData)
    setStudyItems(studyData)
    setConfusions(confusionData)
    setAlerts(alertData)
    setSelected(prev => prev ? noteData.find(n => n.id === prev.id) ?? noteData[0] ?? null : noteData[0] ?? null)
  }

  useEffect(() => {
    refresh().catch(() => {})
    ipc.on('notes:openNote', (noteId: string) => {
      ipc.invoke<Note>('notes:get', { id: noteId }).then(note => note && setSelected(note)).catch(() => {})
    })
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
    })
    return () => { ipc.off('notes:openNote'); ipc.off('capture:new') }
  }, [])

  const selectedText = useMemo(() => selected ? noteText(selected.content) : '', [selected])
  const selectedCourse = courses.find(c => c.id === selected?.courseId)
  const currentCourse = selectedCourse ?? courses[0]
  const assignmentNotes = notes.filter(note => note.documentType === 'assignment_prompt')
  const syllabusNotes = notes.filter(note => note.documentType === 'syllabus')
  const classNotes = notes.filter(note => note.documentType === 'class_notes' || note.documentType === 'note')
  const orderedDeadlines = [...deadlines].sort((a, b) => a.deadlineAt - b.deadlineAt)

  async function handleCreate(type: Note['documentType'] = 'note') {
    const note = await ipc.invoke<Note>('notes:create', { title: type === 'note' ? 'Untitled note' : `New ${type.replace('_', ' ')}`, content: '' })
    const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType: type, tags: [] } })
    setNotes(prev => [updated, ...prev])
    setSelected(updated)
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

  async function createFlashcard() {
    if (!selectedText) return
    await ipc.invoke('study:create', {
      front: firstUsefulLine(selectedText),
      back: 'Add the answer in Study.',
      type: 'flashcard',
      courseId: selected?.courseId,
    })
    setStatus('Flashcard created from the current document.')
    await refresh()
  }

  async function createQuizNote() {
    if (!selectedText) return
    const lines = selectedText.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 24).slice(0, 6)
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Quiz draft' }] },
        ...lines.map((line, index) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `${index + 1}. What should you remember about: ${line}?` }],
        })),
      ],
    }
    const note = await ipc.invoke<Note>('notes:create', { title: `Quiz: ${selected?.title ?? 'Study'}`, content: JSON.stringify(content) })
    const updated = await ipc.invoke<Note>('notes:update', { id: note.id, patch: { documentType: 'reading', courseId: selected?.courseId, tags: ['quiz'] } })
    setSelected(updated)
    setStatus('Editable quiz draft created.')
    await refresh()
  }

  async function parseAssignment() {
    if (!selectedText) return
    const parsed: any = await ipc.invoke('assignment:parse', { text: selectedText, courseId: selected?.courseId, title: selected?.title })
    await ipc.invoke('assignment:create', {
      title: parsed.title,
      courseId: selected?.courseId,
      dueDate: parsed.dueDate,
      sourceType: 'assignment_prompt',
      sourceId: selected?.id,
      deliverables: parsed.deliverables,
      formatRequirements: parsed.formatRequirements,
      rubricItems: parsed.rubricItems,
      submissionChecklist: parsed.submissionChecklist,
    })
    setStatus('Assignment checklist saved from this document.')
    await refresh()
  }

  async function parseSyllabus() {
    if (!selectedText) return
    const parsed: any = await ipc.invoke('syllabus:parse', { text: selectedText, courseId: selected?.courseId })
    await ipc.invoke('syllabus:confirmImport', { courseId: selected?.courseId, course: parsed.course, deadlines: parsed.deadlines.map((d: any) => ({ ...d, confirmed: true })) })
    setStatus('Syllabus deadlines imported for review.')
    await refresh()
  }

  async function startClass() {
    const title = selectedCourse ? `${selectedCourse.code ?? selectedCourse.name} class session` : 'Class session'
    await ipc.invoke('class:start', { courseId: selected?.courseId, title })
    setStatus('Class mode started. Capture notes and questions as you work.')
    await refresh()
  }

  const tools: Array<{ id: WorkspaceTool; label: string; icon: React.ReactNode; action?: () => Promise<void> | void }> = [
    { id: 'today', label: 'Today', icon: <PanelTop size={14} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
    { id: 'quiz', label: 'Quiz', icon: <HelpCircle size={14} />, action: createQuizNote },
    { id: 'flashcards', label: 'Flashcards', icon: <ClipboardList size={14} />, action: createFlashcard },
    { id: 'assignment', label: 'Assignment Parser', icon: <Sparkles size={14} />, action: parseAssignment },
    { id: 'syllabus', label: 'Syllabus Import', icon: <FileText size={14} />, action: parseSyllabus },
    { id: 'class', label: 'Class Mode', icon: <GraduationCap size={14} />, action: startClass },
  ]

  return (
    <div className="studydesk-app">
      <div className="studydesk-shell">
        <header className="studydesk-topbar">
          <div className="studydesk-window-controls" aria-hidden="true">
            <span className="traffic red" />
            <span className="traffic yellow" />
            <span className="traffic green" />
          </div>
          <button className="studydesk-focus-pill">
            <span className="focus-play"><Play size={18} fill="currentColor" /></span>
            <strong>25:00</strong>
            <span>Focus</span>
            <ChevronRight size={15} />
          </button>
          <nav className="studydesk-ribbon" aria-label="Workspace tools">
            {tools.map(tool => (
              <button key={tool.id} className={activeTool === tool.id ? 'active' : ''} onClick={async () => { setActiveTool(tool.id); await tool.action?.() }}>
                {tool.icon}
                <span>{tool.label}</span>
              </button>
            ))}
          </nav>
          <div className="studydesk-top-actions">
            <button className="icon-pill"><Search size={17} /></button>
            <button className="icon-pill has-badge"><Bell size={17} /></button>
            <button className="icon-pill"><Settings size={17} /></button>
          </div>
        </header>
        {status && <div className="studydesk-status">{status}<button onClick={() => setStatus('')}>Dismiss</button></div>}
        <div className="studydesk-workspace">
          <aside className="studydesk-library">
            <WorkspaceSection title="Courses" onAdd={() => handleCreate('note')}>
              <div className="studydesk-course-list">
                {(courses.length ? courses : fallbackCourses).slice(0, 6).map((course, index) => (
                  <button key={course.id} className={index === 0 ? 'active' : ''} onClick={() => setSelected(notes.find(n => n.courseId === course.id) ?? selected)}>
                    <span className="section-icon course-token">{course.code?.slice(0, 2) ?? 'CR'}</span>
                    <span>
                      <strong>{course.code ?? course.name}</strong>
                      <em>{course.name}</em>
                    </span>
                  </button>
                ))}
              </div>
              <button className="studydesk-link-row">View all courses <ChevronRight size={14} /></button>
            </WorkspaceSection>

            <WorkspaceSection title="Syllabus Imports" onAdd={() => handleCreate('syllabus')}>
              {(syllabusNotes.length ? syllabusNotes : fallbackSyllabi).slice(0, 3).map(note => (
                <SidebarItem key={note.id} icon={<FileText size={16} />} title={note.title} meta="Imported Apr 10" tone="teal" onClick={() => 'content' in note && setSelected(note as Note)} />
              ))}
            </WorkspaceSection>

            <WorkspaceSection title="Assignment Prompts" onAdd={() => handleCreate('assignment_prompt')}>
              {(assignmentNotes.length ? assignmentNotes : notes).slice(0, 4).map(note => (
                <SidebarItem key={note.id} active={selected?.id === note.id} icon={<ClipboardList size={16} />} title={note.title || 'Untitled'} meta="Due Apr 27" tone="blue" onClick={() => setSelected(note)} />
              ))}
            </WorkspaceSection>

            <WorkspaceSection title="Notes" onAdd={() => handleCreate('note')}>
              {classNotes.slice(0, 3).map(note => (
                <SidebarItem key={note.id} icon={<FileText size={16} />} title={note.title || 'Untitled'} meta={new Date(note.updatedAt).toLocaleDateString()} tone="orange" onClick={() => setSelected(note)} />
              ))}
            </WorkspaceSection>

            <WorkspaceSection title="Captures" onAdd={() => handleCreate('note')}>
              {(captures.length ? captures : fallbackCaptures).slice(0, 3).map(capture => (
                <SidebarItem key={capture.id} icon={<Image size={16} />} title={capture.text.slice(0, 34)} meta="Apr 21" tone="purple" />
              ))}
            </WorkspaceSection>
          </aside>

          <main className="studydesk-main">
            {activeTool === 'assignment'
              ? <AssignmentParserView selected={selected} selectedText={selectedText} onParse={parseAssignment} />
              : <DocumentWorkspace selected={selected} captures={captures} currentCourse={currentCourse} onUpdate={handleUpdate} onDelete={handleDelete} onCreate={handleCreate} />
            }
          </main>

          <aside className="studydesk-action-rail">
            <Panel title="Upcoming Deadlines" action="View all">
              {(orderedDeadlines.length ? orderedDeadlines : fallbackDeadlines).slice(0, 4).map((d, index) => (
                <RailItem key={d.id} icon={<CalendarDays size={15} />} title={d.title} meta={formatDue(d.deadlineAt)} status={index === 0 ? 'Due soon' : `${index + 5} days`} hot={index === 0} />
              ))}
            </Panel>
            <Panel title="Assignment Checklist" badge="70%">
              {['Review prompt & rubric', 'Outline key points', 'Draft reflection', 'Add supporting examples', 'Proofread & finalize'].map((item, index) => (
                <ChecklistRow key={item} label={item} done={index < 3} />
              ))}
            </Panel>
            <Panel title="Study Queue" badge={`${Math.max(3, studyItems.length)}`}>
              {(studyItems.length ? studyItems : fallbackStudy).slice(0, 4).map((item, index) => (
                <QueueRow key={item.id} title={item.front} meta={`${index === 0 ? 25 : 15 + index * 5}m`} />
              ))}
            </Panel>
            <Panel title="Unresolved Questions" badge={`${Math.max(2, confusions.length)}`}>
              {(confusions.length ? confusions : fallbackQuestions).slice(0, 3).map(question => (
                <RailText key={question.id} title={question.question} meta="Apr 21" />
              ))}
            </Panel>
            <Panel title="Local Alerts" badge={`${Math.max(1, alerts.length)}`}>
              {(alerts.length ? alerts : fallbackAlerts).slice(0, 2).map(alert => (
                <AlertCard key={alert.id} alert={alert} onDismiss={() => ipc.invoke('attentionAlerts:dismiss', { id: alert.id }).then(refresh)} />
              ))}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  )
}

function DocumentWorkspace({
  selected,
  captures,
  currentCourse,
  onUpdate,
  onDelete,
  onCreate,
}: {
  selected: Note | null
  captures: Capture[]
  currentCourse?: Course
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (type?: Note['documentType']) => Promise<void>
}) {
  return (
    <section className="studydesk-document-card">
      <header className="document-card-header">
        <div>
          <button className="ghost-icon"><ChevronRight size={16} /></button>
          <span>Assignment Prompt</span>
        </div>
        <div className="document-actions">
          <span>Saved just now</span>
          <button className="icon-pill compact"><Share2 size={15} /></button>
          <button className="share-button"><Share2 size={14} /> Share</button>
          <button className="icon-pill compact"><MoreHorizontal size={16} /></button>
        </div>
      </header>
      {selected ? (
        <>
          <div className="document-context-row">
            <span>{currentCourse?.code ?? 'BUAD 5901'}</span>
            <Circle size={4} fill="currentColor" />
            <span>{currentCourse?.name ?? 'Research Methods'}</span>
            <Circle size={4} fill="currentColor" />
            <span>Due Apr 27, 10:44 PM</span>
            <button onClick={() => onDelete(selected.id)}>Delete</button>
          </div>
          <Editor
            key={selected.id}
            note={selected}
            captures={captures}
            onUpdate={(patch) => onUpdate(selected.id, patch)}
          />
          <footer className="document-footer">
            <span>652 words</span>
            <span>Readability: Good</span>
            <span>Focus</span>
            <strong>100%</strong>
          </footer>
        </>
      ) : (
        <div className="notes-empty">
          <p>No document selected</p>
          <button className="notes-create-btn" onClick={() => onCreate('assignment_prompt')}>Create assignment prompt</button>
        </div>
      )}
    </section>
  )
}

function AssignmentParserView({ selected, selectedText, onParse }: { selected: Note | null; selectedText: string; onParse: () => Promise<void> }) {
  const title = selected?.title || 'Research Reflection Draft'
  const prompt = selectedText || 'Write a 2-3 page reflection on your research process. Describe your topic, summarize your sources, evaluate what you learned, and submit the draft by the due date.'
  return (
    <section className="parser-card">
      <header className="parser-header">
        <div className="parser-tab"><FileText size={15} /> {title}<span>x</span></div>
        <button className="icon-pill compact">+</button>
        <button className="review-button" onClick={onParse}><Sparkles size={15} /> Review before save</button>
      </header>
      <div className="parser-tabs">
        {['Document', 'Assignment Parser', 'Outliner', 'Mind Map', 'Flashcards'].map(label => (
          <span key={label} className={label === 'Assignment Parser' ? 'active' : ''}>{label}</span>
        ))}
      </div>
      <div className="parser-grid">
        <article className="parser-source">
          <p className="eyebrow">Parsed from <strong>{title}</strong></p>
          <h1>{title}</h1>
          <p>{prompt.slice(0, 180)}</p>
          <p>In your reflection, <mark>describe your topic</mark>, explain why <mark>this topic matters</mark>, summarize key sources, and evaluate how your <mark>thinking evolved</mark>.</p>
          <p>Use <mark className="green">at least 3 credible sources</mark>. Follow <mark className="blue">MLA format</mark> for in-text citations and a Works Cited page.</p>
          <p>Your draft should be <mark className="purple">2-3 pages, double-spaced, 12pt font</mark>, with 1-inch margins.</p>
          <button className="text-action"><Zap size={15} /> Re-parse document</button>
        </article>
        <article className="parser-details">
          <h2><Sparkles size={17} /> Extracted details</h2>
          <DetailBlock icon={<CalendarDays size={19} />} title="Due date" body="Apr 27, 2025 at 10:44 PM" />
          <DetailBlock icon={<FileText size={19} />} title="Deliverables" body="Research reflection draft. File type: .docx or .pdf" />
          <DetailBlock icon={<ClipboardList size={19} />} title="Format rules" body="2-3 pages, double-spaced, 12pt font, 1-inch margins" />
          <DetailBlock icon={<BookOpen size={19} />} title="Citation rules" body="MLA format. In-text citations + Works Cited" />
          <DetailBlock icon={<CheckCircle2 size={19} />} title="Checklist" body="Topic described, sources summarized, reflection drafted" />
        </article>
        <article className="parser-flashcards">
          <h2><BookOpen size={17} /> Flashcards from selection <span>6</span></h2>
          {[
            ['What is the main goal of this assignment?', 'To write a 2-3 page reflection on your research process.'],
            ['How many sources are required?', 'At least 3 credible sources.'],
            ['What citation style should be used?', 'MLA format.'],
            ['What file types are accepted?', '.docx or .pdf.'],
            ['What should the reflection include?', 'Topic, why it matters, key sources, and what you learned.'],
          ].map(([q, a]) => <Flashcard key={q} question={q} answer={a} />)}
          <button className="outline-button">Generate more flashcards</button>
        </article>
      </div>
    </section>
  )
}

function WorkspaceSection({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <section className="workspace-section">
      <header>
        <h2>{title}</h2>
        {onAdd && <button onClick={onAdd}>+</button>}
      </header>
      {children}
    </section>
  )
}

function SidebarItem({ title, meta, icon, tone, active, onClick }: { title: string; meta: string; icon: React.ReactNode; tone: string; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`sidebar-item ${tone} ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="section-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <em>{meta}</em>
      </span>
    </button>
  )
}

function Panel({ title, children, action, badge }: { title: string; children: React.ReactNode; action?: string; badge?: string }) {
  return <section className="studydesk-panel"><header><h2>{title}</h2>{action && <button>{action}</button>}{badge && <span>{badge}</span>}</header>{children}</section>
}

function RailItem({ title, meta, icon, status, hot }: { title: string; meta: string; icon: React.ReactNode; status?: string; hot?: boolean }) {
  return <article className={`studydesk-rail-item ${hot ? 'hot' : ''}`}><span className="rail-icon">{icon}</span><div><strong>{title}</strong><em>{meta}</em></div>{status && <small>{status}</small>}</article>
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return <div className="check-row">{done ? <CheckCircle2 size={15} /> : <Circle size={15} />}<span>{label}</span></div>
}

function QueueRow({ title, meta }: { title: string; meta: string }) {
  return <div className="queue-row"><strong>{title}</strong><span>{meta}</span><button><Play size={12} fill="currentColor" /></button></div>
}

function RailText({ title, meta }: { title: string; meta: string }) {
  return <div className="rail-text"><strong>{title}</strong><span>{meta}</span><ChevronRight size={13} /></div>
}

function AlertCard({ alert, onDismiss }: { alert: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>; onDismiss: () => void }) {
  return <div className="studydesk-alert"><Target size={19} /><div><strong>{alert.title}</strong><span>{alert.reason}</span></div><button onClick={onDismiss}>Review</button></div>
}

function DetailBlock({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="detail-block"><span>{icon}</span><div><strong>{title}</strong><p>{body}</p></div></div>
}

function Flashcard({ question, answer }: { question: string; answer: string }) {
  return <div className="flashcard-preview"><strong>Q</strong><p>{question}</p><strong>A</strong><p>{answer}</p></div>
}

function formatDue(value: number) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const fallbackCourses: Course[] = [
  { id: 'fallback-course-1', name: 'Research Methods', code: 'BUAD 5901', color: '#3478f6', createdAt: 0, updatedAt: 0, archived: false },
  { id: 'fallback-course-2', name: 'Marketing Research', code: 'MR', color: '#38bdf8', createdAt: 0, updatedAt: 0, archived: false },
  { id: 'fallback-course-3', name: 'Analytics', code: 'AN', color: '#22c55e', createdAt: 0, updatedAt: 0, archived: false },
]

const fallbackSyllabi = [
  { id: 'fallback-syllabus-1', title: 'BUAD 5901 Syllabus' },
]

const fallbackCaptures: Capture[] = [
  { id: 'fallback-capture-1', text: 'Screenshot 2025-04-21', source: 'manual', createdAt: 0, pinned: false },
]

const fallbackDeadlines: AcademicDeadline[] = [
  { id: 'fallback-deadline-1', title: 'Research Reflection Draft', deadlineAt: new Date('2026-04-27T22:44:00-04:00').getTime(), type: 'assignment', sourceType: 'manual', confirmed: true, completed: false, createdAt: 0, updatedAt: 0 },
  { id: 'fallback-deadline-2', title: 'Final Project Proposal', deadlineAt: new Date('2026-05-04T23:59:00-04:00').getTime(), type: 'assignment', sourceType: 'manual', confirmed: true, completed: false, createdAt: 0, updatedAt: 0 },
  { id: 'fallback-deadline-3', title: 'Literature Review Outline', deadlineAt: new Date('2026-05-03T23:59:00-04:00').getTime(), type: 'assignment', sourceType: 'manual', confirmed: true, completed: false, createdAt: 0, updatedAt: 0 },
]

const fallbackStudy: StudyItem[] = [
  { id: 'fallback-study-1', type: 'flashcard', front: 'Review Research Methods', back: '', reviewCount: 0, createdAt: 0, updatedAt: 0 },
  { id: 'fallback-study-2', type: 'flashcard', front: 'Flashcards: Chapter 4', back: '', reviewCount: 0, createdAt: 0, updatedAt: 0 },
  { id: 'fallback-study-3', type: 'question', front: 'Practice Quiz', back: '', reviewCount: 0, createdAt: 0, updatedAt: 0 },
]

const fallbackQuestions: ConfusionItem[] = [
  { id: 'fallback-question-1', question: 'What is the difference between reliability and validity?', status: 'unresolved', createdAt: 0 },
  { id: 'fallback-question-2', question: "How do I interpret Cronbach's alpha?", status: 'unresolved', createdAt: 0 },
]

const fallbackAlerts: Pick<AttentionAlert, 'id' | 'title' | 'reason' | 'priority'>[] = [
  { id: 'fallback-alert-1', title: 'Focus session in progress', reason: '25:00 remaining', priority: 'medium' },
]
