import React from 'react'
import { cn } from '@shared/lib/utils'
import type { NotchFeatureId, NotchIdleChip } from './notchModel'
import { NotchIdle } from './NotchIdle'
import { NotchPopover } from './NotchPopover'
import type { NotchDockItem } from './NotchFeatureButton'

export function NotchShell({
  activeFeature,
  captureFlash,
  isRunning,
  dockItems,
  idleChips,
  liveStatus,
  remainingSeconds,
  totalSeconds,
  phaseLabel,
  children,
  onRootMouseDown,
  onCapClick,
  onTimerClick,
  onFeatureClick,
  setTriggerRef,
  onClosePopover,
  onOpenWorkspace,
}: {
  activeFeature: NotchFeatureId | null
  captureFlash: boolean
  isRunning: boolean
  dockItems: NotchDockItem[]
  idleChips: NotchIdleChip[]
  liveStatus: string
  remainingSeconds: number
  totalSeconds: number
  phaseLabel: string
  children: React.ReactNode
  onRootMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  onCapClick: () => void
  onTimerClick: () => void
  onFeatureClick: (id: NotchFeatureId) => void
  setTriggerRef: (id: NotchFeatureId, node: HTMLButtonElement | null) => void
  onClosePopover: () => void
  onOpenWorkspace: () => void
}) {
  const activeItem = activeFeature ? dockItems.find(item => item.id === activeFeature) : undefined

  return (
    <div
      className={cn('studydesk-notch-root', activeItem && 'has-popover')}
      onMouseDown={onRootMouseDown}
    >
      {/* Fixed-width cap -- never changes shape. Click opens popover. */}
      <div
        className={cn(
          'studydesk-notch-shell',
          isRunning && 'is-running',
          captureFlash && 'capture-flash',
          activeFeature && 'is-expanded',
        )}
        data-active-feature={activeFeature ?? undefined}
        data-state={activeFeature ? 'activePopover' : 'idle'}
        onClick={onCapClick}
        role="button"
        tabIndex={0}
        aria-label="Open StudyDesk"
      >
        <div className="studydesk-notch-bar" role="group" aria-label="StudyDesk Notch">
          <NotchIdle
            chips={idleChips}
            liveStatus={liveStatus}
            onTimerClick={onTimerClick}
            remainingSeconds={remainingSeconds}
            totalSeconds={totalSeconds}
            phaseLabel={phaseLabel}
            isRunning={isRunning}
          />
        </div>
      </div>

      {/* Popover lives OUTSIDE the shell -- appears as a floating Liquid
          Glass panel below the notch, with a transparent gap, like a
          macOS widget. Dock icons are inside the popover header. */}
      {activeItem && (
        <NotchPopover
          item={activeItem}
          dockItems={dockItems}
          activeFeature={activeFeature}
          setTriggerRef={setTriggerRef}
          onFeatureClick={onFeatureClick}
          onClose={onClosePopover}
          onOpenWorkspace={onOpenWorkspace}
        >
          {children}
        </NotchPopover>
      )}
    </div>
  )
}
