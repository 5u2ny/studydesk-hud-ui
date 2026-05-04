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

// Physical MacBook Air notch: ~180px wide center cap (blank).
// Left wing: 120px for timer. Right wing: 120px for 4 feature icons.
// Both wings hidden until hover; entire bar is opaque black for mouse capture.
// Active: 540px for the popover widget below.
export const PHYSICAL_NOTCH_WIDTH = 180
// Each wing: 120px (left for timer, right for 4 feature icons).
export const NOTCH_WING_WIDTH = 120

export const NOTCH_GEOMETRY: NotchGeometry = {
  anchor: 'top-center',
  safeTopAttachment: true,
  topInset: 0,
  collapsedNotchWidth: PHYSICAL_NOTCH_WIDTH,
  collapsedNotchHeight: 38,
  expandedNotchWidth: PHYSICAL_NOTCH_WIDTH,
  expandedNotchHeight: 38,
  popoverOffset: 12,
}

// Left wing (120) + cap (180) + right wing (120) = 420px when wings
// are visible. At idle the BrowserWindow is shrunk to just the cap so
// only the small black notch silhouette paints — without this the
// transparent 240px on either side reads as a wide ghosted bar that
// the user kept calling out.
const BAR_W = NOTCH_WING_WIDTH + PHYSICAL_NOTCH_WIDTH + NOTCH_WING_WIDTH

export const NOTCH_SIZES: Record<NotchState, NotchSize> = {
  idle:             { w: PHYSICAL_NOTCH_WIDTH, h: 38 },
  hoverDock:        { w: BAR_W,                h: 38 },
  activePopover:    { w: 540,                  h: 38 + 12 + 380 },
  workspaceOpening: { w: PHYSICAL_NOTCH_WIDTH, h: 38 },
}

export function getNotchSize(state: NotchState): NotchSize {
  return NOTCH_SIZES[state]
}

export function getNotchGeometry(): NotchGeometry {
  return NOTCH_GEOMETRY
}
