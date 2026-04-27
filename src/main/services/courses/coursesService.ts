import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { Course } from '../../../shared/schema/index';

export const coursesService = {
  list(opts?: { includeArchived?: boolean }): Course[] {
    const courses = focusStore.get('courses');
    return opts?.includeArchived ? courses : courses.filter(c => !c.archived);
  },

  get(id: string): Course | undefined {
    return focusStore.get('courses').find(c => c.id === id);
  },

  create(opts: Partial<Course> & { name: string }): Course {
    const now = Date.now();
    const course: Course = {
      id: randomUUID(),
      name: opts.name.trim(),
      code: opts.code?.trim() || undefined,
      professorName: opts.professorName?.trim() || undefined,
      professorEmail: opts.professorEmail?.trim() || undefined,
      officeHours: opts.officeHours?.trim() || undefined,
      location: opts.location?.trim() || undefined,
      term: opts.term?.trim() || undefined,
      color: opts.color,
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    focusStore.addCourse(course);
    return course;
  },

  update(id: string, patch: Partial<Course>): Course {
    focusStore.updateCourse(id, patch);
    return this.get(id)!;
  },

  archive(id: string): Course {
    return this.update(id, { archived: true });
  },
};
