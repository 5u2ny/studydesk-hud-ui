import type { CriticalEmailAlert } from '../../../shared/schema/index';
import type { FetchedEmail } from './imapClient';

const CRITICAL_PATTERNS: Array<[RegExp, CriticalEmailAlert['category'], string, number]> = [
  [/\b(action required|required action|respond by|confirmation required|verify)\b/i, 'immediate_action', 'Action is required', 0.9],
  [/\b(deadline|due|overdue|by \d{1,2}:\d{2}|11:59)\b/i, 'deadline', 'Deadline language detected', 0.85],
  [/\b(failed payment|payment failed|past due|financial aid|tuition|balance due)\b/i, 'financial_risk', 'Financial risk language detected', 0.9],
  [/\b(security|password reset|account access|login attempt|suspicious)\b/i, 'security', 'Account or security issue detected', 0.9],
  [/\b(interview|offer|application status|recruiter)\b/i, 'job', 'Job or interview message detected', 0.8],
  [/\b(professor|instructor|registrar|advisor|class|assignment|exam|quiz)\b/i, 'academic', 'Academic sender or topic detected', 0.75],
  [/\b(urgent|asap|immediately|important)\b/i, 'immediate_action', 'Urgent language detected', 0.8],
  [/\b(meeting changed|rescheduled|cancelled|canceled)\b/i, 'immediate_action', 'Schedule change detected', 0.78],
];

const NEGATIVE_PATTERNS = /\b(newsletter|promotion|sale|digest|unsubscribe|marketing|limited time|deal|coupon)\b/i;

function extractDeadline(text: string): number | undefined {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!match) return undefined;
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : new Date().getFullYear();
  return new Date(year, Number(match[1]) - 1, Number(match[2]), 23, 59, 0, 0).getTime();
}

export function classifyEmailRules(input: Pick<FetchedEmail, 'from' | 'subject' | 'body' | 'receivedAt'>): Omit<CriticalEmailAlert, 'id' | 'emailId' | 'status'> {
  const text = `${input.from}\n${input.subject}\n${input.body}`;
  let best: Omit<CriticalEmailAlert, 'id' | 'emailId' | 'status'> = {
    from: input.from,
    subject: input.subject,
    receivedAt: input.receivedAt.getTime(),
    alertLevel: 'normal',
    category: 'informational',
    reason: 'No critical academic or action pattern detected',
    confidence: 0.35,
  };

  for (const [pattern, category, reason, confidence] of CRITICAL_PATTERNS) {
    if (pattern.test(text) && confidence > best.confidence) {
      best = {
        from: input.from,
        subject: input.subject,
        receivedAt: input.receivedAt.getTime(),
        alertLevel: confidence >= 0.88 ? 'critical' : 'important',
        category,
        reason,
        nextAction: category === 'deadline' ? 'Review deadline and convert to task if needed' : 'Open Gmail and handle this message',
        deadlineDetected: extractDeadline(text),
        confidence,
      };
    }
  }

  if (NEGATIVE_PATTERNS.test(text) && best.alertLevel === 'normal') {
    return {
      ...best,
      alertLevel: 'ignore',
      category: 'promotional',
      reason: 'Marketing or digest language detected',
      confidence: 0.8,
    };
  }

  return best;
}
