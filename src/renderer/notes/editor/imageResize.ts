// Image with corner-drag resize handles — port from portive/wysimark.
//
// Wraps @tiptap/extension-image with an extra `width` attribute and a
// custom DOM node view that mounts 4 corner handles when the image is
// selected. Dragging any handle resizes proportionally relative to the
// natural image dimensions, then writes the new width back into the
// node's attrs so the size persists in the saved doc.
//
// We store width as an integer pixel value (capped to 1200px) rather
// than percent — predictable across viewport sizes when the note is
// re-opened. The style attribute uses `max-width: 100%` so narrow
// viewports still squash gracefully.

import Image from '@tiptap/extension-image'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

const MIN_W = 80
const MAX_W = 1200

export const ResizableImage = Image.extend({
  // Allow images to sit inline OR as standalone block — TipTap's default
  // behavior. We add the width attribute and a node view.

  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || el.style.width
          if (!w) return null
          const n = parseInt(w, 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {}
          return { width: String(attrs.width), style: `width:${attrs.width}px;max-width:100%` }
        },
      },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrap = document.createElement('span')
      wrap.className = 'tiptap-image-wrap'

      const img = document.createElement('img')
      img.src = node.attrs.src
      if (node.attrs.alt) img.alt = node.attrs.alt
      if (node.attrs.title) img.title = node.attrs.title
      img.draggable = false
      img.style.maxWidth = '100%'
      img.style.display = 'block'
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`
      wrap.appendChild(img)

      const handles: HTMLSpanElement[] = []
      const corners = ['nw', 'ne', 'sw', 'se'] as const
      for (const c of corners) {
        const h = document.createElement('span')
        h.className = `tiptap-image-handle handle-${c}`
        h.dataset.corner = c
        wrap.appendChild(h)
        handles.push(h)
      }

      // Show handles when this node is selected; CSS toggles via class
      function setSelected(active: boolean) {
        wrap.classList.toggle('is-selected', active)
      }

      const view = editor.view
      const refreshSelection = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const sel = view.state.selection
        const inSel = sel.from <= pos && sel.to >= pos + 1
        setSelected(inSel || document.activeElement === img)
      }
      // Refresh on every selection update
      const onSelUpdate = () => refreshSelection()
      editor.on('selectionUpdate', onSelUpdate)
      refreshSelection()

      // Drag-to-resize handlers
      let dragData: null | { startX: number; startW: number; corner: string } = null
      function onMove(e: MouseEvent) {
        if (!dragData) return
        const dx = e.clientX - dragData.startX
        // ne / se grow rightward; nw / sw shrink rightward (so dx negation flips)
        const isLeftHandle = dragData.corner.endsWith('w')
        const newW = Math.max(MIN_W, Math.min(MAX_W,
          dragData.startW + (isLeftHandle ? -dx : dx)
        ))
        img.style.width = `${newW}px`
      }
      function onUp() {
        if (!dragData) return
        const finalW = parseInt(img.style.width, 10)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        // Commit the new width to the node attrs
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos !== undefined && Number.isFinite(finalW)) {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: finalW })
          )
        }
        dragData = null
      }
      handles.forEach(h => {
        h.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          dragData = {
            startX: e.clientX,
            startW: img.getBoundingClientRect().width,
            corner: h.dataset.corner ?? 'se',
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        })
      })

      return {
        dom: wrap,
        update(updated: PMNode) {
          if (updated.type.name !== 'image') return false
          if (updated.attrs.src !== img.src) img.src = updated.attrs.src
          if (updated.attrs.width) img.style.width = `${updated.attrs.width}px`
          else img.style.width = ''
          if (updated.attrs.alt !== img.alt) img.alt = updated.attrs.alt ?? ''
          return true
        },
        destroy() {
          editor.off('selectionUpdate', onSelUpdate)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        },
      }
    }
  },
}).configure({
  // Allow base64 data URLs so users can paste/drop images without setting
  // up disk storage. For very large images this bloats the JSON store —
  // a future patch can add a "save to ~/StudyDesk/attachments" flow.
  inline: true,
  allowBase64: true,
})

/** Optional: paste-handler helper to convert pasted image File objects
 *  into base64 data URLs that the Image node accepts. Wire from the
 *  Editor's onPaste. */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
