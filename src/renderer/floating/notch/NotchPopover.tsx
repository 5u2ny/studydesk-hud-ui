import React, { useCallback, useRef, useState } from 'react'
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
  // ── Swipe-to-dismiss with rubber-band stretch ────────────────────────
  // Port of NotchSwipeDismissModifier.swift: drag the popover header
  // upward, popover stretches with rubber-band feedback. Past 42px
  // threshold = dismiss. Vertical must beat horizontal × 1.25 to count.
  const SWIPE_THRESHOLD = 42
  const DOMINANCE_MULTIPLIER = 1.25
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)
  const [stretchProgress, setStretchProgress] = useState(0)  // 0..1

  const handleDragStart = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Don't hijack drags that start on interactive controls
    const target = e.target as HTMLElement
    if (target.closest('button, input, [role="button"]')) return
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragOriginRef.current) return
    const dx = e.clientX - dragOriginRef.current.x
    const dy = e.clientY - dragOriginRef.current.y
    // Upward swipe (toward the notch) — dy is negative
    const upward = -dy
    if (upward <= 0) { setStretchProgress(0); return }
    // Vertical must dominate horizontal motion
    if (upward < Math.abs(dx) * DOMINANCE_MULTIPLIER) { setStretchProgress(0); return }
    setStretchProgress(Math.min(upward / SWIPE_THRESHOLD, 1.2)) // soft cap at 1.2 for rubber-band overshoot
  }, [])

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragOriginRef.current) return
    const willDismiss = stretchProgress >= 1
    dragOriginRef.current = null
    setStretchProgress(0)
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (willDismiss) onClose()
  }, [stretchProgress, onClose])

  // Compose the stretch transform. scaleY > 1 stretches toward the notch
  // (origin: top center keeps top edge flush). Rubber-band easing softens
  // the 1.0..1.2 overshoot zone so it feels elastic, not linear.
  const eased = stretchProgress < 1
    ? stretchProgress
    : 1 + (stretchProgress - 1) * 0.4
  const swipeStyle: React.CSSProperties = stretchProgress > 0
    ? {
        transform: `scaleY(${1 - eased * 0.06}) translateY(${-eased * 4}px)`,
        transformOrigin: 'top center',
        opacity: stretchProgress >= 1 ? 0.85 : 1,
        transition: 'none',
      }
    : { transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease' }

  return (
    <section
      className="studydesk-notch-popover no-drag"
      id={`notch-popover-${item.id}`}
      role="region"
      aria-label={`${item.label} widget`}
      style={swipeStyle}
    >
      <header
        className="widget-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
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
