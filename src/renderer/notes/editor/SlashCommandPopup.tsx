// Popup rendered while the slash menu is open. AppFlowy uses a stacked
// vertical list with category dividers. We do the same — categorized
// item list with keyboard navigation (↑/↓/Enter/Escape).

import React, { useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react'
import { type SlashItem, SLASH_CATEGORY_LABELS, type SlashCategory } from './slashCommands'

export interface SlashCommandPopupHandle {
  /** Returns true if the keypress was consumed (caller cancels propagation). */
  onKeyDown: (e: KeyboardEvent) => boolean
}

interface Props {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

export const SlashCommandPopup = forwardRef<SlashCommandPopupHandle, Props>(
  function SlashCommandPopup({ items, command }, ref) {
    const [selectedIdx, setSelectedIdx] = useState(0)

    // Reset selection when the filtered items change
    useEffect(() => { setSelectedIdx(0) }, [items])

    // Group items by category preserving the order of first appearance
    const groups = useMemo(() => {
      const out: Array<{ category: SlashCategory; items: SlashItem[] }> = []
      const seen: Record<string, number> = {}
      items.forEach(item => {
        if (seen[item.category] === undefined) {
          seen[item.category] = out.length
          out.push({ category: item.category, items: [item] })
        } else {
          out[seen[item.category]].items.push(item)
        }
      })
      return out
    }, [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: (e: KeyboardEvent) => {
        if (items.length === 0) return false
        if (e.key === 'ArrowUp') {
          setSelectedIdx(p => (p + items.length - 1) % items.length)
          return true
        }
        if (e.key === 'ArrowDown') {
          setSelectedIdx(p => (p + 1) % items.length)
          return true
        }
        if (e.key === 'Enter') {
          const item = items[selectedIdx]
          if (item) command(item)
          return true
        }
        if (e.key === 'Escape') {
          // Let the suggestion plugin handle dismiss
          return false
        }
        return false
      },
    }), [items, selectedIdx, command])

    if (items.length === 0) {
      return (
        <div className="slash-popup">
          <div className="slash-popup-empty">No matching blocks</div>
        </div>
      )
    }

    let absIdx = 0
    return (
      <div className="slash-popup" role="listbox" aria-label="Insert block">
        {groups.map(group => (
          <div key={group.category} className="slash-popup-group">
            <div className="slash-popup-section-title">
              {SLASH_CATEGORY_LABELS[group.category]}
            </div>
            {group.items.map(item => {
              const isSelected = absIdx === selectedIdx
              const myIdx = absIdx
              absIdx += 1
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`slash-popup-item${isSelected ? ' is-selected' : ''}`}
                  onMouseEnter={() => setSelectedIdx(myIdx)}
                  onMouseDown={(e) => {
                    // mousedown so the editor selection isn't lost
                    e.preventDefault()
                    command(item)
                  }}
                >
                  <span className="slash-popup-icon">
                    <Icon size={14} />
                  </span>
                  <span className="slash-popup-text">
                    <strong>{item.title}</strong>
                    <em>{item.description}</em>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    )
  }
)
