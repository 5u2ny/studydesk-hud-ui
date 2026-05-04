// Single-note PDF export — port from shellyln/mdne-electron's printToPDF
// recipe. Renders the note's TipTap-derived HTML in an offscreen
// BrowserWindow then captures it as a PDF buffer via webContents.printToPDF.
//
// We don't reuse the visible workspace window because: (a) it has the
// app chrome we don't want in the export, (b) print styles need to be
// independent of dark-theme UI styles, (c) printing the visible window
// would clip whatever the user has scrolled to.

import { BrowserWindow } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'

interface ExportOptions {
  title: string
  /** TipTap JSON content (already parsed from the note's `content`). */
  doc: any
  /** Output file path. */
  outPath: string
}

/** Print-friendly stylesheet inlined into the offscreen page. Light
 *  background, serif body, generous margins so PDF reads like a paper. */
const PRINT_CSS = `
  @page { margin: 24mm 18mm; size: A4; }
  body { font: 12pt/1.55 'Charter','Iowan Old Style','Georgia',serif; color: #1a1a1f; max-width: 720px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22pt; margin: 0 0 12px; line-height: 1.25; }
  h2 { font-size: 16pt; margin: 18pt 0 6pt; }
  h3 { font-size: 13pt; margin: 12pt 0 4pt; color: #333; }
  p  { margin: 0 0 9pt; }
  ul, ol { padding-left: 22pt; margin: 6pt 0; }
  blockquote { margin: 8pt 0; padding-left: 14pt; border-left: 3px solid #c9c9d0; color: #444; }
  code { font: 10.5pt 'SF Mono','Menlo',monospace; background: #f1f1f4; padding: 1pt 4pt; border-radius: 3px; }
  pre code { display: block; padding: 9pt 12pt; background: #f6f6f8; border-radius: 6px; }
  hr { border: 0; border-top: 1px solid #c9c9d0; margin: 14pt 0; }
  img { max-width: 100%; }
  /* Subtle styling for our custom marks/nodes so PDFs still convey meaning */
  a.note-link { color: #1a4d99; text-decoration: none; border-bottom: 1px dashed #1a4d99; }
  sup.footnote-ref { color: #b88600; font-weight: 600; font-size: 8pt; }
  sup.footnote-ref::before { content: "[" counter(footnote) "]"; }
  body { counter-reset: footnote 0; }
  sup.footnote-ref { counter-increment: footnote; }
  span.inline-comment { background: #fff7d6; }
  aside.source-quote { margin: 10pt 0; padding: 8pt 12pt; border-left: 3px solid #5780b4; background: #f3f7fc; }
  aside.source-quote::after { display: block; margin-top: 4pt; content: "— " attr(data-source-title); font-style: italic; color: #5780b4; font-size: 9.5pt; }
  .meta { font-size: 9pt; color: #888; margin-bottom: 18pt; }
`

/** Render a note's TipTap doc into a printable HTML page. */
function buildPrintableHtml(opts: ExportOptions): string {
  let body: string
  try {
    body = generateHTML(opts.doc, [StarterKit, Underline])
  } catch {
    body = '<p>Failed to render note content.</p>'
  }
  const safeTitle = (opts.title || 'Untitled').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  const stamp = new Date().toLocaleString()
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${safeTitle}</title><style>${PRINT_CSS}</style></head>
<body>
<h1>${safeTitle}</h1>
<div class="meta">Exported ${stamp}</div>
${body}
</body></html>`
}

export async function exportNoteToPdf(opts: ExportOptions): Promise<{ path: string; bytes: number }> {
  const html = buildPrintableHtml(opts)

  // Hidden window — never shown.
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1024,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })

  // data: URL avoids the file-write/race of saving HTML to a temp file.
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

  // Wait one paint so styles + content settle. Empirically required on
  // some systems before printToPDF returns the rendered layout.
  await new Promise<void>(res => setTimeout(res, 120))

  const buf = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { marginType: 'default' },
  })

  await fs.promises.writeFile(opts.outPath, buf)
  win.destroy()
  return { path: opts.outPath, bytes: buf.byteLength }
}
