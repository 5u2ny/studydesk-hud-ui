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
  // Wings are sized for content, never larger.
  //   idle  = 80px wing each side  → timer (66px content) fits with a
  //           14px outer padding margin; hardware notch 200px in middle.
  //   hover = 100px wing each side → dock (3 × 26px buttons + gaps +
  //           14px padding ≈ 100px) fits on the right.
  // Wings are equal because the shell is centred with the hardware
  // notch — the constraint is the WIDER side's content.
  collapsedNotchWidth: 360,
  collapsedNotchHeight: 38,
  expandedNotchWidth: 400,
  expandedNotchHeight: 38,
  popoverOffset: 12,
}

export const NOTCH_SIZES: Record<NotchState, NotchSize> = {
  idle:             { w: 360, h: 38 },
  hoverDock:        { w: NOTCH_GEOMETRY.expandedNotchWidth, h: NOTCH_GEOMETRY.expandedNotchHeight },
  // Popover is a SEPARATE Liquid-Glass widget below the notch. Window
  // accommodates: notch (38) + gap (12) + widget (380) = 430px tall.
  activePopover:    { w: 540, h: 38 + 12 + 380 },
  workspaceOpening: { w: NOTCH_GEOMETRY.expandedNotchWidth, h: NOTCH_GEOMETRY.expandedNotchHeight },
}

export function getNotchSize(state: NotchState): NotchSize {
  return NOTCH_SIZES[state]
}

export function getNotchGeometry(): NotchGeometry {
  return NOTCH_GEOMETRY
}
