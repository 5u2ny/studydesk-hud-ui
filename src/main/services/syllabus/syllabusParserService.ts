import type { AcademicDeadline, Course } from '../../../shared/schema/index';
import { extractDate } from '../assignments/assignmentParserService';

export interface SyllabusParseResult {
  course: Partial<Course>;
  deadlines: Array<Partial<AcademicDeadline> & { title: string; deadlineAt: number }>;
  notes: string[];
}

function inferDeadlineType(line: string): AcademicDeadline['type'] {
  if (/\bexam|midterm|final\b/i.test(line)) return 'exam';
  if (/\bquiz\b/i.test(line)) return 'quiz';
  if (/\bread|chapter|article\b/i.test(line)) return 'reading';
  if (/\bproject\b/i.test(line)) return 'project';
  if (/\bpresentation\b/i.test(line)) return 'presentation';
  if (/\boffice hours\b/i.test(line)) return 'office_hours';
  return 'assignment';
}

function titleFromLine(line: string): string {
  return line
    .replace(/\b(due|by|on)\b/ig, '')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Academic deadline';
}

export const syllabusParserService = {
  parse(req: { text: string; courseId?: string; term?: string }): SyllabusParseResult {
    const text = req.text;
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const code = text.match(/\b[A-Z]{2,5}\s?\d{3,4}[A-Z]?\b/)?.[0];
    const professorLine = lines.find(line => /\b(professor|instructor)\b/i.test(line));
    const officeHoursLine = lines.find(line => /\boffice hours\b/i.test(line));
    const titleLine = lines.find(line => line !== professorLine && line !== officeHoursLine && line.length > 4);

    const deadlines = lines
      .map(line => ({ line, deadlineAt: extractDate(line) }))
      .filter((item): item is { line: string; deadlineAt: number } => Boolean(item.deadlineAt))
      .map(({ line, deadlineAt }) => ({
        title: titleFromLine(line),
        deadlineAt,
        type: inferDeadlineType(line),
        sourceType: 'syllabus' as const,
        courseId: req.courseId,
        confidence: /\bdue|exam|quiz|final|project|presentation\b/i.test(line) ? 0.8 : 0.55,
        confirmed: false,
        completed: false,
      }));

    return {
      course: {
        code,
        name: titleLine?.replace(code ?? '', '').trim() || code || 'Imported course',
        professorName: professorLine?.replace(/\b(professor|instructor)\b:?/i, '').trim(),
        professorEmail: email,
        officeHours: officeHoursLine,
        term: req.term,
      },
      deadlines,
      notes: [],
    };
  },

  confirmImport(req: { course?: Partial<Course> & { name?: string }; deadlines: Array<Partial<AcademicDeadline> & { title: string; deadlineAt: number; confirmed?: boolean }> }) {
    return req;
  },
};
