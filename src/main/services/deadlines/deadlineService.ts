import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { AcademicDeadline } from '../../../shared/schema/index';

export function sortDeadlines(items: AcademicDeadline[]): AcademicDeadline[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    const aOverdue = a.deadlineAt < now;
    const bOverdue = b.deadlineAt < now;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return a.deadlineAt - b.deadlineAt;
  });
}

export const deadlineService = {
  list(opts?: { includeCompleted?: boolean; courseId?: string }): AcademicDeadline[] {
    let items = focusStore.get('academicDeadlines');
    if (!opts?.includeCompleted) items = items.filter(d => !d.completed);
    if (opts?.courseId) items = items.filter(d => d.courseId === opts.courseId);
    return sortDeadlines(items);
  },

  create(opts: Partial<AcademicDeadline> & { title: string; deadlineAt: number }): AcademicDeadline {
    const now = Date.now();
    const deadline: AcademicDeadline = {
      id: randomUUID(),
      courseId: opts.courseId,
      assignmentId: opts.assignmentId,
      title: opts.title.trim(),
      deadlineAt: opts.deadlineAt,
      type: opts.type ?? 'other',
      sourceType: opts.sourceType ?? 'manual',
      sourceId: opts.sourceId,
      confidence: opts.confidence,
      confirmed: opts.confirmed ?? true,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    focusStore.addAcademicDeadline(deadline);
    return deadline;
  },

  update(id: string, patch: Partial<AcademicDeadline>): AcademicDeadline {
    focusStore.updateAcademicDeadline(id, patch);
    return focusStore.get('academicDeadlines').find(d => d.id === id)!;
  },

  delete(id: string): void {
    focusStore.set('academicDeadlines', focusStore.get('academicDeadlines').filter(d => d.id !== id));
  },

  complete(id: string): AcademicDeadline {
    return this.update(id, { completed: true });
  },
};
