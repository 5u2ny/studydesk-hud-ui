// Source-quote TipTap node — inspired by insights-lm-public's
// citation-jump UI. Stores a verbatim quote alongside the absolute file
// path of the source PDF/MD/TXT it came from. Clicking a rendered quote
// invokes shell:openSourceFile (main-process IPC) which calls
// shell.openPath to launch the user's default app at that file.
//
// Why a custom node and not just a blockquote: blockquotes don't carry
// structured metadata. We want { sourcePath, sourceTitle, courseId,
// quotedAt } so a rendered quote is unambiguously linked to its source
// even after the user moves/edits/copies the note around.
//
// Future: page-anchored jumps (sourcePath?page=N). Default macOS Preview
// supports the URL scheme but Electron's shell.openPath does not.
// Embedding pdfjs-viewer in a modal would solve it; deferred for later.

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export interface SourceQuoteAttrs {
  sourcePath: string       // absolute path inside a course materials folder
  sourceTitle: string      // display label (e.g. "Syllabus.pdf")
  courseId?: string        // optional — for future filtering
  quotedAt: number         // epoch ms — so we can sort / diff later
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sourceQuote: {
      insertSourceQuote: (attrs: SourceQuoteAttrs & { quote: string }) => ReturnType
    }
  }
}

export const SourceQuote = Node.create<{}>({
  name: 'sourceQuote',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      sourcePath: { default: '', parseHTML: el => el.getAttribute('data-source-path') ?? '', renderHTML: a => ({ 'data-source-path': a.sourcePath }) },
      sourceTitle: { default: '', parseHTML: el => el.getAttribute('data-source-title') ?? '', renderHTML: a => ({ 'data-source-title': a.sourceTitle }) },
      courseId: { default: undefined, parseHTML: el => el.getAttribute('data-course-id') ?? undefined, renderHTML: a => a.courseId ? { 'data-course-id': a.courseId } : {} },
      quotedAt: { default: 0, parseHTML: el => Number(el.getAttribute('data-quoted-at') ?? 0), renderHTML: a => ({ 'data-quoted-at': String(a.quotedAt ?? 0) }) },
    }
  },

  parseHTML() {
    return [{ tag: 'aside.source-quote' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      mergeAttributes(HTMLAttributes, { class: 'source-quote', role: 'note' }),
      // Footer rendered by ProseMirror as a sibling line (unstyled) for
      // accessibility — visual layout is achieved purely via CSS pseudo-
      // elements pulling from the data-* attributes.
      0,
    ]
  },

  addCommands() {
    return {
      insertSourceQuote: (attrs) => ({ commands }) => {
        const { quote, ...meta } = attrs
        return commands.insertContent({
          type: this.name,
          attrs: meta,
          content: [{ type: 'text', text: quote }],
        })
      },
    }
  },

  // Click handler: clicking a rendered quote opens the source file via
  // the path-restricted IPC. ProseMirror plugin keeps this isolated from
  // React so the node doesn't re-render on every doc update.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement
            const aside = target?.closest?.('aside.source-quote') as HTMLElement | null
            if (!aside) return false
            const path = aside.getAttribute('data-source-path')
            if (!path) return false
            import('@shared/ipc-client').then(({ ipc }) => {
              ipc.invoke('shell:openSourceFile', { path }).catch((err: any) => {
                console.warn('[sourceQuote] open failed:', err?.message ?? err)
              })
            })
            return true   // consume the click — don't move cursor
          },
        },
      }),
    ]
  },
})
