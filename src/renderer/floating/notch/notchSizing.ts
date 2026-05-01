export type NotchState = 'idle' | 'hoverDock' | 'activePopover' | 'workspaceOpening'

export interface NotchSize {
  w: number
  h: number
}

export interface NotchGeometry {
  anchor: 'top-center'
  safeTopAttachment: true
  topInset: number
  collapsedNotchWidth: number
  collapsedNotchHeight: number
  expandedNotchWidth: number
  expandedNotchHeight: number
  popoverOffset: number
}

export const NOTCH_GEOMETRY: NotchGeometry = {
  anchor: 'top-center',
  safeTopAttachment: true,
  topInset: 0,
  // Fixed cap: 220px centered, never widens on hover.
  // Dock icons live in the popover, not the cap.
  collapsedNotchWidth: 220,
  collapsedNotchHeight: 38,
  expandedNotchWidth: 220,
  expandedNotchHeight: 38,
  popoverOffset: 12,
}

export const NOTCH_SIZES: Record<NotchState, NotchSize> = {
  // Cap is always 220px wide. hoverDock is the same as idle (no expansion).
  idle:             { w: 220, h: 38 },
  hoverDock:        { w: 220, h: 38 },
  // Popover is a SEPARATE Liquid-Glass widget below the notch. Window
  // accommodates: notch (38) + gap (12) + widget (380) = 430px tall.
  activePopover:    { w: 540, h: 38 + 12 + 380 },
  workspaceOpening: { w: 220, h: 38 },
}

export function getNotchSize(state: NotchState): NotchSize {
  return NOTCH_SIZES[state]
}

export function getNotchGeometry(): NotchGeometry {
  return NOTCH_GEOMETRY
}
