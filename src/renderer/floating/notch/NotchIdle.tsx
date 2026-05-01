import React from 'react'
import type { NotchIdleChip } from './notchModel'

export function NotchIdle({
  chips,
  liveStatus,
  onTimerClick,
}: {
  chips: NotchIdleChip[]
  liveStatus: string
  onTimerClick: () => void
}) {
  return (
    <div className="studydesk-notch-idle" aria-label="StudyDesk live activity" title={liveStatus}>
      {chips.map(chip => {
        if (chip.id === 'timer') {
          return (
            <button key={chip.id} className="studydesk-notch-chip timer no-drag" onClick={onTimerClick} aria-label="Toggle timer">
              {chip.label}
            </button>
          )
        }
        return (
          <span key={chip.id} className={`studydesk-notch-chip ${chip.id}`}>
            {chip.label}
          </span>
        )
      })}
    </div>
  )
}

