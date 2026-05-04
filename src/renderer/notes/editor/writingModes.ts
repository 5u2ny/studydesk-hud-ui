// Writing modes — port from MarkText's Typewriter + Focus modes.
//
// Two independent classes are toggled at the editor root:
//   - typewriter:  caret-locked vertical centering on selection change
//   - focus:       non-active blocks fade to 0.35 opacity
//
// Implementation:
//   • A TipTap Extension stores the active mode flags in plugin state.
//   • Plugin decoration adds `data-writing-modes` and `data-active` to
//     the focused block so CSS can style it differently from siblings.
//   • Typewriter centering is done via a selection-change handler that
//     measures the caret rect and scrolls its container so the rect
//     sits at ~40% of the viewport (slightly above center, MarkText's
//     default — feels less locked than dead-center).

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface WritingModesOptions {
  typewriter: boolean
  focus: boolean
}

export interface WritingModesStorage {
  typewriter: boolean
  focus: boolean
}

const writingModesKey = new PluginKey('writingModes')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    writingModes: {
      setTypewriter: (enabled: boolean) => ReturnType
      setFocusMode: (enabled: boolean) => ReturnType
      toggleTypewriter: () => ReturnType
      toggleFocusMode: () => ReturnType
    }
  }
}

export const WritingModes = Extension.create<WritingModesOptions, WritingModesStorage>({
  name: 'writingModes',

  addOptions() {
    return { typewriter: false, focus: false }
  },

  addStorage() {
    return { typewriter: this.options?.typewriter ?? false, focus: this.options?.focus ?? false }
  },

  addCommands() {
    return {
      setTypewriter: (enabled) => ({ editor }) => {
        editor.storage.writingModes.typewriter = enabled
        editor.view.dom.toggleAttribute('data-typewriter', enabled)
        // Trigger a selection update so the centering logic runs immediately
        editor.view.dispatch(editor.state.tr.setMeta(writingModesKey, { center: true }))
        return true
      },
      setFocusMode: (enabled) => ({ editor }) => {
        editor.storage.writingModes.focus = enabled
        editor.view.dom.toggleAttribute('data-focus-mode', enabled)
        // Re-trigger decoration so the active block highlights
        editor.view.dispatch(editor.state.tr.setMeta(writingModesKey, { focus: true }))
        return true
      },
      toggleTypewriter: () => ({ editor }) => {
        return editor.commands.setTypewriter(!editor.storage.writingModes.typewriter)
      },
      toggleFocusMode: () => ({ editor }) => {
        return editor.commands.setFocusMode(!editor.storage.writingModes.focus)
      },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: writingModesKey,
        props: {
          // Adds a `is-active-block` class to the block containing the
          // current selection, so the focus-mode CSS can dim siblings.
          decorations: (state) => {
            if (!editor?.storage?.writingModes?.focus) return DecorationSet.empty
            const { $from } = state.selection
            // Walk up to the nearest top-level block
            let depth = $from.depth
            while (depth > 0 && !$from.node(depth).isBlock) depth--
            if (depth < 0) return DecorationSet.empty
            const start = $from.before(depth || 1)
            const end = $from.after(depth || 1)
            return DecorationSet.create(state.doc, [
              Decoration.node(start, end, { class: 'is-active-block' }),
            ])
          },
        },
        view: () => ({
          // Typewriter: scroll the editor's scrolling container so the
          // caret rect sits at ~40% of viewport height after each
          // selection change.
          update: (view) => {
            if (!editor?.storage?.writingModes?.typewriter) return
            try {
              const coords = view.coordsAtPos(view.state.selection.head)
              const wrap = view.dom.closest('.notes-content, .notes-editor-wrap, .ProseMirror') as HTMLElement | null
              const scroller = findScroller(view.dom)
              if (!scroller) return
              const target = scroller.clientHeight * 0.40
              const containerTop = scroller.getBoundingClientRect().top
              const caretRelative = coords.top - containerTop
              const delta = caretRelative - target
              if (Math.abs(delta) > 4) {
                scroller.scrollBy({ top: delta, behavior: 'smooth' })
              }
            } catch { /* coords throw if doc empty */ }
          },
        }),
      }),
    ]
  },
})

/** Walk up the DOM tree from the editor root and return the first
 *  ancestor that actually scrolls vertically. */
function findScroller(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement
  while (cur) {
    const overflow = getComputedStyle(cur).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && cur.scrollHeight > cur.clientHeight) {
      return cur
    }
    cur = cur.parentElement
  }
  return null
}
