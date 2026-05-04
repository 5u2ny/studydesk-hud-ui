// Typed data blocks — port of XWiki XObjects / TiddlyWiki tiddler-fields.
//
// A "data block" is an inline structured record embedded in a note.
// Each block has a `kind` (paper / lecture / concept / person) plus a
// flat `fields` map. The fields are stored as JSON on a custom node so
// they survive copy-paste and round-trip through HTML serialization.
//
// Why not just use a table: tables are unstructured. With a typed block
// we can later query "all papers cited in this course" by walking the
// note JSON for nodes of type=dataBlock with kind=paper. That same
// structure is what XWiki's XObjects and DokuWiki's data plugin enable.
//
// Rendering: an aside.data-block with a kind chip and key/value rows.
// Styling lives in notes.css next to source-quote / footnote.

import { Node, mergeAttributes } from '@tiptap/core'

export type DataBlockKind = 'paper' | 'lecture' | 'concept' | 'person'

export interface DataBlockAttrs {
  kind: DataBlockKind
  /** Flat string -> string map. Keep simple — no nested arrays/objects. */
  fields: Record<string, string>
  /** Free-form title rendered as the block heading. */
  title: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dataBlock: {
      insertDataBlock: (attrs: DataBlockAttrs) => ReturnType
    }
  }
}

/** Schema hints — what fields each kind should prompt for. The block
 *  itself accepts any keys; this is just the slash-command form. */
export const DATA_BLOCK_SCHEMAS: Record<DataBlockKind, string[]> = {
  paper:   ['authors', 'year', 'venue', 'doi'],
  lecture: ['course', 'date', 'topic', 'instructor'],
  concept: ['definition', 'category', 'related'],
  person:  ['affiliation', 'role', 'contact'],
}

export const DataBlock = Node.create<{}>({
  name: 'dataBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'concept',
        parseHTML: el => (el.getAttribute('data-kind') ?? 'concept') as DataBlockKind,
        renderHTML: a => ({ 'data-kind': a.kind }),
      },
      title: {
        default: '',
        parseHTML: el => el.getAttribute('data-title') ?? '',
        renderHTML: a => ({ 'data-title': a.title }),
      },
      fields: {
        default: {} as Record<string, string>,
        parseHTML: el => {
          const raw = el.getAttribute('data-fields') ?? '{}'
          try { return JSON.parse(raw) } catch { return {} }
        },
        renderHTML: a => ({ 'data-fields': JSON.stringify(a.fields ?? {}) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'aside.data-block' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as DataBlockAttrs
    const rows = Object.entries(attrs.fields ?? {})
    return [
      'aside',
      mergeAttributes(HTMLAttributes, { class: 'data-block', role: 'note' }),
      ['header', { class: 'data-block-header' },
        ['span', { class: 'data-block-kind' }, attrs.kind],
        ['strong', {}, attrs.title || '(untitled)'],
      ],
      ['dl', { class: 'data-block-rows' },
        ...rows.flatMap(([k, v]) => [
          ['dt', {}, k],
          ['dd', {}, v],
        ]),
      ],
    ] as any
  },

  addCommands() {
    return {
      insertDataBlock: (attrs) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs })
      },
    }
  },
})

/** Walk a TipTap document JSON and collect all data blocks. */
export function collectDataBlocks(doc: any): DataBlockAttrs[] {
  const out: DataBlockAttrs[] = []
  function walk(n: any) {
    if (!n) return
    if (n.type === 'dataBlock' && n.attrs) {
      out.push({
        kind: n.attrs.kind ?? 'concept',
        title: n.attrs.title ?? '',
        fields: n.attrs.fields ?? {},
      })
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)
  return out
}
