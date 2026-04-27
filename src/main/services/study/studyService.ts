import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { StudyItem } from '../../../shared/schema/index';

const REVIEW_INTERVALS: Record<NonNullable<StudyItem['difficulty']>, number> = {
  again: 10 * 60_000,
  hard: 24 * 60 * 60_000,
  good: 3 * 24 * 60 * 60_000,
  easy: 7 * 24 * 60 * 60_000,
};

export const studyService = {
  list(opts?: { courseId?: string; dueOnly?: boolean }): StudyItem[] {
    let items = focusStore.get('studyItems');
    if (opts?.courseId) items = items.filter(i => i.courseId === opts.courseId);
    if (opts?.dueOnly) items = items.filter(i => !i.nextReviewAt || i.nextReviewAt <= Date.now());
    return items.sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
  },

  create(opts: Partial<StudyItem> & { front: string; type?: StudyItem['type'] }): StudyItem {
    const now = Date.now();
    const item: StudyItem = {
      id: randomUUID(),
      courseId: opts.courseId,
      sourceCaptureId: opts.sourceCaptureId,
      type: opts.type ?? 'flashcard',
      front: opts.front.trim(),
      back: opts.back,
      explanation: opts.explanation,
      difficulty: opts.difficulty,
      nextReviewAt: opts.nextReviewAt ?? now,
      reviewCount: opts.reviewCount ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    focusStore.addStudyItem(item);
    return item;
  },

  update(id: string, patch: Partial<StudyItem>): StudyItem {
    focusStore.updateStudyItem(id, patch);
    return focusStore.get('studyItems').find(i => i.id === id)!;
  },

  review(id: string, difficulty: NonNullable<StudyItem['difficulty']>): StudyItem {
    const item = focusStore.get('studyItems').find(i => i.id === id)!;
    return this.update(id, {
      difficulty,
      reviewCount: item.reviewCount + 1,
      nextReviewAt: Date.now() + REVIEW_INTERVALS[difficulty],
    });
  },

  delete(id: string): void {
    focusStore.set('studyItems', focusStore.get('studyItems').filter(i => i.id !== id));
  },
};
