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

/** Open embed.diagrams.net in a popup, wait for the user to save, then
 *  resolve with the new XML + SVG. The protocol is documented at
 *  https://www.drawio.com/doc/faq/embed-mode. */
function openDrawioEditor(initialXml: string, onSave: (xml: string, svg: string) => void): void {
  const url = 'https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&saveAndExit=1'
  const win = window.open(url, 'drawio', 'width=1200,height=800')
  if (!win) {
    window.alert('Pop-up blocked — allow popups for this app to edit diagrams.')
    return
  }
  const popup = win
  function listener(ev: MessageEvent) {
    if (ev.source !== popup) return
    let msg: any
    try { msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data } catch { return }
    if (!msg || !msg.event) return
    if (msg.event === 'init') {
      popup.postMessage(JSON.stringify({ action: 'load', xml: initialXml || '' }), '*')
    } else if (msg.event === 'save') {
      popup.postMessage(JSON.stringify({ action: 'export', format: 'xmlsvg' }), '*')
    } else if (msg.event === 'export' && msg.data) {
      // msg.data is a data URL containing the SVG with embedded XML
      const dataUrl: string = msg.data
      // Decode base64 SVG
      const base64 = dataUrl.split(',')[1] ?? ''
      let svg = ''
      try { svg = atob(base64) } catch { svg = '' }
      // Extract the XML embedded in the SVG (drawio puts it in the content attr)
      const xmlMatch = svg.match(/content="([^"]*)"/)
      const xml = xmlMatch ? decodeURIComponent(xmlMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : (msg.xml ?? '')
      onSave(xml, svg)
      popup.postMessage(JSON.stringify({ action: 'exit' }), '*')
    } else if (msg.event === 'exit') {
      window.removeEventListener('message', listener)
      try { popup.close() } catch { /* ignore */ }
    }
  }
  window.addEventListener('message', listener)
}
