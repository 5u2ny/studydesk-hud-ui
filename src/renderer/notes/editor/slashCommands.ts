// AppFlowy-inspired slash command menu for TipTap.
//
// Architecture port (not literal copy — Flutter Dart → TS):
//   AppFlowy uses a `CharacterShortcutEvent` keyed to `/` that opens a
//   `SelectionMenu` of `SelectionMenuItem`s. Items are categorized
//   (basic / media / advanced) with keywords and a builder closure.
//   Inserting an item replaces the trigger text in the same edit.
//
// Our equivalent: a TipTap Extension wired to @tiptap/suggestion.
// Each item has a name, category, keywords, and a `command(editor)`
// closure that runs the actual TipTap chain. Suggestion handles the
// match-and-delete-trigger flow automatically.

import { Extension, type Editor as TipTapEditor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import {
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code, Minus, Type,
  Sparkles, AlertCircle, Info, BookMarked,
  type LucideIcon,
} from 'lucide-react'

export type SlashCategory = 'basic' | 'block' | 'callout' | 'advanced'

export interface SlashItem {
  /** Stable id used as the React key */
  id: string
  /** Display name in the menu */
  title: string
  /** Short description shown in the second line */
  description: string
  /** Icon component (lucide) */
  icon: LucideIcon
  /** Category — used to render section dividers */
  category: SlashCategory
  /** Search keywords (lowercased, matched against query) */
  keywords: string[]
  /** Run the TipTap chain. The `range` is the slash + query that
   *  should be replaced by the inserted block. */
  command: (args: { editor: TipTapEditor; range: Range }) => void
}

/** The full catalog of slash items. AppFlowy's category split adapted
 *  for academic note-taking — no embeds/databases/AI items yet. */
export const SLASH_ITEMS: SlashItem[] = [
  // Basic blocks (headings, plain text)
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Top-level heading',
    icon: Heading1,
    category: 'basic',
    keywords: ['heading', 'h1', 'title', '#'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Section heading',
    icon: Heading2,
    category: 'basic',
    keywords: ['heading', 'h2', 'subtitle', '##'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Subsection heading',
    icon: Heading3,
    category: 'basic',
    keywords: ['heading', 'h3', '###'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    id: 'paragraph',
    title: 'Text',
    description: 'Plain paragraph',
    icon: Type,
    category: 'basic',
    keywords: ['paragraph', 'text', 'plain', 'p'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('paragraph').run()
    },
  },

  // Block elements
  {
    id: 'bullet-list',
    title: 'Bulleted list',
    description: 'Simple unordered list',
    icon: List,
    category: 'block',
    keywords: ['list', 'bullet', 'ul', '-'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: 'ordered-list',
    title: 'Numbered list',
    description: 'Ordered list with numbers',
    icon: ListOrdered,
    category: 'block',
    keywords: ['list', 'numbered', 'ol', '1.'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    id: 'task-list',
    title: 'Checklist',
    description: 'Task list with checkboxes',
    icon: ListChecks,
    category: 'block',
    keywords: ['list', 'task', 'checklist', 'todo', '[]'],
    command: ({ editor, range }) => {
      // StarterKit doesn't include task-list by default. Future patch can
      // add @tiptap/extension-task-list; for now bullet list is the fallback.
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: 'blockquote',
    title: 'Quote',
    description: 'Block quote for emphasis',
    icon: Quote,
    category: 'block',
    keywords: ['quote', 'blockquote', '>'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    id: 'code',
    title: 'Code block',
    description: 'Monospace code with syntax',
    icon: Code,
    category: 'block',
    keywords: ['code', 'codeblock', '```'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Horizontal rule',
    icon: Minus,
    category: 'block',
    keywords: ['divider', 'hr', 'rule', '---'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },

  // Callouts (rendered as styled blockquotes via inline content)
  {
    id: 'callout-info',
    title: 'Info callout',
    description: 'Highlighted info box',
    icon: Info,
    category: 'callout',
    keywords: ['callout', 'info', 'note'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ℹ️ ' }] }],
      }).run()
    },
  },
  {
    id: 'callout-warning',
    title: 'Warning callout',
    description: 'Highlighted warning box',
    icon: AlertCircle,
    category: 'callout',
    keywords: ['callout', 'warning', 'caution'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '⚠️ ' }] }],
      }).run()
    },
  },

  // Advanced
  {
    id: 'flashcard-marker',
    title: 'Flashcard heading',
    description: 'H2 — auto-syncs to a flashcard',
    icon: Sparkles,
    category: 'advanced',
    keywords: ['flashcard', 'card', 'study', 'h2'],
    command: ({ editor, range }) => {
      // Inserts an H2 — flashcardSyncService picks up H2s as card fronts
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    id: 'source-quote',
    title: 'Source quote',
    description: 'Quote linked to the original PDF — click to open',
    icon: BookMarked,
    category: 'advanced',
    keywords: ['quote', 'source', 'cite', 'citation', 'reference'],
    command: async ({ editor, range }) => {
      // Inspired by insights-lm-public's citation-jump UX. We auto-link
      // to the most-recently-imported course material so the user can
      // start typing immediately; they can pick a different source by
      // editing the data attributes (or via a future picker UI).
      const { ipc } = await import('@shared/ipc-client')
      const courses = await ipc.invoke('course:list', {}).catch(() => [] as any[])
      let pick: { path: string; title: string; courseId: string } | null = null
      let bestTime = 0
      for (const c of (courses as any[])) {
        for (const f of (c.materialsImportedFiles ?? [])) {
          if (f.path && f.importedAt > bestTime) {
            bestTime = f.importedAt
            pick = {
              path: f.path,
              title: (f.path.split('/').pop() ?? 'source') as string,
              courseId: c.id,
            }
          }
        }
      }
      const meta = pick ?? { path: '', title: '(no source linked)', courseId: '' }
      editor.chain()
        .focus()
        .deleteRange(range)
        .insertSourceQuote({
          sourcePath: meta.path,
          sourceTitle: meta.title,
          courseId: meta.courseId || undefined,
          quotedAt: Date.now(),
          quote: 'Type the quoted passage…',
        })
        .run()
    },
  },
]

export const SLASH_CATEGORY_LABELS: Record<SlashCategory, string> = {
  basic: 'Basic',
  block: 'Blocks',
  callout: 'Callouts',
  advanced: 'Advanced',
}

/** Filter the catalog by the user's query (after the slash trigger).
 *  AppFlowy's filter matches against title and keywords, prioritizing
 *  prefix matches. Case-insensitive. Empty query returns all items. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter(item => {
    if (item.title.toLowerCase().includes(q)) return true
    return item.keywords.some(k => k.includes(q))
  })
}

/** TipTap Extension factory. Pass a `render` function that returns the
 *  ReactRenderer-style {onStart, onUpdate, onKeyDown, onExit} object. */
export function createSlashCommandsExtension(
  render: SuggestionOptions<SlashItem>['render']
) {
  return Extension.create({
    name: 'slashCommands',
    addOptions() {
      return {
        suggestion: {
          char: '/',
          // AppFlowy's "supportSlashMenuNodeTypes" gate: only show the menu
          // inside nodes where slash insertion makes sense (i.e. not inside
          // code blocks, where '/' is literal). Empty paragraphs are the
          // canonical trigger. We also allow inside paragraphs and headings.
          allow: ({ state, range }: any) => {
            const $from = state.doc.resolve(range.from)
            const blockType = $from.parent.type.name
            return blockType !== 'codeBlock'
          },
          startOfLine: false,
          command: ({ editor, range, props }: any) => {
            (props as SlashItem).command({ editor, range })
          },
          items: ({ query }: { query: string }) => filterSlashItems(query).slice(0, 12),
          render,
        },
      }
    },
    addProseMirrorPlugins() {
      return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
    },
  })
}
