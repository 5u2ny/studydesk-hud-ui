// TipTap JSON → Markdown serializer.
//
// Round-trip companion to extractFileText.ts (which imports .md → TipTap
// JSON via marked). Walks our doc and emits CommonMark-compatible
// markdown plus a few extensions used by our custom nodes:
//   - footnotes:    `[^1]` inline + `[^1]: ...` definitions at the bottom
//   - source quote: rendered as a blockquote with a trailing italic
//                   "— sourceTitle" attribution line
//   - note links:   `[[Note Title]]` inline (Obsidian-compatible syntax)
//   - inline comment: `==text==` highlight + a parenthetical `(comment: ...)`
//
// Standard nodes/marks (heading, paragraph, list, blockquote, code,
// horizontalRule, bold, italic, code, underline) emit straight CommonMark.

interface SerializeContext {
  /** Footnote definitions accumulated as we walk; emitted at the end. */
  footnotes: string[]
  /** Counter for ordered list rendering. */
  orderedDepth: number
}

/** Top-level entry point. Pass the parsed TipTap JSON document. */
export function tipTapJsonToMarkdown(doc: any): string {
  if (!doc || doc.type !== 'doc') return ''
  const ctx: SerializeContext = { footnotes: [], orderedDepth: 0 }
  const body = renderBlock(doc.content ?? [], ctx).trim()

  if (ctx.footnotes.length === 0) return body + (body ? '\n' : '')
  const refs = ctx.footnotes.map((text, i) => `[^${i + 1}]: ${escapeText(text)}`).join('\n')
  return `${body}\n\n${refs}\n`
}

function renderBlock(nodes: any[], ctx: SerializeContext): string {
  return nodes.map(n => renderNode(n, ctx)).join('\n\n')
}

function renderNode(node: any, ctx: SerializeContext): string {
  if (!node) return ''
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content ?? [], ctx)
    case 'heading': {
      const level = Math.max(1, Math.min(6, node.attrs?.level ?? 1))
      return '#'.repeat(level) + ' ' + renderInline(node.content ?? [], ctx)
    }
    case 'bulletList':
      return renderList(node.content ?? [], ctx, false)
    case 'orderedList':
      return renderList(node.content ?? [], ctx, true)
    case 'blockquote': {
      const inner = renderBlock(node.content ?? [], ctx)
      return inner.split('\n').map(line => '> ' + line).join('\n')
    }
    case 'codeBlock': {
      const lang = node.attrs?.language ?? ''
      const code = (node.content ?? []).map((c: any) => c.text ?? '').join('')
      return '```' + lang + '\n' + code + '\n```'
    }
    case 'horizontalRule':
      return '---'
    case 'sourceQuote': {
      // Custom node: blockquote with attribution
      const inner = renderInline(node.content ?? [], ctx)
      const title = node.attrs?.sourceTitle ?? 'source'
      return '> ' + inner + '\n> *— ' + escapeText(title) + '*'
    }
    case 'doc':
      return renderBlock(node.content ?? [], ctx)
    default:
      // Unknown block — fall back to inline render
      return renderInline(node.content ?? [], ctx)
  }
}

function renderList(items: any[], ctx: SerializeContext, ordered: boolean): string {
  return items.map((item, idx) => {
    const marker = ordered ? `${idx + 1}.` : '-'
    const inner = renderBlock(item.content ?? [], ctx)
    // Indent continuation lines by marker width
    const indent = ' '.repeat(marker.length + 1)
    const lines = inner.split('\n')
    const head = `${marker} ${lines[0] ?? ''}`
    const tail = lines.slice(1).map(l => l ? indent + l : '').join('\n')
    return tail ? `${head}\n${tail}` : head
  }).join('\n')
}

function renderInline(nodes: any[], ctx: SerializeContext): string {
  return nodes.map(n => {
    if (!n) return ''
    if (n.type === 'text') return applyMarks(escapeText(n.text ?? ''), n.marks ?? [], n.text ?? '', ctx)
    if (n.type === 'hardBreak') return '  \n'
    if (n.type === 'footnote') {
      const text = n.attrs?.content ?? ''
      ctx.footnotes.push(text)
      return `[^${ctx.footnotes.length}]`
    }
    // Inline atom we don't recognize — best effort: serialize as nothing
    if (n.content) return renderInline(n.content, ctx)
    return ''
  }).join('')
}

function applyMarks(rendered: string, marks: any[], rawText: string, _ctx: SerializeContext): string {
  let out = rendered
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':       out = `**${out}**`; break
      case 'italic':     out = `*${out}*`; break
      case 'strike':     out = `~~${out}~~`; break
      case 'code':       out = '`' + rawText + '`'; break  // code spans don't escape
      case 'underline':  out = `<u>${out}</u>`; break        // CommonMark has no underline; HTML span survives
      case 'link': {
        const href = mark.attrs?.href ?? '#'
        out = `[${out}](${href})`
        break
      }
      case 'noteLink': {
        // Obsidian-compatible [[wiki-link]] syntax — using displayText
        // when available rather than the raw rendered text (which already
        // includes the bracket-decoration via CSS, not in source).
        const display = mark.attrs?.displayText ?? rawText
        out = `[[${display}]]`
        break
      }
      case 'inlineComment': {
        const note = mark.attrs?.text ?? ''
        // ==highlight== is the GFM extension for marked text
        out = `==${out}==` + (note ? ` <!-- ${escapeText(note)} -->` : '')
        break
      }
    }
  }
  return out
}

function escapeText(s: string): string {
  // Minimal CommonMark escaping for round-trip safety
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([*_`~\[\]])/g, '\\$1')
}
