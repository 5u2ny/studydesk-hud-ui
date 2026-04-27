import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { Assignment } from '../../../shared/schema/index';
import { defaultSubmissionChecklist } from './checklist';
import { deadlineService } from '../deadlines/deadlineService';
import { parseAssignmentText } from './assignmentParserService';

export const assignmentService = {
  list(opts?: { courseId?: string; includeArchived?: boolean }): Assignment[] {
    let items = focusStore.get('assignments');
    if (opts?.courseId) items = items.filter(a => a.courseId === opts.courseId);
    if (!opts?.includeArchived) items = items.filter(a => a.status !== 'archived');
    return items.sort((a, b) => (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER));
  },

  create(opts: Partial<Assignment> & { title: string }): Assignment {
    const now = Date.now();
    const assignment: Assignment = {
      id: randomUUID(),
      courseId: opts.courseId,
      title: opts.title.trim(),
      description: opts.description,
      dueDate: opts.dueDate,
      sourceType: opts.sourceType ?? 'manual',
      sourceId: opts.sourceId,
      deliverables: opts.deliverables ?? [],
      formatRequirements: opts.formatRequirements ?? [],
      rubricItems: opts.rubricItems ?? [],
      submissionChecklist: opts.submissionChecklist?.length ? opts.submissionChecklist : defaultSubmissionChecklist(),
      status: opts.status ?? 'not_started',
      priority: opts.priority ?? 'medium',
      estimatedWorkMinutes: opts.estimatedWorkMinutes,
      createdAt: now,
      updatedAt: now,
      completedAt: opts.completedAt,
    };
    focusStore.addAssignment(assignment);
    if (assignment.dueDate) {
      deadlineService.create({
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        title: assignment.title,
        deadlineAt: assignment.dueDate,
        type: 'assignment',
        sourceType: assignment.sourceType,
        sourceId: assignment.sourceId,
        confirmed: true,
      });
    }
    return assignment;
  },

  update(id: string, patch: Partial<Assignment>): Assignment {
    focusStore.updateAssignment(id, patch);
    return focusStore.get('assignments').find(a => a.id === id)!;
  },

  delete(id: string): void {
    focusStore.set('assignments', focusStore.get('assignments').filter(a => a.id !== id));
    focusStore.set('academicDeadlines', focusStore.get('academicDeadlines').filter(d => d.assignmentId !== id));
  },

  markSubmitted(id: string): Assignment {
    return this.update(id, { status: 'submitted', completedAt: Date.now() });
  },

  parse(req: { text: string; rubricText?: string; courseId?: string; dueDate?: number; title?: string }) {
    return parseAssignmentText(req);
  },
};
