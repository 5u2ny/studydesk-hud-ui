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
  // Tight widths so wings stay clear of other apps' menu-bar icons and
  // the title bars of windows directly below. Heights are fallbacks —
  // the renderer overrides them with the live hardware notch height.
  collapsedNotchWidth: 320,
  collapsedNotchHeight: 38,
  expandedNotchWidth: 420,
  expandedNotchHeight: 38,
  popoverOffset: 0,
}

export const NOTCH_SIZES: Record<NotchState, NotchSize> = {
  idle:             { w: 320, h: 38 },
  hoverDock:        { w: NOTCH_GEOMETRY.expandedNotchWidth, h: NOTCH_GEOMETRY.expandedNotchHeight },
  activePopover:    { w: 740, h: 420 },
  workspaceOpening: { w: NOTCH_GEOMETRY.expandedNotchWidth, h: NOTCH_GEOMETRY.expandedNotchHeight },
}

export function getNotchSize(state: NotchState): NotchSize {
  return NOTCH_SIZES[state]
}

export function getNotchGeometry(): NotchGeometry {
  return NOTCH_GEOMETRY
}
