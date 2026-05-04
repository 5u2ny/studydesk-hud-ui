// Adapter that turns our heterogeneous entities (Notes, Courses, Deadlines,
// Assignments, StudyItems, Captures) into a {nodes, links} graph for
// react-force-graph-2d.
//
// Concept ported from Trilium's Note Map: build a single multi-typed graph
// from existing relation columns rather than maintaining a separate edge
// table. Trilium uses force-graph (vasturiano); we use its React wrapper.

import type { Note, Course, AcademicDeadline, Assignment, StudyItem, Capture } from '@schema'

export type GraphNodeKind = 'note' | 'course' | 'deadline' | 'assignment' | 'card' | 'capture'

export interface GraphNode {
  id: string                 // unique across all kinds, prefixed by kind
  kind: GraphNodeKind
  label: string
  refId: string              // the underlying entity id
  /** Course this node belongs to (for color grouping). */
  courseId?: string
  /** Optional secondary metadata for tooltips */
  meta?: string
}

export type GraphLinkRelation =
  | 'belongs_to_course'      // note/deadline/assignment/study/capture → course
  | 'derived_from_note'      // deadline/assignment/card → note (sourceId / sourceNoteId)
  | 'derived_from_capture'   // card → capture
  | 'linked_assignment'      // note → assignment (linkedAssignmentId)
  | 'auto_imported'          // note → course (came from materials folder)

