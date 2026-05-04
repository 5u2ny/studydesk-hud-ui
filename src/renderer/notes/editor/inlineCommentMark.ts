// Inline-comment mark — port from suitenumerique/docs.
//
// Wraps a text range with `<span class="inline-comment" data-comment-id="...">`.
// The actual comment body is stored on Note.comments[] keyed by id, so the
// editor content stays small (just the id, not the comment text). Hovering
// the highlighted text shows the comment via a CSS attribute tooltip.

import { Mark, mergeAttributes } from '@tiptap/core'

export interface InlineCommentAttrs {
  commentId: string
  /** Snapshotted text — used by the CSS tooltip and the comments panel.
   *  Stored on the mark too so the tooltip works without an extra lookup,
   *  while the canonical store is Note.comments[]. */
  text: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineComment: {
      setInlineComment: (attrs: InlineCommentAttrs) => ReturnType
      unsetInlineComment: () => ReturnType
    }
  }
}

export const InlineComment = Mark.create({
  name: 'inlineComment',
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      commentId: {
        default: '',
        parseHTML: el => el.getAttribute('data-comment-id') ?? '',
        renderHTML: a => a.commentId ? { 'data-comment-id': a.commentId } : {},
      },
      text: {
        default: '',
        parseHTML: el => el.getAttribute('data-comment-text') ?? '',
        renderHTML: a => a.text ? { 'data-comment-text': a.text } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span.inline-comment[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'inline-comment' }), 0]
  },

  addCommands() {
    return {
      setInlineComment: attrs => ({ commands }) => commands.setMark(this.name, attrs),
      unsetInlineComment: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})
