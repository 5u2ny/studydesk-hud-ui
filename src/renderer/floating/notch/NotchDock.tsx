import React from 'react'
import type { NotchFeatureId } from './notchModel'
import { NotchFeatureButton, type NotchDockItem } from './NotchFeatureButton'

export function NotchDock({
  items,
  activeFeature,
  setTriggerRef,
  onFeatureClick,
  onKeyDown,
}: {
  items: NotchDockItem[]
  activeFeature: NotchFeatureId | null
  setTriggerRef: (id: NotchFeatureId, node: HTMLButtonElement | null) => void
  onFeatureClick: (id: NotchFeatureId) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}) {
  return (
    <nav className="studydesk-notch-dock no-drag" aria-label="StudyDesk features" onKeyDown={onKeyDown}>
      {items.map(item => (
        <NotchFeatureButton
          key={item.id}
          item={item}
          active={activeFeature === item.id}
          setRef={node => setTriggerRef(item.id, node)}
          onClick={() => onFeatureClick(item.id)}
        />
      ))}
    </nav>
  )
}

