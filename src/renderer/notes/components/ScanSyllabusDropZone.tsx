// Drop a syllabus image -> OCR -> populates the syllabus paste textarea.
// Companion to FileDropZone but routes through Tesseract OCR for image-only sources.

import React, { useCallback, useState } from 'react'
import { Camera, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { isOCRableImage, scanSyllabusImage } from '../lib/scanSyllabusImage'

interface Props {
  /** Called with the OCR'd plain text. Caller decides where to put it (e.g. setRawPaste). */
  onText: (text: string) => void
}

export function ScanSyllabusDropZone({ onText }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ chars: number; conf: number } | null>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!isOCRableImage(file)) {
      setError(`Not an image: ${file.name}. Drop a PNG, JPG, or WebP screenshot/photo.`)
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    setProgress(0)
    try {
      const result = await scanSyllabusImage(file, p => setProgress(p))
      if (!result.text || result.text.length < 20) {
        throw new Error('OCR found very little text. The image may be too low-resolution or rotated.')
      }
      onText(result.text)
      setSuccess({ chars: result.text.length, conf: Math.round(result.confidence) })
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR failed')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }, [onText])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }, [handleFile])

  return (
    <div
      className={`scan-drop-zone ${dragOver ? 'drag-over' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="scan-drop-icon">
        {busy ? <Loader2 size={18} className="spin" /> : <Camera size={18} />}
      </div>
      <div className="scan-drop-body">
        <strong>
          {busy
            ? `Reading text… ${Math.round(progress * 100)}%`
            : 'Or scan a syllabus image'}
        </strong>
        <span>Drop a PNG/JPG photo or screenshot. Text is extracted locally with Tesseract.</span>
        {error && (
          <div className="scan-drop-error"><AlertCircle size={11} /> {error}</div>
        )}
        {success && (
          <div className="scan-drop-success"><CheckCircle2 size={11} /> Extracted {success.chars} chars at {success.conf}% confidence — text added to the paste area.</div>
        )}
      </div>
      <label className="scan-drop-button">
        Browse
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
          onChange={onPick}
          disabled={busy}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  )
}
