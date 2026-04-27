import { describe, expect, test } from 'vitest';
import { classifyEmailRules } from './emailRuleClassifier';

describe('classifyEmailRules', () => {
  test('marks action-required academic email as critical or important', () => {
    const result = classifyEmailRules({
      from: 'Professor Smith <prof@example.edu>',
      subject: 'Action required for your assignment',
      body: 'Please confirm by 1/12/2026.',
      receivedAt: new Date('2026-01-01T12:00:00Z'),
    });
    expect(['critical', 'important']).toContain(result.alertLevel);
    expect(result.category).toBe('immediate_action');
    expect(result.reason).toMatch(/Action/);
  });

  test('ignores marketing digest language', () => {
    const result = classifyEmailRules({
      from: 'Deals <sale@example.com>',
      subject: 'Weekly promotion digest',
      body: 'Unsubscribe any time.',
      receivedAt: new Date(),
    });
    expect(result.alertLevel).toBe('ignore');
    expect(result.category).toBe('promotional');
  });
});
