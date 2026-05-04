import React from 'react'
import type { NotchIdleChip } from './notchModel'
import { NotchTimerRing } from './NotchTimerRing'

export function NotchIdle({
  chips,
  liveStatus,
  onTimerClick,
  remainingSeconds,
  totalSeconds,
  phaseLabel,
  isRunning,
}: {
  chips: NotchIdleChip[]
  liveStatus: string
  onTimerClick: () => void
  remainingSeconds: number
  totalSeconds: number
  phaseLabel: string
  isRunning: boolean
}) {
  // Non-timer chips (deadline, study). These render as small subdued
  // pills next to the ring — kept narrow so the left wing stays compact.
  // While the timer is running the ring already conveys phase + time,
  // and adding an unreadable truncated chip ("20:00 is Re...") next to
  // it just adds visual noise. Hide aux chips during a running timer.
  const auxChips = isRunning ? [] : chips.filter(chip => chip.id !== 'timer')

  return (
    <div className="studydesk-notch-idle" aria-label="StudyDesk live activity" title={liveStatus}>
      <NotchTimerRing
        remainingSeconds={remainingSeconds}
        totalSeconds={totalSeconds}
        phaseLabel={phaseLabel}
        isRunning={isRunning}
        onClick={onTimerClick}
      />
      {auxChips.map(chip => (
        <span key={chip.id} className={`studydesk-notch-chip ${chip.id}`} title={chip.label}>
          {chip.label}
        </span>
      ))}
    </div>
  )
}
