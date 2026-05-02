import React from 'react'

/*
 * SF-Symbols-style icons, hand-crafted to be crisp at the small sizes
 * (14–16px) the macOS menu bar uses. Designed to sit cleanly inside
 * Liquid-Glass dock buttons. fillRule="evenodd" + currentColor so they
 * tint by parent. All viewBox 16×16 for pixel alignment.
 */

interface IconProps {
  size?: number
  className?: string
}

// Concentric-ring target (focus / Today)
export function IconTarget({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  )
}

// Calendar with binding rings + header rule (Deadlines)
export function IconCalendar({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="1.8"
        y="3.4"
        width="12.4"
        height="11"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M1.8 6.6h12.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 1.6v2.6M11 1.6v2.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="5" cy="9.6" r="0.7" />
      <circle cx="8" cy="9.6" r="0.7" />
      <circle cx="11" cy="9.6" r="0.7" />
      <circle cx="5" cy="11.8" r="0.7" />
      <circle cx="8" cy="11.8" r="0.7" />
    </svg>
  )
}

// Graduation cap (Courses) — SF graduationcap.fill
export function IconCourses({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 2.5L1 6l7 3.5L15 6l-7-3.5Z" />
      <path d="M3.5 7.5v3.5c0 1 2 2 4.5 2s4.5-1 4.5-2V7.5L8 10 3.5 7.5Z" opacity="0.85" />
      <path d="M13.5 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// Gear (Settings) — SF gearshape.fill silhouette
export function IconGear({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.21 1.5a.7.7 0 0 1 .69.59l.18 1.06a5.5 5.5 0 0 1 1.27.53l.85-.65a.7.7 0 0 1 .92.06l.79.79a.7.7 0 0 1 .06.92l-.65.85c.22.4.4.83.53 1.27l1.06.18a.7.7 0 0 1 .59.69v1.12a.7.7 0 0 1-.59.69l-1.06.18a5.5 5.5 0 0 1-.53 1.27l.65.85a.7.7 0 0 1-.06.92l-.79.79a.7.7 0 0 1-.92.06l-.85-.65a5.5 5.5 0 0 1-1.27.53l-.18 1.06a.7.7 0 0 1-.69.59H6.79a.7.7 0 0 1-.69-.59l-.18-1.06a5.5 5.5 0 0 1-1.27-.53l-.85.65a.7.7 0 0 1-.92-.06l-.79-.79a.7.7 0 0 1-.06-.92l.65-.85a5.5 5.5 0 0 1-.53-1.27l-1.06-.18A.7.7 0 0 1 .5 9.06V7.94a.7.7 0 0 1 .59-.69l1.06-.18c.13-.44.31-.87.53-1.27l-.65-.85a.7.7 0 0 1 .06-.92l.79-.79a.7.7 0 0 1 .92-.06l.85.65a5.5 5.5 0 0 1 1.27-.53l.18-1.06a.7.7 0 0 1 .69-.59h2.42ZM8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z"
      />
    </svg>
  )
}
