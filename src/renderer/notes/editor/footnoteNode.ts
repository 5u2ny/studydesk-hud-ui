// Auto-numbered footnote node — port of MediaWiki's <ref>text</ref> pattern.
//
// The footnote is an inline atom node holding its content as an attribute.
// Renders as a small superscript [N] where N is auto-numbered via CSS
// counter (counter-increment: footnote on each .footnote-ref, with
// counter-reset on the editor root). The footnotes list under the editor
// scans the note's JSON in document order so its numbering matches.
//
// Storing the footnote text as an attribute (rather than as inline content)
// keeps the inline flow simple — the superscript [1] doesn't pull a long
// passage of text into the middle of a paragraph. Trade-off: footnote text
// is plain (no inline marks within); for an academic note that's fine.

import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (text: string) => ReturnType
    }
  }
}

export const Footnote = Node.create({
  name: 'footnote',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      content: {
        default: '',
        parseHTML: el => el.getAttribute('data-footnote') ?? '',
        renderHTML: a => a.content ? { 'data-footnote': a.content } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup.footnote-ref' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        class: 'footnote-ref',
        // tabindex so users can keyboard-focus the superscript and Enter
        // jumps to the footnote list (handled by document-level CSS scroll-
        // anchoring + a click handler in the footnotes panel).
        tabindex: '0',
      }),
    ]
  },

  addCommands() {
    return {
      insertFootnote: (text: string) => ({ chain }) => {
        return chain()
          .insertContent({
            type: this.name,
            attrs: { content: text },
          })
          .run()
      },
    }
  },
})

/** Walk a TipTap document JSON and collect all footnote contents in
 *  document order. Used by the footnotes list panel. */
export function collectFootnotes(doc: any): string[] {
  const out: string[] = []
  function walk(node: any) {
    if (!node) return
    if (node.type === 'footnote' && typeof node.attrs?.content === 'string') {
      out.push(node.attrs.content)
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(doc)
  return out
}
