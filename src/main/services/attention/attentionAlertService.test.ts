import { describe, expect, test } from 'vitest';
import { isActiveAttentionAlert } from './attentionAlertService';
import type { AttentionAlert } from '../../../shared/schema/index';

function alert(patch: Partial<AttentionAlert>): AttentionAlert {
  return {
    id: 'alert',
    sourceType: 'deadline',
    sourceId: 'deadline',
    title: 'Research draft',
    reason: 'Deadline is due within 24 hours.',
    actionLabel: 'Open deadline',
    priority: 'high',
    status: 'new',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe('isActiveAttentionAlert', () => {
  test('hides resolved, dismissed, and future-snoozed alerts', () => {
    const now = 1000;
    expect(isActiveAttentionAlert(alert({ status: 'resolved' }), now)).toBe(false);
    expect(isActiveAttentionAlert(alert({ status: 'dismissed' }), now)).toBe(false);
    expect(isActiveAttentionAlert(alert({ status: 'snoozed', snoozedUntil: 2000 }), now)).toBe(false);
  });

  test('shows new and expired snoozed alerts', () => {
    const now = 1000;
    expect(isActiveAttentionAlert(alert({ status: 'new' }), now)).toBe(true);
    expect(isActiveAttentionAlert(alert({ status: 'snoozed', snoozedUntil: 500 }), now)).toBe(true);
  });
});
