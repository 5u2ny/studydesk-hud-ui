import React from 'react'
import type { NotchFeatureId } from './notchModel'
import { NotchFeatureButton, type NotchDockItem } from './NotchFeatureButton'

/*
 * Floating Liquid-Glass widget that appears below the notch when the
 * cap is clicked. Dock icons live in the header row for feature
 * switching -- they no longer appear in the cap itself.
 *
 *   +----------------------------------------------+
 *   | @  Today   [deadlines] [settings]   =>   X   |   header + dock
 *   | -------------------------------------------  |
 *   |  [content]                                   |   children flow flush
 *   |                                              |
 *   +----------------------------------------------+
 */
export function NotchPopover({
  item,
  dockItems,
  activeFeature,
  setTriggerRef,
  onFeatureClick,
  children,
  onClose,
  onOpenWorkspace,
}: {
  item: NotchDockItem
  dockItems: NotchDockItem[]
  activeFeature: NotchFeatureId | null
  setTriggerRef: (id: NotchFeatureId, node: HTMLButtonElement | null) => void
  onFeatureClick: (id: NotchFeatureId) => void
  children: React.ReactNode
  onClose: () => void
  onOpenWorkspace: () => void
}) {
  return (
    <section
      className="studydesk-notch-popover no-drag"
      id={`notch-popover-${item.id}`}
      role="region"
      aria-label={`${item.label} widget`}
    >
      <header className="widget-header">
        <span className="widget-icon" aria-hidden="true">{item.icon}</span>
        <h2 className="widget-title">{item.label}</h2>

        {/* Dock nav row -- feature switching icons */}
        <nav className="studydesk-popover-dock-row" aria-label="Features">
          {dockItems.map(d => (
            <NotchFeatureButton
              key={d.id}
              item={d}
              active={activeFeature === d.id}
              setRef={node => setTriggerRef(d.id, node)}
              onClick={() => onFeatureClick(d.id)}
            />
          ))}
        </nav>

        <div className="widget-actions">
          <button
            type="button"
            className="widget-action"
            onClick={onOpenWorkspace}
            aria-label="Open in workspace"
            title="Open full workspace"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9.5 2.5h4v4M13.5 2.5l-6 6M6.5 13.5h-4v-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="widget-action widget-close"
            onClick={onClose}
            aria-label="Close widget"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>
      <div className="widget-body">
        {children}
      </div>
    </section>
  )
}
