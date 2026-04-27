import React, { useEffect, useMemo, useState } from 'react'
import type { AcademicDeadline, AttentionAlert, Capture, ConfusionItem, Course, Note, StudyItem } from '@schema'
import { Editor } from './Editor'
import { ipc } from '@shared/ipc-client'

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

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([])
  const [studyItems, setStudyItems] = useState<StudyItem[]>([])
  const [confusions, setConfusions] = useState<ConfusionItem[]>([])
  const [alerts, setAlerts] = useState<AttentionAlert[]>([])
  const [activeTool, setActiveTool] = useState<WorkspaceTool>('today')
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

  const tools: Array<{ id: WorkspaceTool; label: string; action?: () => Promise<void> | void }> = [
    { id: 'today', label: 'Today' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'quiz', label: 'Quiz', action: createQuizNote },
    { id: 'flashcards', label: 'Flashcards', action: createFlashcard },
    { id: 'assignment', label: 'Assignment Parser', action: parseAssignment },
    { id: 'syllabus', label: 'Syllabus Import', action: parseSyllabus },
    { id: 'class', label: 'Class Mode', action: startClass },
  ]

  return (
    <div className="studydesk-app">
      <aside className="studydesk-library">
        <div className="studydesk-brand">
          <strong>StudyDesk</strong>
          <span>Local academic workspace</span>
        </div>
        <div className="studydesk-library-actions">
          <button onClick={() => handleCreate('note')}>New note</button>
          <button onClick={() => handleCreate('syllabus')}>Syllabus</button>
          <button onClick={() => handleCreate('assignment_prompt')}>Assignment</button>
        </div>
        <input className="notes-search" placeholder="Search documents..." />
        <div className="studydesk-section-title">Courses</div>
        <div className="studydesk-course-list">
          {courses.slice(0, 8).map(course => (
            <button key={course.id} onClick={() => setSelected(notes.find(n => n.courseId === course.id) ?? selected)}>
              <span>{course.code ?? 'Course'}</span>
              <strong>{course.name}</strong>
            </button>
          ))}
          {courses.length === 0 && <p className="studydesk-muted">Add courses from the HUD.</p>}
        </div>
        <div className="studydesk-section-title">Documents</div>
        <div className="studydesk-doc-list">
          {notes.map(note => (
            <button key={note.id} className={selected?.id === note.id ? 'active' : ''} onClick={() => setSelected(note)}>
              <strong>{note.title || 'Untitled'}</strong>
              <span>{note.documentType ?? 'note'} · {new Date(note.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
          {notes.length === 0 && <p className="studydesk-muted">Create a note, syllabus, or assignment prompt.</p>}
        </div>
      </aside>

      <main className="studydesk-main">
        <header className="studydesk-ribbon">
          {tools.map(tool => (
            <button key={tool.id} className={activeTool === tool.id ? 'active' : ''} onClick={async () => { setActiveTool(tool.id); await tool.action?.() }}>
              {tool.label}
            </button>
          ))}
        </header>
        {status && <div className="studydesk-status">{status}<button onClick={() => setStatus('')}>Dismiss</button></div>}
        {selected ? (
          <div className="studydesk-editor-shell">
            <div className="studydesk-doc-meta">
              <select value={selected.documentType ?? 'note'} onChange={e => handleUpdate(selected.id, { documentType: e.target.value as Note['documentType'] })}>
                <option value="note">Note</option>
                <option value="syllabus">Syllabus</option>
                <option value="assignment_prompt">Assignment prompt</option>
                <option value="reading">Reading</option>
                <option value="class_notes">Class notes</option>
              </select>
              <select value={selected.courseId ?? ''} onChange={e => handleUpdate(selected.id, { courseId: e.target.value || undefined })}>
                <option value="">No course</option>
                {courses.map(course => <option key={course.id} value={course.id}>{course.code ? `${course.code} ` : ''}{course.name}</option>)}
              </select>
              <button onClick={() => handleDelete(selected.id)}>Delete</button>
            </div>
            <Editor
              key={selected.id}
              note={selected}
              captures={captures}
              onUpdate={(patch) => handleUpdate(selected.id, patch)}
            />
          </div>
        ) : (
          <div className="notes-empty">
            <p>No document selected</p>
            <button className="notes-create-btn" onClick={() => handleCreate('note')}>Create your first note</button>
          </div>
        )}
      </main>

      <aside className="studydesk-action-rail">
        <Panel title="Deadlines">
          {deadlines.slice(0, 5).map(d => <RailItem key={d.id} title={d.title} meta={new Date(d.deadlineAt).toLocaleString()} />)}
          {deadlines.length === 0 && <p className="studydesk-muted">No deadlines yet.</p>}
        </Panel>
        <Panel title="Checklist + Study">
          {studyItems.slice(0, 4).map(i => <RailItem key={i.id} title={i.front} meta={`${i.type} · ${i.reviewCount} reviews`} />)}
          {confusions.slice(0, 3).map(c => <RailItem key={c.id} title={c.question} meta={c.status} />)}
        </Panel>
        <Panel title="Local alerts">
          {alerts.slice(0, 4).map(a => (
            <div key={a.id} className="studydesk-alert">
              <strong>{a.title}</strong>
              <span>{a.reason}</span>
              <button onClick={() => ipc.invoke('attentionAlerts:dismiss', { id: a.id }).then(refresh)}>Dismiss</button>
            </div>
          ))}
          {alerts.length === 0 && <p className="studydesk-muted">No local alerts.</p>}
        </Panel>
      </aside>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="studydesk-panel"><h2>{title}</h2>{children}</section>
}

function RailItem({ title, meta }: { title: string; meta: string }) {
  return <article className="studydesk-rail-item"><strong>{title}</strong><span>{meta}</span></article>
}
