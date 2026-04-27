import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { ConfusionItem } from '../../../shared/schema/index';

export const confusionService = {
  list(opts?: { courseId?: string; includeResolved?: boolean }): ConfusionItem[] {
    let items = focusStore.get('confusionItems');
    if (opts?.courseId) items = items.filter(i => i.courseId === opts.courseId);
    if (!opts?.includeResolved) items = items.filter(i => i.status !== 'resolved');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },

  create(opts: Partial<ConfusionItem> & { question: string }): ConfusionItem {
    const item: ConfusionItem = {
      id: randomUUID(),
      courseId: opts.courseId,
      sourceCaptureId: opts.sourceCaptureId,
      question: opts.question.trim(),
      context: opts.context,
      status: opts.status ?? 'unresolved',
      nextStep: opts.nextStep,
      createdAt: Date.now(),
    };
    focusStore.addConfusionItem(item);
    return item;
  },

  update(id: string, patch: Partial<ConfusionItem>): ConfusionItem {
    focusStore.updateConfusionItem(id, patch);
    return focusStore.get('confusionItems').find(i => i.id === id)!;
  },

  resolve(id: string): ConfusionItem {
    return this.update(id, { status: 'resolved', resolvedAt: Date.now() });
  },
};
