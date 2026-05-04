// Extract content from common document types in the renderer.
// Used by FileDropZone for course-materials ingestion.
//
// Supported (rich import → TipTap JSON):
//   .docx   via `mammoth` → HTML → @tiptap/html generateJSON
//   .md     via `marked`  → HTML → @tiptap/html generateJSON
// Supported (plain text only):
//   .pdf    via `pdfjs-dist` (PDF text extraction is messy, not structured)
//   .txt    direct read
//
// Returns ExtractResult with both `text` (always populated) and an
// optional `docJson` (TipTap document JSON when rich-parse succeeded).
// Callers store `docJson` in Note.content if present; otherwise wrap
// the plain text in a single-paragraph TipTap doc.

import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'

let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then(async (lib) => {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })
  }
  return pdfjsLibPromise
}

// Extension set used to parse imported HTML into TipTap JSON. Kept in
// sync with the runtime editor (StarterKit + Underline). Custom marks
// like NoteLink and SourceQuote are intentionally OMITTED — imported
// .docx/.md content shouldn't carry app-specific marks; users add those
// after the import via the editor.
const IMPORT_EXTENSIONS = [StarterKit, Underline]

export type ExtractResult = {
  title: string
  text: string
  /** TipTap document JSON when the source supports rich parsing. */
  docJson?: unknown
  pageCount?: number
}

/** Strip text from a TipTap JSON doc for storage in `Note.text`-style fields. */
function plainTextFromJson(node: any): string {
  if (!node) return ''
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  const children: any[] = Array.isArray(node.content) ? node.content : []
  const sep = node.type === 'paragraph' || node.type === 'heading' ? '\n' : ' '
  return children.map(plainTextFromJson).join(' ').trim() + (children.length ? sep : '')
}

export async function extractFileText(file: File): Promise<ExtractResult> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const lower = file.name.toLowerCase()

  // ── PDF: text-only extraction ────────────────────────────────────────
  if (lower.endsWith('.pdf')) {
    const pdfjs = await loadPdfjs()
    const buffer = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: buffer }).promise
    const chunks: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ('str' in item ? (item as TextItem).str : ''))
        .join(' ')
      chunks.push(pageText)
    }
    return { title: name, text: chunks.join('\n\n'), pageCount: doc.numPages }
  }

  // ── .docx: rich import via mammoth ───────────────────────────────────
  if (lower.endsWith('.docx')) {
    // mammoth runs in-browser thanks to its bundled `unzipit` for the
    // ZIP container and simple regex-based DOM extraction. Returns HTML
    // plus a `messages` array with parse warnings (skipped silently).
    const mammoth = await import('mammoth')
    const buffer = await file.arrayBuffer()
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
    const html = result.value || ''
    const docJson = html ? generateJSON(html, IMPORT_EXTENSIONS) : undefined
    const text = docJson ? plainTextFromJson(docJson).trim() : ''
    return { title: name, text, docJson }
  }

  // ── Markdown: rich import via marked ─────────────────────────────────
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const raw = await file.text()
    const { marked } = await import('marked')
    const html = await marked.parse(raw, { gfm: true, breaks: false })
    const docJson = html ? generateJSON(html, IMPORT_EXTENSIONS) : undefined
    const text = docJson ? plainTextFromJson(docJson).trim() : raw
    return { title: name, text, docJson }
  }

  // ── Plain text ───────────────────────────────────────────────────────
  if (lower.endsWith('.txt')) {
    const text = await file.text()
    return { title: name, text }
  }

  throw new Error(`Unsupported file type: ${file.name}. Use PDF, DOCX, MD, or TXT.`)
}
