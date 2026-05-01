import React from 'react'
import { cn } from '@shared/lib/utils'
import type { NotchFeatureId, NotchIdleChip } from './notchModel'
import { NotchDock } from './NotchDock'
import { NotchIdle } from './NotchIdle'
import { NotchPopover } from './NotchPopover'
import type { NotchDockItem } from './NotchFeatureButton'

export function NotchShell({
  activeFeature,
  hoverDock,
  captureFlash,
  isRunning,
  dockItems,
  idleChips,
  liveStatus,
  children,
  onRootMouseDown,
  onMouseEnter,
  onMouseLeave,
  onFocusCapture,
  onBlurCapture,
  onTimerClick,
  onFeatureClick,
  onDockKeyDown,
  setTriggerRef,
  onClosePopover,
  onOpenWorkspace,
}: {
  activeFeature: NotchFeatureId | null
  hoverDock: boolean
  captureFlash: boolean
  isRunning: boolean
  dockItems: NotchDockItem[]
  idleChips: NotchIdleChip[]
  liveStatus: string
  children: React.ReactNode
  onRootMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocusCapture: () => void
  onBlurCapture: (event: React.FocusEvent<HTMLDivElement>) => void
  onTimerClick: () => void
  onFeatureClick: (id: NotchFeatureId) => void
  onDockKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  setTriggerRef: (id: NotchFeatureId, node: HTMLButtonElement | null) => void
  onClosePopover: () => void
  onOpenWorkspace: () => void
}) {
  const activeItem = activeFeature ? dockItems.find(item => item.id === activeFeature) : undefined

  return (
    <div className="studydesk-notch-root" onMouseDown={onRootMouseDown}>
      <div
        className={cn(
          'studydesk-notch-shell',
          isRunning && 'is-running',
          captureFlash && 'capture-flash',
          hoverDock && !activeFeature && 'is-hover-dock',
          activeFeature && 'is-expanded',
        )}
        data-active-feature={activeFeature ?? undefined}
        data-state={activeFeature ? 'activePopover' : hoverDock ? 'hoverDock' : 'idle'}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        <div className="studydesk-notch-bar drag-region" role="group" aria-label="StudyDesk Notch">
          <NotchIdle chips={idleChips} liveStatus={liveStatus} onTimerClick={onTimerClick} />
          <NotchDock
            items={dockItems}
            activeFeature={activeFeature}
            setTriggerRef={setTriggerRef}
            onFeatureClick={onFeatureClick}
            onKeyDown={onDockKeyDown}
          />
          <div className="studydesk-notch-status" title={liveStatus}>{liveStatus}</div>
        </div>

        {activeItem && (
          <NotchPopover item={activeItem} onClose={onClosePopover} onOpenWorkspace={onOpenWorkspace}>
            {children}
          </NotchPopover>
        )}
      </div>
    </div>
  )
}
