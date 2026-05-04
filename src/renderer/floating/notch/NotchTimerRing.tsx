import React from 'react'

/*
 * Compact circular progress ring for the notch's left wing — matches
 * macOS / iOS Activity-style timer rings. Renders an SVG track with a
 * stroked arc that depletes as the phase progresses, plus the elapsed/
 * remaining time and phase label inline beside it.
 *
 * Sized to fit inside the hardware-notch height (24×24 ring, 14px text)
 * so the entire chip never exceeds ~32px of vertical space.
 */
export function NotchTimerRing({
  remainingSeconds,
  totalSeconds,
  phaseLabel,
  isRunning,
  onClick,
}: {
  remainingSeconds: number
  totalSeconds: number
  phaseLabel: string
  isRunning: boolean
  onClick: () => void
}) {
  const safeTotal = Math.max(totalSeconds, 1)
  const progress = Math.min(Math.max((safeTotal - remainingSeconds) / safeTotal, 0), 1)

  const SIZE = 22
  const STROKE = 2.5
  const R = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - progress)

  const m = Math.floor(remainingSeconds / 60)
  const s = Math.floor(remainingSeconds % 60)
  const time = `${m}:${s.toString().padStart(2, '0')}`

  // Play / pause glyph centred inside the ring — swap based on state.
  const center = SIZE / 2
  const glyph = isRunning ? (
    // Pause: two narrow rounded bars
    <g fill="currentColor">
      <rect x={center - 3} y={center - 3} width={1.8} height={6} rx={0.6} />
      <rect x={center + 1.2} y={center - 3} width={1.8} height={6} rx={0.6} />
    </g>
  ) : (
    // Play: triangle pointing right, slightly inset for optical balance
    <path
      fill="currentColor"
      d={`M ${center - 2} ${center - 3} L ${center + 3} ${center} L ${center - 2} ${center + 3} Z`}
    />
  )

  return (
    <button
      type="button"
      className={`notch-timer-ring no-drag${isRunning ? ' running' : ''}`}
      onClick={onClick}
      aria-label={`${time} ${phaseLabel}, ${isRunning ? 'running' : 'paused'} — tap to toggle`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="notch-timer-svg">
        <circle
          cx={center}
          cy={center}
          r={R}
          fill="none"
          stroke="rgba(255, 255, 255, 0.18)"
          strokeWidth={STROKE}
          className="notch-timer-track"
        />
        <circle
          cx={center}
          cy={center}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
          className="notch-timer-arc"
          style={{ transition: 'stroke-dashoffset 360ms cubic-bezier(0.32, 0.72, 0, 1), stroke 600ms ease' }}
        />
        {glyph}
      </svg>
      {/* key={s} retriggers the tick keyframe each second so digits "pop"
          (lifted from pomodoro animation primitive #4) */}
      <span key={isRunning ? s : 'paused'} className="notch-timer-ring-time" aria-hidden="true">{time}</span>
    </button>
  )
}
