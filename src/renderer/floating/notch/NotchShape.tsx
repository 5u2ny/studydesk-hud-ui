// Custom SVG silhouette for the notch shell — port of NotchShape.swift.
//
// SwiftUI version uses two animatable radii: a concave "shoulder" radius
// at the top (creating the inverted curl that hugs the hardware notch's
// inner edge) and a convex "skirt" radius at the bottom corners.
//
//        ___________________________________
//       /                                   \   <- concave top shoulders
//      |                                     |
//       \___________________________________/   <- convex bottom corners
//
// The CSS border-radius approach can do the bottom but not the concave
// top — there's no negative-radius value. So we render the silhouette
// as an inline SVG sized via a ResizeObserver, and the .studydesk-notch-shell
// becomes a transparent layout container with this SVG painted underneath.

import React, { useEffect, useRef, useState } from 'react'

interface NotchShapeProps {
  /** Top-shoulder radius (concave). 0 = flat top edge. */
  topRadius: number
  /** Bottom-corner radius (convex). */
  bottomRadius: number
}

/** Renders an absolutely-positioned SVG that fills its parent and draws
 *  the notch silhouette. Parent must be position: relative or absolute
 *  and the SVG sits behind whatever flex layout the shell uses. */
export function NotchShape({ topRadius, bottomRadius }: NotchShapeProps) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    if (!ref.current) return
    const parent = ref.current.parentElement
    if (!parent) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(parent)
    setSize({ w: parent.clientWidth, h: parent.clientHeight })
    return () => ro.disconnect()
  }, [])

  const path = buildPath(size.w, size.h, topRadius, bottomRadius)

  return (
    <svg
      ref={ref}
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        // Below the shell's flex children but above the body
        zIndex: 0,
      }}
    >
      <path d={path} fill="#000" />
    </svg>
  )
}

/** Build the SVG path for a width × height rect with concave top
 *  shoulders and convex bottom corners. Mirrors NotchShape.swift exactly:
 *  start at top-left, curve concave-down to (topR, topR), straight down
 *  the inner edge, curve convex-out to bottom-left flat run, etc. */
function buildPath(w: number, h: number, topR: number, botR: number): string {
  if (w <= 0 || h <= 0) return ''
  // Clamp radii so they don't exceed the geometry
  const tR = Math.max(0, Math.min(topR, w / 2, h / 2))
  const bR = Math.max(0, Math.min(botR, w / 2, h / 2))

  // Path order (clockwise from origin):
  //   M  0  0                                  start at top-left
  //   Q  tR 0,   tR tR                         concave shoulder (curve INTO the rect)
  //   L  tR  h-bR                              down the left inner edge
  //   Q  tR h,   tR+bR h                       convex bottom-left curl
  //   L  w-tR-bR  h                            across the bottom
  //   Q  w-tR h, w-tR  h-bR                    convex bottom-right curl
  //   L  w-tR  tR                              up the right inner edge
  //   Q  w-tR 0,  w  0                         concave shoulder right
  //   Z                                        close back to (0,0) along the top
  return [
    `M0 0`,
    `Q${tR} 0 ${tR} ${tR}`,
    `L${tR} ${h - bR}`,
    `Q${tR} ${h} ${tR + bR} ${h}`,
    `L${w - tR - bR} ${h}`,
    `Q${w - tR} ${h} ${w - tR} ${h - bR}`,
    `L${w - tR} ${tR}`,
    `Q${w - tR} 0 ${w} 0`,
    `Z`,
  ].join(' ')
}
