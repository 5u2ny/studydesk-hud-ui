import React from 'react'
import type { NotchDockItem } from './NotchFeatureButton'

export function NotchPopover({
  item,
  children,
  onClose,
  onOpenWorkspace,
}: {
  item: NotchDockItem
  children: React.ReactNode
  onClose: () => void
  onOpenWorkspace: () => void
}) {
  return (
    <section
      className="studydesk-notch-popover island-expanded-region no-drag"
      id={`notch-popover-${item.id}`}
      role="region"
      aria-label={`${item.label} popover`}
    >
      <div className="studydesk-notch-active-title">
        <span aria-hidden="true">{item.icon}</span>
        <strong>{item.label}</strong>
        <em>{item.title}</em>
      </div>
      {children}
      <div className="island-popover-footer">
        <button onClick={onClose}>Close</button>
        <button onClick={onOpenWorkspace}>Open full workspace</button>
      </div>
    </section>
  )
}

