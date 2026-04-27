import type { AcademicDeadline, AttentionAlert, Capture, StudyItem } from '@schema'

export type IslandFeatureId = 'today' | 'courses' | 'deadlines' | 'capture' | 'study' | 'alerts' | 'workspace' | 'settings'

export const ISLAND_FEATURE_ORDER: IslandFeatureId[] = [
  'today',
  'courses',
  'deadlines',
  'capture',
  'study',
  'alerts',
  'workspace',
  'settings',
]

export interface IslandStatusInput {
  alerts: AttentionAlert[]
  isRunning: boolean
  timerLabel: string
  captureFlash: boolean
  nextDeadline?: AcademicDeadline
  studyItems: StudyItem[]
}

export function getIslandLiveStatus(input: IslandStatusInput): string {
  const urgentAlert = input.alerts.find(alert => alert.priority === 'critical' || alert.priority === 'high')
  if (urgentAlert) return urgentAlert.title
  if (input.isRunning) return input.timerLabel
  if (input.captureFlash) return 'Capture saved'
  if (input.nextDeadline) return input.nextDeadline.title
  const dueStudy = input.studyItems.find(item => !item.nextReviewAt || item.nextReviewAt <= Date.now())
  if (dueStudy) return dueStudy.front
  return 'Ready'
}

export interface IslandBadgeInput {
  dueTodayCount: number
  captures: Capture[]
  studyItems: StudyItem[]
  alerts: AttentionAlert[]
}

export function getIslandBadges(input: IslandBadgeInput): Partial<Record<IslandFeatureId, number>> {
  return {
    deadlines: input.dueTodayCount,
    capture: input.captures.length,
    study: input.studyItems.filter(item => !item.nextReviewAt || item.nextReviewAt <= Date.now()).length,
    alerts: input.alerts.length,
  }
}
