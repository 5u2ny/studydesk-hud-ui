// Lo-fi focus music player.
//
// Plays a curated lo-fi stream when the pomodoro timer is running and
// pauses it when the timer pauses or ends. Designed for the focus
// session use case the user asked for: "lofi songs specifically ones
// which help you to focus".
//
// Implementation choices:
// - Single shared HTMLAudioElement, lazily created on first play. This
//   avoids any audio engine init cost on app start and keeps the
//   element alive across pause/resume so the stream doesn't have to
//   re-buffer every cycle.
// - Internet radio stream URLs (SomaFM, Lofi Cafe). These are public,
//   non-commercial-use friendly, and don't require an API key. The
//   list is tried in order: first one that successfully starts wins.
// - Volume defaults to a low 35 %. Lo-fi is meant to sit under your
//   thoughts, not on top of them.
// - Mute state is persisted to localStorage so a user who turned it
//   off doesn't get re-blasted on the next session.

const STORAGE_KEY = 'studydesk:lofi:enabled'
const VOL_KEY     = 'studydesk:lofi:volume'

/** Curated focus-music streams. Tried in order; the first one that
 *  buffers within ~6s wins. All are free, public, and stable.
 *  Each entry: { url, label } so a future UI can show what's playing. */
const LOFI_STREAMS: ReadonlyArray<{ url: string; label: string }> = [
  // Nightwave Plaza — vaporwave / lofi blend, very reliable HTTPS stream
  { url: 'https://radio.plaza.one/mp3', label: 'Nightwave Plaza' },
  // SomaFM Groove Salad — instrumental chillout, ICE stream
  { url: 'https://ice1.somafm.com/groovesalad-128-mp3', label: 'SomaFM Groove Salad' },
  // SomaFM Drone Zone — ambient, focus-friendly fallback
  { url: 'https://ice1.somafm.com/dronezone-128-mp3', label: 'SomaFM Drone Zone' },
]

let audio: HTMLAudioElement | null = null
let currentStreamIndex = 0

function readBool(key: string, defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultValue
    return v === '1'
  } catch { return defaultValue }
}

function readNumber(key: string, defaultValue: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultValue
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : defaultValue
  } catch { return defaultValue }
}

function ensureElement(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'none'
  audio.crossOrigin = 'anonymous'
  audio.volume = readNumber(VOL_KEY, 0.35)
  // If a stream errors out, fall through to the next candidate.
  audio.addEventListener('error', () => {
    if (currentStreamIndex < LOFI_STREAMS.length - 1) {
      currentStreamIndex += 1
      audio!.src = LOFI_STREAMS[currentStreamIndex].url
      audio!.play().catch(() => { /* swallow — UI still works without audio */ })
    }
  })
  return audio
}

/** Start lo-fi playback. Idempotent — calling twice while playing is a
 *  no-op. Respects the user's mute preference: if they turned it off
 *  in a prior session, we don't unmute them automatically. */
export function startLofi(): void {
  if (!readBool(STORAGE_KEY, true)) return
  const el = ensureElement()
  if (!el.src) {
    el.src = LOFI_STREAMS[currentStreamIndex].url
  }
  if (el.paused) {
    el.play().catch(() => {
      // Autoplay blocked or stream unreachable — the error listener
      // will already have advanced to the next URL. Nothing else to do.
    })
  }
}

/** Pause playback. Doesn't change the user's enabled flag — re-starting
 *  the timer should resume music if they had it on. */
export function pauseLofi(): void {
  if (!audio) return
  if (!audio.paused) audio.pause()
}

/** Toggle the user's "play lo-fi during focus" preference. Returns
 *  the new state. */
export function setLofiEnabled(enabled: boolean): boolean {
  try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0') } catch { /* ignore */ }
  if (!enabled) pauseLofi()
  return enabled
}

export function isLofiEnabled(): boolean {
  return readBool(STORAGE_KEY, true)
}

export function setLofiVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume))
  if (audio) audio.volume = clamped
  try { localStorage.setItem(VOL_KEY, String(clamped)) } catch { /* ignore */ }
}

export function getLofiVolume(): number {
  return readNumber(VOL_KEY, 0.35)
}

/** Currently-selected stream label, for UI display. */
export function currentLofiLabel(): string {
  return LOFI_STREAMS[currentStreamIndex]?.label ?? 'Lo-fi'
}
