// Image-based syllabus OCR using Tesseract.js (pure JS + WASM, runs offline).
//
// The source repo (matthewmolinar/syllabus-scanner) advertised "scanning"
// but only does text-layer PDF extraction; nothing to port. So we add the
// missing piece: actual image OCR. User drops a photo or screenshot of a
// syllabus, we run Tesseract in the renderer, return plain text that flows
// into the existing regex deadline parser unchanged.
//
// Tesseract data (~2MB English) downloads on first use to user storage.

import { createWorker, type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function getWorker(progressCb?: (p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number' && progressCb) {
            progressCb(m.progress)
          }
        },
      })
      return w
    })()
  }
  return workerPromise
}

export interface ScanResult {
  text: string
  confidence: number  // 0-100; tesseract reports per-block, we average
  durationMs: number
}

/** OCR a single image File (PNG/JPG/WebP/BMP). Returns extracted plain text. */
export async function scanSyllabusImage(
  file: File,
  progressCb?: (progress: number) => void
): Promise<ScanResult> {
  const start = performance.now()
  const worker = await getWorker(progressCb)
  // Tesseract.recognize accepts File/Blob/ImageBitmap directly
  const { data } = await worker.recognize(file)
  return {
    text: (data.text ?? '').trim(),
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    durationMs: performance.now() - start,
  }
}

/** Type guard for image files we can OCR. */
export function isOCRableImage(file: File): boolean {
  const lower = file.name.toLowerCase()
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.bmp') ||
    lower.endsWith('.gif') ||
    file.type.startsWith('image/')
  )
}

/** Optional: free worker resources after a long idle. */
export async function disposeOcrWorker() {
  if (workerPromise) {
    try {
      const w = await workerPromise
      await w.terminate()
    } catch { /* ignore */ }
    workerPromise = null
  }
}