export interface GraphLink {
  source: string             // node id
  target: string             // node id
  relation: GraphLinkRelation
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface BuildInput {
  notes: Note[]
  courses: Course[]
  deadlines: AcademicDeadline[]
  assignments: Assignment[]
  studyItems: StudyItem[]
  captures: Capture[]
  /** If set, restrict graph to entities tied to this course. */
  courseId?: string
}

const PREFIX: Record<GraphNodeKind, string> = {
  course: 'course',
  note: 'note',
  deadline: 'deadline',
  assignment: 'assignment',
  card: 'card',
  capture: 'capture',
}

function key(kind: GraphNodeKind, id: string) {
  return `${PREFIX[kind]}:${id}`
}

export function buildRelationGraph(input: BuildInput): GraphData {
  const { courseId } = input
  const inCourse = <T extends { courseId?: string }>(x: T) =>
    !courseId || x.courseId === courseId

  const filteredNotes = input.notes.filter(inCourse)
  const filteredCourses = courseId ? input.courses.filter(c => c.id === courseId) : input.courses
  const filteredDeadlines = input.deadlines.filter(inCourse)
  const filteredAssignments = input.assignments.filter(inCourse)
  const filteredStudy = input.studyItems.filter(inCourse)
  const filteredCaptures = input.captures.filter(inCourse)

  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const seen = new Set<string>()

  function addNode(n: GraphNode) {
    if (seen.has(n.id)) return
    seen.add(n.id)
    nodes.push(n)
  }
  function addLink(source: string, target: string, relation: GraphLinkRelation) {
    if (!seen.has(source) || !seen.has(target)) return
    links.push({ source, target, relation })
  }

  // Courses
  for (const c of filteredCourses) {
    addNode({
      id: key('course', c.id),
      kind: 'course',
      label: c.code ?? c.name,
      refId: c.id,
      courseId: c.id,
      meta: c.name,
    })
  }
  // Notes
  for (const n of filteredNotes) {
    addNode({
      id: key('note', n.id),
      kind: 'note',
      label: n.title || 'Untitled',
      refId: n.id,
      courseId: n.courseId,
      meta: n.documentType,
    })
  }
  // Deadlines
  for (const d of filteredDeadlines) {
    addNode({
      id: key('deadline', d.id),
      kind: 'deadline',
      label: d.title,
      refId: d.id,
      courseId: d.courseId,
      meta: d.type,
    })
  }
  // Assignments
  for (const a of filteredAssignments) {
    addNode({
      id: key('assignment', a.id),
      kind: 'assignment',
      label: a.title,
      refId: a.id,
      courseId: a.courseId,
      meta: a.status,
    })
  }
  // Study items (flashcards)
  for (const s of filteredStudy) {
    addNode({
      id: key('card', s.id),
      kind: 'card',
      label: s.front.slice(0, 40),
      refId: s.id,
      courseId: s.courseId,
      meta: s.type,
    })
  }
  // Captures
  for (const c of filteredCaptures) {
    addNode({
      id: key('capture', c.id),
      kind: 'capture',
      label: c.text.slice(0, 40),
      refId: c.id,
      courseId: c.courseId,
    })
  }

  // ── Links ─────────────────────────────────────────────────────────────
  // Notes → Course
  for (const n of filteredNotes) {
    if (n.courseId) addLink(key('note', n.id), key('course', n.courseId), 'belongs_to_course')
  }
  // Deadlines → Note (sourceId)  &  → Course
  for (const d of filteredDeadlines) {
    if (d.sourceId) addLink(key('deadline', d.id), key('note', d.sourceId), 'derived_from_note')
    if (d.courseId) addLink(key('deadline', d.id), key('course', d.courseId), 'belongs_to_course')
  }
  // Assignments → Note (sourceId)  &  → Course
  for (const a of filteredAssignments) {
    if (a.sourceId) addLink(key('assignment', a.id), key('note', a.sourceId), 'derived_from_note')
    if (a.courseId) addLink(key('assignment', a.id), key('course', a.courseId), 'belongs_to_course')
  }
  // Notes ↔ Assignment via linkedAssignmentId
  for (const n of filteredNotes) {
    if (n.linkedAssignmentId) addLink(key('note', n.id), key('assignment', n.linkedAssignmentId), 'linked_assignment')
  }
  // StudyItems (cards) → Note (sourceNoteId) or Capture (sourceCaptureId)
  for (const s of filteredStudy) {
    if (s.sourceNoteId) addLink(key('card', s.id), key('note', s.sourceNoteId), 'derived_from_note')
    if (s.sourceCaptureId) addLink(key('card', s.id), key('capture', s.sourceCaptureId), 'derived_from_capture')
    if (s.courseId) addLink(key('card', s.id), key('course', s.courseId), 'belongs_to_course')
  }
  // Captures → Course
  for (const c of filteredCaptures) {
    if (c.courseId) addLink(key('capture', c.id), key('course', c.courseId), 'belongs_to_course')
  }
  // Course materials folder → Note (auto_imported)
  for (const c of filteredCourses) {
    for (const r of c.materialsImportedFiles ?? []) {
      if (r.noteId && seen.has(key('note', r.noteId))) {
        // The course → note edge already exists as belongs_to_course; we
        // upgrade the visualization by adding a stronger "auto_imported"
        // edge for nodes that came in via the watcher.
        addLink(key('note', r.noteId), key('course', c.id), 'auto_imported')
      }
    }
  }

  return { nodes, links }
}

/** Color palette by node kind. Stays in sync with the workspace dark theme. */
export const KIND_COLORS: Record<GraphNodeKind, string> = {
  course: '#5fa1ff',     // blue (anchor nodes)
  note: '#10a6a3',       // teal
  deadline: '#ff6b2d',   // orange
  assignment: '#5fa1ff', // blue
  card: '#955aff',       // purple
  capture: '#ffb84d',    // amber
}

export const RELATION_COLORS: Record<GraphLinkRelation, string> = {
  belongs_to_course: 'rgba(255, 255, 255, 0.10)',
  derived_from_note: 'rgba(95, 161, 255, 0.45)',
  derived_from_capture: 'rgba(255, 184, 77, 0.45)',
  linked_assignment: 'rgba(149, 90, 255, 0.45)',
  auto_imported: 'rgba(16, 185, 129, 0.45)',
}
