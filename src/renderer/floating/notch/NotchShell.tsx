import React from 'react'
import { cn } from '@shared/lib/utils'
import type { NotchFeatureId, NotchIdleChip } from './notchModel'
import { NotchIdle } from './NotchIdle'
import { NotchPopover } from './NotchPopover'
import { NotchFeatureButton, type NotchDockItem } from './NotchFeatureButton'

export function NotchShell({
  activeFeature,
  captureFlash,
  isRunning,
  isHovering,
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
  onMouseEnter,
  onMouseLeave,
  setTriggerRef,
  onClosePopover,
  onOpenWorkspace,
}: {
  activeFeature: NotchFeatureId | null
  captureFlash: boolean
  isRunning: boolean
  isHovering: boolean
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
  onMouseEnter: () => void
  onMouseLeave: () => void
  setTriggerRef: (id: NotchFeatureId, node: HTMLButtonElement | null) => void
  onClosePopover: () => void
  onOpenWorkspace: () => void
}) {
  const activeItem = activeFeature ? dockItems.find(item => item.id === activeFeature) : undefined
  const showWings = isHovering || !!activeFeature
  return (
    <div
      className={cn('studydesk-notch-root', activeItem && 'has-popover')}
      onMouseDown={onRootMouseDown}
    >
      {/* Three-part layout: left wing | center cap (blank) | right wing.
          Wings appear on hover; cap is always blank (physical notch area). */}
      <div
        className={cn(
          'studydesk-notch-shell',
          isRunning && 'is-running',
          captureFlash && 'capture-flash',
          showWings && 'is-hover-dock',
          activeFeature && 'is-expanded',
        )}
        data-active-feature={activeFeature ?? undefined}
        data-state={activeFeature ? 'activePopover' : 'idle'}
        role="button"
        tabIndex={0}
        aria-label="Open StudyDesk"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Left wing: timer -- visible on hover */}
        <div className="studydesk-notch-wing-left" onClick={onCapClick}>
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

        {/* Center cap: physical notch area -- always blank black */}
        <div className="studydesk-notch-cap" onClick={onCapClick} />

        {/* Right wing: 4 feature icons -- visible on hover */}
        <nav
          className="studydesk-notch-dock-right"
          aria-label="StudyDesk features"
        >
          {dockItems.map(item => (
            <NotchFeatureButton
              key={item.id}
              item={item}
              active={activeFeature === item.id}
              setRef={node => setTriggerRef(item.id, node)}
              onClick={() => { onFeatureClick(item.id) }}
            />
          ))}
        </nav>
      </div>

      {/* Popover below the notch */}
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
