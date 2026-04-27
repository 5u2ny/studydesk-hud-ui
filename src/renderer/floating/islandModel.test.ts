import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AcademicDeadline, AttentionAlert, StudyItem } from '@schema'
import { getIslandBadges, getIslandLiveStatus } from './islandModel'

const now = new Date('2026-04-27T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

function alert(priority: AttentionAlert['priority'], title: string): AttentionAlert {
  return {
    id: title,
    sourceType: 'deadline',
    title,
    reason: 'Needs attention',
    actionLabel: 'Open',
    priority,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  }
}

function deadline(title: string): AcademicDeadline {
  return {
    id: title,
    title,
    deadlineAt: now,
    type: 'assignment',
    confirmed: true,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }
}

function study(front: string, nextReviewAt?: number): StudyItem {
  return {
    id: front,
    type: 'flashcard',
    front,
    reviewCount: 0,
    nextReviewAt,
    createdAt: now,
    updatedAt: now,
  }
}

describe('getIslandLiveStatus', () => {
  test('uses the locked priority order for HUD status', () => {
    expect(getIslandLiveStatus({
      alerts: [alert('high', 'Deadline risk')],
      isRunning: true,
      timerLabel: '24:00 focus',
      captureFlash: true,
      nextDeadline: deadline('Paper draft'),
      studyItems: [study('Review queue')],
    })).toBe('Deadline risk')

    expect(getIslandLiveStatus({
      alerts: [],
      isRunning: true,
      timerLabel: '24:00 focus',
      captureFlash: true,
      nextDeadline: deadline('Paper draft'),
      studyItems: [study('Review queue')],
    })).toBe('24:00 focus')

    expect(getIslandLiveStatus({
      alerts: [],
      isRunning: false,
      timerLabel: '24:00 focus',
      captureFlash: true,
      nextDeadline: deadline('Paper draft'),
      studyItems: [study('Review queue')],
    })).toBe('Capture saved')
  })

  test('falls back from next deadline to due study item to ready', () => {
    expect(getIslandLiveStatus({
      alerts: [],
      isRunning: false,
      timerLabel: '24:00 focus',
      captureFlash: false,
      nextDeadline: deadline('Paper draft'),
      studyItems: [study('Review queue')],
    })).toBe('Paper draft')

    expect(getIslandLiveStatus({
      alerts: [],
      isRunning: false,
      timerLabel: '24:00 focus',
      captureFlash: false,
      studyItems: [study('Review queue', now - 1)],
    })).toBe('Review queue')

    expect(getIslandLiveStatus({
      alerts: [],
      isRunning: false,
      timerLabel: '24:00 focus',
      captureFlash: false,
      studyItems: [study('Later', now + 1)],
    })).toBe('Ready')
  })
})

describe('getIslandBadges', () => {
  test('counts due work, captures, review queue, and local alerts', () => {
    expect(getIslandBadges({
      dueTodayCount: 2,
      captures: [{ id: 'c1' } as any, { id: 'c2' } as any],
      studyItems: [study('Due', now), study('Later', now + 1)],
      alerts: [alert('medium', 'Alert')],
    })).toEqual({
      deadlines: 2,
      capture: 2,
      study: 1,
      alerts: 1,
    })
  })
})
