// Drawio diagram embed — port of BookStack's drawio integration.
//
// Stores an XML payload (the diagram's Mermaid-style source from
// app.diagrams.net) plus a rendered SVG snapshot. The SVG is what we
// display inside the editor; clicking opens the editor in a new
// window that talks to embed.diagrams.net via postMessage to round-
// trip edits back into the note.
//
// We keep the payload local (no upload). The viewer/editor windows
// use the public app.diagrams.net page in offline mode — no account
// required, no data leaves the machine after the iframe loads.

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export interface DiagramAttrs {
  /** Drawio XML — opaque payload, edited via embed.diagrams.net. */
  xml: string
  /** Optional pre-rendered SVG, shown when present. */
  svg: string
  /** Last edited timestamp (epoch ms). */
  updatedAt: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagram: {
      insertDiagram: (attrs: Partial<DiagramAttrs>) => ReturnType
    }
  }
}

export const Diagram = Node.create<{}>({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      xml: {
        default: '',
        parseHTML: el => el.getAttribute('data-xml') ?? '',
        renderHTML: a => ({ 'data-xml': a.xml ?? '' }),
      },
      svg: {
        default: '',
        parseHTML: el => el.getAttribute('data-svg') ?? '',
        renderHTML: a => ({ 'data-svg': a.svg ?? '' }),
      },
      updatedAt: {
        default: 0,
        parseHTML: el => Number(el.getAttribute('data-updated-at') ?? 0),
        renderHTML: a => ({ 'data-updated-at': String(a.updatedAt ?? 0) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure.drawio-diagram' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as DiagramAttrs
    const placeholder = attrs.svg
      ? ['div', { class: 'drawio-svg', innerHTML: attrs.svg }]
      : ['div', { class: 'drawio-empty' }, 'Click to open diagram editor (drawio)']
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { class: 'drawio-diagram' }),
      placeholder as any,
      ['figcaption', {}, 'Drawio diagram'],
    ] as any
  },

  addCommands() {
    return {
      insertDiagram: (attrs) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { xml: '', svg: '', updatedAt: Date.now(), ...attrs },
        })
      },
    }
  },

  // Click → open embed.diagrams.net in a popup. The popup signals
  // ready/save/exit via window.postMessage. We forward the saved XML +
  // SVG back into the node's attrs.
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (_view, ev) => {
              const target = ev.target as HTMLElement
              const fig = target.closest('figure.drawio-diagram') as HTMLElement | null
              if (!fig) return false
              const xml = fig.getAttribute('data-xml') ?? ''
              openDrawioEditor(xml, (newXml, newSvg) => {
                // Find the node and update its attrs in-place. We match by
                // the DOM element's position via posAtDOM.
                const view = editor.view
                let pos: number | null = null
                try { pos = view.posAtDOM(fig, 0) } catch { pos = null }
                if (pos == null) return
                const $pos = view.state.doc.resolve(pos)
                // posAtDOM lands inside the atom; find the wrapping node
                for (let depth = $pos.depth; depth >= 0; depth--) {
                  const node = $pos.node(depth)
                  if (node.type.name === 'diagram') {
                    const nodePos = depth === 0 ? 0 : $pos.before(depth)
                    editor.chain().focus()
                      .setNodeSelection(nodePos)
                      .updateAttributes('diagram', { xml: newXml, svg: newSvg, updatedAt: Date.now() })
                      .run()
                    break
                  }
                }
              })
              return true
            },
          },
        },
      }),
    ]
  },
})

/** Drawio iframe origin. Used to lock down both postMessage targets and
 *  incoming `ev.origin` checks so a stray listener can't be tricked by
 *  another tab. */
const DRAWIO_ORIGIN = 'https://embed.diagrams.net'

/** Strip script tags, foreignObject, and event-handler attributes from
 *  the SVG drawio returns. Defense-in-depth: even though the SVG is
 *  rendered inside ProseMirror nodeViews (not via dangerouslySetInnerHTML
 *  in our path today), copy-paste round-trips or future export views
 *  could re-render via innerHTML — sanitize at the boundary. */
function sanitizeSvg(svg: string): string {
  if (!svg) return ''
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    if (!root || root.nodeName.toLowerCase() !== 'svg') return ''
    const banned = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed'])
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        if (banned.has(child.nodeName.toLowerCase())) {
          child.remove()
          continue
        }
        // Strip on* event handlers and javascript: URLs
        for (const attr of Array.from(child.attributes)) {
          if (/^on/i.test(attr.name)) child.removeAttribute(attr.name)
          else if (/^(href|xlink:href)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) {
            child.removeAttribute(attr.name)
          }
        }
        walk(child)
      }
    }
    walk(root)
    return new XMLSerializer().serializeToString(root)
  } catch {
    return ''
  }
}

/** Open embed.diagrams.net in a popup, wait for the user to save, then
 *  resolve with the new XML + SVG. The protocol is documented at
 *  https://www.drawio.com/doc/faq/embed-mode. */
function openDrawioEditor(initialXml: string, onSave: (xml: string, svg: string) => void): void {
  const url = `${DRAWIO_ORIGIN}/?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&saveAndExit=1`
  const win = window.open(url, 'drawio', 'width=1200,height=800')
  if (!win) {
    window.alert('Pop-up blocked — allow popups for this app to edit diagrams.')
    return
  }
  const popup = win
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    window.removeEventListener('message', listener)
    clearInterval(closedPoll)
    try { if (!popup.closed) popup.close() } catch { /* ignore */ }
  }
  function listener(ev: MessageEvent) {
    // Origin lockdown — drop any message that's not from drawio itself.
    if (ev.origin !== DRAWIO_ORIGIN) return
    if (ev.source !== popup) return
    let msg: any
    try { msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data } catch { return }
    if (!msg || !msg.event) return
    if (msg.event === 'init') {
      popup.postMessage(JSON.stringify({ action: 'load', xml: initialXml || '' }), DRAWIO_ORIGIN)
    } else if (msg.event === 'save') {
      popup.postMessage(JSON.stringify({ action: 'export', format: 'xmlsvg' }), DRAWIO_ORIGIN)
    } else if (msg.event === 'export' && msg.data) {
      // msg.data is a data URL containing the SVG with embedded XML.
      const dataUrl: string = msg.data
      const base64 = dataUrl.split(',')[1] ?? ''
      let rawSvg = ''
      try { rawSvg = atob(base64) } catch { rawSvg = '' }
      const svg = sanitizeSvg(rawSvg)
      // Prefer drawio's own xml field (sent on export with format=xmlsvg);
      // fall back to a regex extraction only if absent.
      const xml: string = typeof msg.xml === 'string' && msg.xml.length > 0
        ? msg.xml
        : (() => {
            const m = rawSvg.match(/content="([^"]*)"/)
            if (!m) return ''
            // Decode HTML entities the SVG content attr can carry.
            const entities: Record<string, string> = {
              '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'",
            }
            return m[1].replace(/&(quot|amp|lt|gt|apos|#10|#13);/g, e =>
              entities[e] ?? (e === '&#10;' ? '\n' : e === '&#13;' ? '\r' : e))
          })()
      onSave(xml, svg)
      popup.postMessage(JSON.stringify({ action: 'exit' }), DRAWIO_ORIGIN)
    } else if (msg.event === 'exit') {
      cleanup()
    }
  }
  // Poll for popup-closed-without-save so the message listener cannot
  // leak forever if the user clicks the OS close button.
  const closedPoll = window.setInterval(() => {
    if (popup.closed) cleanup()
  }, 1000)
  window.addEventListener('message', listener)
}
