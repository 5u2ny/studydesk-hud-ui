import type { AcademicDeadline, Assignment, ChecklistItem } from '../../../shared/schema/index';
import { createChecklistItem } from './checklist';

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export function extractDate(text: string, fallbackYear = new Date().getFullYear()): number | undefined {
  const monthName = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?(?:.*?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i);
  if (monthName) {
    const month = MONTHS[monthName[1].toLowerCase().replace('.', '')];
    const day = Number(monthName[2]);
    const year = monthName[3] ? Number(monthName[3]) : fallbackYear;
    let hour = monthName[4] ? Number(monthName[4]) : 23;
    const minute = monthName[5] ? Number(monthName[5]) : 59;
    const meridiem = monthName[6]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return new Date(year, month, day, hour, minute, 0, 0).getTime();
  }

  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:.*?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    const day = Number(numeric[2]);
    const rawYear = numeric[3] ? Number(numeric[3]) : fallbackYear;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    let hour = numeric[4] ? Number(numeric[4]) : 23;
    const minute = numeric[5] ? Number(numeric[5]) : 59;
    const meridiem = numeric[6]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return new Date(year, month, day, hour, minute, 0, 0).getTime();
  }

  return undefined;
}

function checklistFromMatches(text: string, patterns: Array<[RegExp, string]>, source: ChecklistItem['source']): ChecklistItem[] {
  return patterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => createChecklistItem(label, source));
}

export function parseAssignmentText(req: {
  text: string;
  rubricText?: string;
  courseId?: string;
  dueDate?: number;
  title?: string;
}): {
  title: string;
  dueDate?: number;
  deliverables: ChecklistItem[];
  formatRequirements: ChecklistItem[];
  rubricItems: ChecklistItem[];
  submissionChecklist: ChecklistItem[];
} {
  const text = req.text;
  const firstLine = text.split(/\n+/).map(s => s.trim()).find(Boolean);
  const dueDate = req.dueDate ?? extractDate(text);
  const deliverables = checklistFromMatches(text, [
    [/\bessay|paper|report\b/i, 'Write the required paper or report'],
    [/\bpresentation|slides\b/i, 'Prepare presentation or slides'],
    [/\bcode|program|repository|github\b/i, 'Submit required code or repository'],
    [/\bdata|dataset|spreadsheet\b/i, 'Include required data or dataset'],
    [/\breflection\b/i, 'Include reflection component'],
  ], 'parser');
  const formatRequirements = checklistFromMatches(text, [
    [/\bapa\b/i, 'Use APA citation style'],
    [/\bmla\b/i, 'Use MLA citation style'],
    [/\bchicago\b/i, 'Use Chicago citation style'],
    [/\bpdf\b/i, 'Submit as PDF'],
    [/\bdocx?\b/i, 'Submit as Word document'],
    [/\b\d+\s*pages?\b/i, text.match(/\b\d+\s*pages?\b/i)?.[0] ?? 'Check page count'],
    [/\b\d+\s*words?\b/i, text.match(/\b\d+\s*words?\b/i)?.[0] ?? 'Check word count'],
  ], 'parser');
  const rubricItems = (req.rubricText ?? '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 6)
    .slice(0, 12)
    .map(line => createChecklistItem(line, 'rubric'));

  return {
    title: req.title?.trim() || firstLine?.slice(0, 80) || 'Untitled assignment',
    dueDate,
    deliverables: deliverables.length ? deliverables : [createChecklistItem('Review assignment prompt and identify deliverables', 'parser')],
    formatRequirements,
    rubricItems,
    submissionChecklist: [],
  };
}

export type AssignmentWithDeadline = {
  assignment: Assignment;
  deadline?: AcademicDeadline;
};
