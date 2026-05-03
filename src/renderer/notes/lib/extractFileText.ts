// Extract plain text from common document types in the renderer.
// Used by the FileDropZone component to ingest course materials.
//
// Supported: PDF (via pdfjs-dist), plain text, markdown.
// Out of scope: DOCX, RTF, images. Surface a clear error for those.

import type { TextItem } from 'pdfjs-dist/types/src/display/api'

let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then(async (lib) => {
      // Vite resolves the worker URL at build time
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })
  }
  return pdfjsLibPromise
}

export type ExtractResult = {
  title: string
  text: string
  pageCount?: number
}

export async function extractFileText(file: File): Promise<ExtractResult> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const lower = file.name.toLowerCase()

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

  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const text = await file.text()
    return { title: name, text }
  }

  throw new Error(`Unsupported file type: ${file.name}. Use PDF, TXT, or Markdown.`)
}
