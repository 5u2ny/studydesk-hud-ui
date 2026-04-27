import { describe, expect, test } from 'vitest';
import { sortDeadlines } from './deadlineService';
import type { AcademicDeadline } from '../../../shared/schema/index';

function deadline(patch: Partial<AcademicDeadline>): AcademicDeadline {
  return {
    id: patch.id ?? 'id',
    title: patch.title ?? 'Deadline',
    deadlineAt: patch.deadlineAt ?? Date.now(),
    type: patch.type ?? 'assignment',
    confirmed: patch.confirmed ?? true,
    completed: patch.completed ?? false,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('sortDeadlines', () => {
  test('puts active overdue and nearest confirmed deadlines first', () => {
    const now = Date.now();
    const sorted = sortDeadlines([
      deadline({ id: 'later', deadlineAt: now + 5 * 86_400_000 }),
      deadline({ id: 'done', deadlineAt: now - 1000, completed: true }),
      deadline({ id: 'overdue', deadlineAt: now - 1000 }),
      deadline({ id: 'unconfirmed', deadlineAt: now + 1000, confirmed: false }),
    ]);
    expect(sorted.map(d => d.id)).toEqual(['overdue', 'later', 'unconfirmed', 'done']);
  });
});
