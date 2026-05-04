import type { AcademicDeadline, AttentionAlert, Capture, StudyItem } from '@schema'

export type NotchFeatureId = 'today' | 'courses' | 'deadlines' | 'capture' | 'study' | 'alerts' | 'workspace' | 'timer' | 'settings'

export const NOTCH_FEATURE_ORDER: NotchFeatureId[] = [
  'today',
  'capture',
  'timer',
  'deadlines',
  'courses',
  'study',
  'alerts',
  'workspace',
  'settings',
]

export interface NotchStatusInput {
  alerts: AttentionAlert[]
  isRunning: boolean
  timerLabel: string
  captureFlash: boolean
  nextDeadline?: AcademicDeadline
  studyItems: StudyItem[]
}

export function getNotchLiveStatus(input: NotchStatusInput): string {
  const urgentAlert = input.alerts.find(alert => alert.priority === 'critical' || alert.priority === 'high')
  if (urgentAlert) return urgentAlert.title
  if (input.isRunning) return input.timerLabel
  if (input.captureFlash) return 'Capture saved'
  if (input.nextDeadline) return input.nextDeadline.title
  const dueStudy = getDueStudyItems(input.studyItems)[0]
  if (dueStudy) return dueStudy.front
  return 'Ready'
}

export interface NotchBadgeInput {
  dueTodayCount: number
  captures: Capture[]
  studyItems: StudyItem[]
  alerts: AttentionAlert[]
}

export function getNotchBadges(input: NotchBadgeInput): Partial<Record<NotchFeatureId, number>> {
  return {
    deadlines: input.dueTodayCount,
    capture: input.captures.length,
    study: getDueStudyItems(input.studyItems).length,
    alerts: input.alerts.length,
  }
}

export type NotchIdleChip =
  | { id: 'timer'; label: string }
  | { id: 'deadline'; label: string; deadline: AcademicDeadline }
  | { id: 'study'; label: string; dueCount: number }

export interface NotchIdleChipInput {
  timerLabel: string
  nextDeadline?: AcademicDeadline
  studyItems: StudyItem[]
  formatDeadline?: (deadline: AcademicDeadline) => string
}

export function getNotchIdleChips(input: NotchIdleChipInput): NotchIdleChip[] {
  // Idle row keeps to: timer + next deadline. The "N Reviews" chip
  // was removed per user request — the workspace Cards tab + Dashboard
  // Review-day CTA already surface the study queue, so the notch
  // doesn't need to repeat it next to the pill.
  const chips: NotchIdleChip[] = [{ id: 'timer', label: input.timerLabel }]
  if (input.nextDeadline) {
    chips.push({
      id: 'deadline',
      label: input.formatDeadline?.(input.nextDeadline) ?? input.nextDeadline.title,
      deadline: input.nextDeadline,
    })
  }
  return chips
}

function getDueStudyItems(studyItems: StudyItem[]): StudyItem[] {
  const now = Date.now()
  return studyItems.filter(item => !item.nextReviewAt || item.nextReviewAt <= now)
}

