// Auto-generated table-of-contents dropdown — port from editor.md.
//
// Walks the current note's TipTap JSON for heading nodes (levels 1-3),
// renders them as a floating dropdown anchored to a toolbar button. Click
// a heading entry to scroll the editor to that heading. Hidden when the
// current note has fewer than 3 headings (a TOC for 1-2 headings is noise).

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { List as ListIcon } from 'lucide-react'

export interface TocHeading {
  level: number
  text: string
  /** Index within the document (used to find the corresponding DOM element). */
  index: number
}

export function extractHeadings(content: string): TocHeading[] {
  if (!content) return []
  let json: any
  try { json = JSON.parse(content) } catch { return [] }
  const out: TocHeading[] = []
  const walk = (node: any) => {
    if (!node) return
    if (node.type === 'heading' && node.attrs?.level && node.attrs.level <= 3) {
      const text = collectText(node)
      if (text.trim()) out.push({ level: node.attrs.level, text: text.trim(), index: out.length })
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(json)
  return out
}

function collectText(node: any): string {
  if (!node) return ''
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(collectText).join('')
  return ''
}

interface Props {
  noteContent: string
  /** ID of the editor's content container so we can find heading DOM nodes. */
  editorContainerSelector?: string
}

export function TocDropdown({ noteContent, editorContainerSelector = '.notes-content .ProseMirror' }: Props) {
  const headings = useMemo(() => extractHeadings(noteContent), [noteContent])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Hide entirely if not enough headings to be useful
  if (headings.length < 3) return null

  function jumpTo(index: number) {
    setOpen(false)
    // ProseMirror doesn't add ids to headings — find the Nth heading by
    // DOM order. Simple, reliable for a doc that hasn't been re-rendered.
    const root = document.querySelector(editorContainerSelector) as HTMLElement | null
    if (!root) return
    const all = root.querySelectorAll<HTMLElement>('h1, h2, h3')
    const target = all[index]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Brief flash so the user sees what jumped
      target.classList.add('toc-flash')
      setTimeout(() => target.classList.remove('toc-flash'), 900)
    }
  }

  return (
    <div className="toc-dropdown" ref={ref}>
      <button
        className={`notes-tool-btn toc-trigger ${open ? 'active' : ''}`}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        title={`Outline (${headings.length} headings)`}
      >
        <ListIcon size={13} />
      </button>
      {open && (
        <div className="toc-menu" role="menu">
          <div className="toc-menu-header">Outline · {headings.length} headings</div>
          <ul>
            {headings.map(h => (
              <li key={h.index}>
                <button
                  role="menuitem"
                  className={`toc-item toc-level-${h.level}`}
                  onClick={() => jumpTo(h.index)}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
