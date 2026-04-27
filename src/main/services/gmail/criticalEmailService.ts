import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import { todoService } from '../todo/todoService';
import type { CriticalEmailAlert } from '../../../shared/schema/index';
import type { FetchedEmail } from './imapClient';
import { classifyEmailRules } from './emailRuleClassifier';

function senderMatches(sender: string, list: string[]): boolean {
  const lower = sender.toLowerCase();
  return list.some(item => item && lower.includes(item.toLowerCase()));
}

export function isActiveCriticalAlert(alert: CriticalEmailAlert, now = Date.now()): boolean {
  if (['dismissed', 'resolved', 'converted_to_task'].includes(alert.status)) return false;
  if (alert.status === 'snoozed' && alert.snoozedUntil && alert.snoozedUntil > now) return false;
  return true;
}

export const criticalEmailService = {
  list(opts?: { includeResolved?: boolean }): CriticalEmailAlert[] {
    let alerts = focusStore.get('criticalEmailAlerts');
    if (!opts?.includeResolved) {
      alerts = alerts.filter(a => isActiveCriticalAlert(a));
    }
    return alerts.sort((a, b) => b.receivedAt - a.receivedAt);
  },

  ingestEmail(email: FetchedEmail): CriticalEmailAlert | undefined {
    const settings = focusStore.getSettings().criticalEmailRules;
    if (senderMatches(email.from, settings.neverAlertSenders)) return undefined;

    const classified = classifyEmailRules(email);
    if (senderMatches(email.from, settings.alwaysAlertSenders)) {
      classified.alertLevel = 'critical';
      classified.category = 'direct_human';
      classified.reason = 'Sender is on the always alert list';
      classified.confidence = 1;
    }
    if (!['critical', 'important'].includes(classified.alertLevel)) return undefined;

    const existing = focusStore.get('criticalEmailAlerts').find(a => a.emailId === String(email.uid));
    if (existing) return existing;

    const alert: CriticalEmailAlert = {
      id: randomUUID(),
      emailId: String(email.uid),
      ...classified,
      status: 'new',
    };
    focusStore.addCriticalEmailAlert(alert);
    return alert;
  },

  snooze(id: string, snoozedUntil: number): CriticalEmailAlert {
    focusStore.updateCriticalEmailAlert(id, { status: 'snoozed', snoozedUntil });
    return focusStore.get('criticalEmailAlerts').find(a => a.id === id)!;
  },

  dismiss(id: string): CriticalEmailAlert {
    focusStore.updateCriticalEmailAlert(id, { status: 'dismissed' });
    return focusStore.get('criticalEmailAlerts').find(a => a.id === id)!;
  },

  resolve(id: string): CriticalEmailAlert {
    focusStore.updateCriticalEmailAlert(id, { status: 'resolved' });
    return focusStore.get('criticalEmailAlerts').find(a => a.id === id)!;
  },

  convertToTask(id: string): CriticalEmailAlert {
    const alert = focusStore.get('criticalEmailAlerts').find(a => a.id === id)!;
    const task = todoService.create({
      text: alert.nextAction ? `${alert.nextAction}: ${alert.subject}` : `Handle email: ${alert.subject}`,
      category: 'Critical Alerts',
    });
    focusStore.updateCriticalEmailAlert(id, { status: 'converted_to_task', createdTaskId: task.id });
    return focusStore.get('criticalEmailAlerts').find(a => a.id === id)!;
  },
};
