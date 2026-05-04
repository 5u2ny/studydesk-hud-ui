// Revision snapshots — port from DokuWiki's `attic/` pattern.
//
// Every time a note's content changes, we snapshot the PRIOR version
// (gzipped JSON) under <userData>/attic/<noteId>/<timestamp>.json.gz.
// Lightweight time-machine: list/restore is per-note. We cap retained
// snapshots at MAX_PER_NOTE so an extremely-edited note doesn't fill
// the user's disk indefinitely.

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import type { Note } from '../../../shared/schema/index'

const MAX_PER_NOTE = 50
/** Minimum gap between snapshots in ms — debounces rapid keystroke saves. */
const MIN_GAP_MS = 30_000

function atticRoot(): string {
  try {
    return path.join(app.getPath('userData'), 'attic')
  } catch {
    return path.join(process.cwd(), '.attic')
  }
}

function noteDir(noteId: string): string {
  return path.join(atticRoot(), noteId)
}

export interface RevisionListItem {
  timestamp: number
  size: number
  /** Title at the time of snapshot, for display in the picker. */
  title: string
}

export const revisionsService = {
  /** Snapshot the given note's CURRENT state to disk. Skip if a snapshot
   *  was taken in the last MIN_GAP_MS so rapid edits don't churn. */
  snapshot(note: Note): void {
    if (!note?.id) return
    try {
      const dir = noteDir(note.id)
      fs.mkdirSync(dir, { recursive: true })
      const now = Date.now()
      // Skip if a snapshot was just taken
      const existing = this.listFor(note.id)
      const newest = existing[0]?.timestamp ?? 0
      if (now - newest < MIN_GAP_MS) return
      const target = path.join(dir, `${now}.json.gz`)
      const payload = JSON.stringify(note)
      const gz = zlib.gzipSync(payload)
      fs.writeFileSync(target, gz)
      this.prune(note.id)
    } catch (e: any) {
      console.warn(`[revisions] snapshot failed for ${note.id}:`, e?.message)
    }
  },

  /** Sorted list of revisions for a note, newest first. */
  listFor(noteId: string): RevisionListItem[] {
    const dir = noteDir(noteId)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json.gz'))
      .map(f => {
        const ts = parseInt(f.replace('.json.gz', ''), 10)
        if (!Number.isFinite(ts)) return null
        const full = path.join(dir, f)
        let title = ''
        let size = 0
        try {
          size = fs.statSync(full).size
          // Lightweight peek: only read the title — gunzip but parse-and-extract
          const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(full)).toString('utf-8')) as Note
          title = data.title || ''
        } catch {/* ignore */}
        return { timestamp: ts, size, title }
      })
      .filter((x): x is RevisionListItem => x !== null)
      .sort((a, b) => b.timestamp - a.timestamp)
  },

  /** Read a specific revision and return the full Note record. */
  read(noteId: string, timestamp: number): Note | null {
    const file = path.join(noteDir(noteId), `${timestamp}.json.gz`)
    if (!fs.existsSync(file)) return null
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(file)).toString('utf-8')
      return JSON.parse(raw) as Note
    } catch {
      return null
    }
  },

  /** Trim the noteId's snapshot list down to MAX_PER_NOTE — drops the
   *  oldest first. Pure FS operation; safe to run on every snapshot. */
  prune(noteId: string): void {
    const list = this.listFor(noteId)
    if (list.length <= MAX_PER_NOTE) return
    const dir = noteDir(noteId)
    for (const r of list.slice(MAX_PER_NOTE)) {
      try { fs.unlinkSync(path.join(dir, `${r.timestamp}.json.gz`)) } catch { /* ignore */ }
    }
  },
}
