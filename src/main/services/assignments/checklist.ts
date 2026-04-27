import { randomUUID } from 'node:crypto';
import type { ChecklistItem } from '../../../shared/schema/index';

export const DEFAULT_SUBMISSION_CHECKLIST = [
  'Correct file name',
  'Correct file format',
  'Correct submission platform',
  'Rubric items covered',
  'Word count or page count checked',
  'Citations included',
  'Screenshots or attachments included',
  'Draft proofread',
  'Uploaded before deadline',
  'Submission confirmation saved',
];

export function createChecklistItem(text: string, source: ChecklistItem['source'] = 'manual'): ChecklistItem {
  return {
    id: randomUUID(),
    text,
    completed: false,
    source,
    createdAt: Date.now(),
  };
}

export function defaultSubmissionChecklist(): ChecklistItem[] {
  return DEFAULT_SUBMISSION_CHECKLIST.map(text => createChecklistItem(text, 'default'));
}
