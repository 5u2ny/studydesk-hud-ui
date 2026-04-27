import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { ClassSession } from '../../../shared/schema/index';

export const classSessionService = {
  list(opts?: { courseId?: string }): ClassSession[] {
    let sessions = focusStore.get('classSessions');
    if (opts?.courseId) sessions = sessions.filter(s => s.courseId === opts.courseId);
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  },

  get(id: string): ClassSession | undefined {
    return focusStore.get('classSessions').find(s => s.id === id);
  },

  start(opts: { courseId?: string; title: string }): ClassSession {
    const now = Date.now();
    const session: ClassSession = {
      id: randomUUID(),
      courseId: opts.courseId,
      title: opts.title.trim() || 'Class session',
      startedAt: now,
      notes: [],
      captureIds: [],
      professorHints: [],
      examHints: [],
      assignmentHints: [],
      questions: [],
      actionItems: [],
      createdAt: now,
      updatedAt: now,
    };
    focusStore.addClassSession(session);
    return session;
  },

  update(id: string, patch: Partial<ClassSession>): ClassSession {
    focusStore.updateClassSession(id, patch);
    return this.get(id)!;
  },

  end(id: string, patch?: Partial<ClassSession>): ClassSession {
    return this.update(id, { ...patch, endedAt: Date.now() });
  },
};
