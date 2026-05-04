// Note-picker popup that appears when the user types `[[` in the editor.
// Mirrors SlashCommandPopup's structure: keyboard-navigable list with
// ↑/↓/Enter/Escape, click-to-insert, lazy filter on the suggestion query.

import React, { useEffect, useState, useImperativeHandle, forwardRef } from 'react'
import { FileText, Sparkles, ClipboardList, Image as ImageIcon } from 'lucide-react'
import type { Note } from '@schema'

export interface NoteLinkPopupHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

interface Props {
  items: Note[]
  command: (note: Note) => void
}

function iconFor(note: Note) {
  switch (note.documentType) {
    case 'syllabus':          return FileText
    case 'assignment_prompt': return ClipboardList
    case 'reading':           return FileText
    case 'class_notes':       return FileText
    case 'daily_entry':       return Sparkles
    default:                  return ImageIcon
  }
}

export const NoteLinkPopup = forwardRef<NoteLinkPopupHandle, Props>(
  function NoteLinkPopup({ items, command }, ref) {
    const [selectedIdx, setSelectedIdx] = useState(0)
    useEffect(() => { setSelectedIdx(0) }, [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: (e: KeyboardEvent) => {
        if (items.length === 0) return false
        if (e.key === 'ArrowUp')   { setSelectedIdx(p => (p + items.length - 1) % items.length); return true }
        if (e.key === 'ArrowDown') { setSelectedIdx(p => (p + 1) % items.length); return true }
        if (e.key === 'Enter')     { const n = items[selectedIdx]; if (n) command(n); return true }
        return false
      },
    }), [items, selectedIdx, command])

    if (items.length === 0) {
      return (
        <div className="note-link-popup">
          <div className="note-link-popup-empty">No matching notes — keep typing</div>
        </div>
      )
    }

    return (
      <div className="note-link-popup" role="listbox" aria-label="Link to note">
        <div className="note-link-popup-hint">Link to a note</div>
        {items.map((note, idx) => {
          const isSelected = idx === selectedIdx
          const Icon = iconFor(note)
          return (
            <button
              key={note.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`note-link-popup-item${isSelected ? ' is-selected' : ''}`}
              onMouseEnter={() => setSelectedIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault()
                command(note)
              }}
            >
              <span className="note-link-popup-icon"><Icon size={13} /></span>
              <span className="note-link-popup-text">
                <strong>{note.title || 'Untitled'}</strong>
                <em>{(note.documentType ?? 'note').replace('_', ' ')}</em>
              </span>
            </button>
          )
        })}
      </div>
    )
  }
)
