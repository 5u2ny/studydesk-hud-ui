import { describe, expect, test } from 'vitest';
import { isActiveCriticalAlert } from './criticalEmailService';
import type { CriticalEmailAlert } from '../../../shared/schema/index';

function alert(patch: Partial<CriticalEmailAlert>): CriticalEmailAlert {
  return {
    id: 'alert',
    emailId: 'email',
    from: 'Professor <prof@example.edu>',
    subject: 'Action required',
    receivedAt: 1,
    alertLevel: 'critical',
    category: 'immediate_action',
    reason: 'Action is required',
    confidence: 0.9,
    status: 'new',
    ...patch,
  };
}

describe('isActiveCriticalAlert', () => {
  test('hides resolved, dismissed, converted, and future-snoozed alerts', () => {
    const now = 1000;
    expect(isActiveCriticalAlert(alert({ status: 'resolved' }), now)).toBe(false);
    expect(isActiveCriticalAlert(alert({ status: 'dismissed' }), now)).toBe(false);
    expect(isActiveCriticalAlert(alert({ status: 'converted_to_task' }), now)).toBe(false);
    expect(isActiveCriticalAlert(alert({ status: 'snoozed', snoozedUntil: 2000 }), now)).toBe(false);
  });

  test('shows new, alerted, and expired snoozed alerts', () => {
    const now = 1000;
    expect(isActiveCriticalAlert(alert({ status: 'new' }), now)).toBe(true);
    expect(isActiveCriticalAlert(alert({ status: 'alerted' }), now)).toBe(true);
    expect(isActiveCriticalAlert(alert({ status: 'snoozed', snoozedUntil: 500 }), now)).toBe(true);
  });
});
