import { describe, expect, test } from 'vitest'
import { getNotchGeometry, getNotchSize, NOTCH_SIZES, PHYSICAL_NOTCH_WIDTH, NOTCH_WING_WIDTH, type NotchState } from './notchSizing'

describe('notch sizing', () => {
  test('physical notch constants', () => {
    expect(PHYSICAL_NOTCH_WIDTH).toBe(180)
    expect(NOTCH_WING_WIDTH).toBe(120)
  })

  test('idle / workspaceOpening shrink to the cap; hoverDock is the full 420px bar', () => {
    const barW = NOTCH_WING_WIDTH + PHYSICAL_NOTCH_WIDTH + NOTCH_WING_WIDTH
    expect(barW).toBe(420)
    expect(getNotchSize('idle')).toEqual({ w: PHYSICAL_NOTCH_WIDTH, h: 38 })
    expect(getNotchSize('workspaceOpening')).toEqual({ w: PHYSICAL_NOTCH_WIDTH, h: 38 })
    expect(getNotchSize('hoverDock')).toEqual({ w: barW, h: 38 })
  })

  test('activePopover uses a wider window for the widget below', () => {
    expect(getNotchSize('activePopover')).toEqual({ w: 540, h: 430 })
    expect(getNotchSize('activePopover').w).toBeGreaterThan(getNotchSize('idle').w)
    expect(getNotchSize('activePopover').h).toBeGreaterThan(getNotchSize('idle').h)
  })

  test('does not use preview-scale 1504px widths', () => {
    const widths = Object.values(NOTCH_SIZES).map(size => size.w)
    expect(widths).not.toContain(1504)
    expect(Math.max(...widths)).toBeLessThan(1504)
  })

  test('defines every notch state explicitly', () => {
    const states: NotchState[] = ['idle', 'hoverDock', 'activePopover', 'workspaceOpening']
    expect(Object.keys(NOTCH_SIZES).sort()).toEqual([...states].sort())
  })

  test('defines a top-center physical notch geometry', () => {
    const g = getNotchGeometry()
    expect(g.anchor).toBe('top-center')
    expect(g.safeTopAttachment).toBe(true)
    expect(g.collapsedNotchWidth).toBe(PHYSICAL_NOTCH_WIDTH)
    expect(g.expandedNotchWidth).toBe(PHYSICAL_NOTCH_WIDTH)
  })
})
