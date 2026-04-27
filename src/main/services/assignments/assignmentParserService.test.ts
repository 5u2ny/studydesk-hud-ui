import { describe, expect, test } from 'vitest';
import { extractDate, parseAssignmentText } from './assignmentParserService';

describe('assignmentParserService', () => {
  test('extracts common due date patterns', () => {
    const ts = extractDate('Due January 12 by 11:59 PM', 2026);
    expect(new Date(ts!).getFullYear()).toBe(2026);
    expect(new Date(ts!).getMonth()).toBe(0);
    expect(new Date(ts!).getDate()).toBe(12);
    expect(new Date(ts!).getHours()).toBe(23);
    expect(new Date(ts!).getMinutes()).toBe(59);
  });

  test('turns assignment prompt into editable checklist buckets', () => {
    const parsed = parseAssignmentText({
      text: 'Research Paper\nDue 1/12/2026 by 11:59 PM\nWrite a 5 page paper in APA format and submit as PDF.',
      rubricText: 'Argument quality\nEvidence and citations',
    });
    expect(parsed.title).toBe('Research Paper');
    expect(parsed.dueDate).toBeDefined();
    expect(parsed.deliverables.map(i => i.text)).toContain('Write the required paper or report');
    expect(parsed.formatRequirements.map(i => i.text)).toContain('Use APA citation style');
    expect(parsed.formatRequirements.map(i => i.text)).toContain('Submit as PDF');
    expect(parsed.rubricItems).toHaveLength(2);
  });
});
