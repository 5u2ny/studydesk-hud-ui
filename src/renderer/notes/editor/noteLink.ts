// Wiki-style [[note-link]] syntax for TipTap.
//
// Borrowed concept: TiddlyWiki's tiddler links and MediaWiki's [[Page Name]]
// syntax. Type `[[` in a note to open a picker that fuzzy-matches all
// existing notes; pick one to insert a clickable link Mark. Click the
// link in render mode to navigate to the target note (uses the existing
// notes:openNote IPC the workspace already listens for).
//
// Stored as a Mark so the link is INLINE with surrounding text rather
// than a block-level node (which is what TiddlyWiki does — a tiddler
// link is just inline markup, not a paragraph break).

import { Mark, Extension, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import type { Note } from '@schema'

/** Custom DOM event the workspace listens for. Detail = `noteId` to open. */
export const NOTE_LINK_CLICK_EVENT = 'studydesk:open-note-link'

export interface NoteLinkAttrs {
  noteId: string
  /** Display text — usually the target note's title at insertion time.
   *  Stored separately so renames of the target don't break old links. */
  displayText: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      setNoteLink: (attrs: NoteLinkAttrs) => ReturnType
      unsetNoteLink: () => ReturnType
    }
  }
}

export const NoteLink = Mark.create({
  name: 'noteLink',
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      noteId: {
        default: '',
        parseHTML: el => el.getAttribute('data-note-id') ?? '',
        renderHTML: a => a.noteId ? { 'data-note-id': a.noteId } : {},
      },
      displayText: {
        default: '',
        parseHTML: el => el.getAttribute('data-display-text') ?? el.textContent ?? '',
        renderHTML: a => a.displayText ? { 'data-display-text': a.displayText } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a.note-link[data-note-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { class: 'note-link', href: '#' }), 0]
  },

  addCommands() {
    return {
      setNoteLink: attrs => ({ commands }) => commands.setMark(this.name, attrs),
      unsetNoteLink: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },

  // Click-to-open: dispatch a window event that App.tsx listens for.
  // Cmd/Ctrl-click to open in a new view (future); plain click navigates.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement | null
            const link = target?.closest?.('a.note-link[data-note-id]') as HTMLAnchorElement | null
            if (!link) return false
            const noteId = link.getAttribute('data-note-id')
            if (!noteId) return false
            window.dispatchEvent(new CustomEvent(NOTE_LINK_CLICK_EVENT, { detail: { noteId } }))
            return true
          },
        },
      }),
    ]
  },
})

// Suggestion extension that fires on `[[` and inserts a noteLink mark
// when the user picks a result.
export interface NoteLinkSuggestionOptions {
  /** Provided by Editor.tsx — fetches the current notes list */
  getNotes: () => Promise<Note[]>
  /** Provided by Editor.tsx — render the picker popup */
  render: SuggestionOptions<Note>['render']
  /** ID of the current note, so we exclude self-links from results */
  currentNoteId: string
}

/** TipTap Extension wrapping the [[note-link]] suggestion plugin. Pass
 *  `getNotes` (async loader for the full note list), `render` (returns
 *  the popup lifecycle object), and `currentNoteId` (excluded from
 *  results). */
export function createNoteLinkSuggestionExtension(opts: NoteLinkSuggestionOptions) {
  return Extension.create({
    name: 'noteLinkSuggestion',
    addProseMirrorPlugins() {
      return [
        Suggestion<Note>({
          editor: this.editor,
          char: '[',
          startOfLine: false,
          // Custom matcher: only fire when the user types `[[`. We look
          // backward for the most-recent unclosed `[[` and treat the
          // text after it as the query.
          findSuggestionMatch: (config: any) => {
            const $position = config.$position
            const text = $position.parent.textBetween(
              Math.max(0, $position.parentOffset - 200),
              $position.parentOffset,
              '\n',
              '\0',
            )
            const m = text.match(/\[\[([^\[\]\n]*)$/)
            if (!m) return null
            const fullMatch = m[0]
            const queryPart = m[1]
            return {
              range: { from: $position.pos - fullMatch.length, to: $position.pos },
              query: queryPart,
              text: fullMatch,
            }
          },
          items: async ({ query }: { query: string }) => {
            const notes = await opts.getNotes()
            const q = query.trim().toLowerCase()
            return notes
              .filter(n => n.id !== opts.currentNoteId)
              .filter(n => !q || (n.title || '').toLowerCase().includes(q))
              .slice(0, 10)
          },
          command: ({ editor, range, props }: any) => {
            const note = props as Note
            const display = note.title || 'Untitled'
            editor.chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: 'text',
                  text: display,
                  marks: [{ type: 'noteLink', attrs: { noteId: note.id, displayText: display } }],
                },
                { type: 'text', text: ' ' },
              ])
              .run()
          },
          render: opts.render,
        } as any),
      ]
    },
  })
}
