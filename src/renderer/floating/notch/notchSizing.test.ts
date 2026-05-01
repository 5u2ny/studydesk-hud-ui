import { describe, expect, test } from 'vitest'
import { getNotchGeometry, getNotchSize, NOTCH_SIZES, type NotchState } from './notchSizing'

describe('notch sizing', () => {
  test('uses notch-native state sizes that grow downward from the anchor', () => {
    expect(getNotchSize('idle')).toEqual({ w: 260, h: 42 })
    expect(getNotchSize('hoverDock')).toEqual({ w: 560, h: 96 })
    expect(getNotchSize('activePopover')).toEqual({ w: 740, h: 390 })
    expect(getNotchSize('workspaceOpening')).toEqual({ w: 560, h: 96 })
    expect(getNotchSize('hoverDock').h).toBeGreaterThan(getNotchSize('idle').h)
    expect(getNotchSize('activePopover').h).toBeGreaterThan(getNotchSize('hoverDock').h)
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
    expect(getNotchGeometry()).toEqual({
      anchor: 'top-center',
      safeTopAttachment: true,
      topInset: 0,
      collapsedNotchWidth: 210,
      collapsedNotchHeight: 34,
      expandedNotchWidth: 560,
      expandedNotchHeight: 96,
      popoverOffset: 0,
    })
  })

  test('keeps the collapsed cap smaller than the expanded notch body', () => {
    const geometry = getNotchGeometry()
    expect(geometry.collapsedNotchWidth).toBeLessThan(geometry.expandedNotchWidth)
    expect(geometry.collapsedNotchHeight).toBeLessThan(geometry.expandedNotchHeight)
    expect(geometry.popoverOffset).toBe(0)
  })
})
