import type { FetchedEmail } from './imapClient';
import type { EmailDigestItem } from '../../../shared/schema/index';
import { classifyEmailRules } from './emailRuleClassifier';

export async function triageEmail(e: FetchedEmail): Promise<Partial<EmailDigestItem>> {
  const classified = classifyEmailRules(e);
  return {
    importance: classified.alertLevel === 'critical' ? 'high' : classified.alertLevel === 'important' ? 'medium' : 'low',
    summary: classified.reason,
  };
}
