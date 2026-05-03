// Drag-and-drop file ingestion for the workspace.
// Drops a PDF/TXT/MD file -> extracts text -> creates a Note with documentType: 'reading'
// linked to the active course.

import React, { useCallback, useState } from 'react'
import { Upload, Loader2, FileText, AlertCircle } from 'lucide-react'
import { extractFileText } from '../lib/extractFileText'
import type { Note } from '@schema'

interface Props {
  courseId?: string
  documentType?: Note['documentType']
  onCreated: (noteId: string) => void
  onCreate: (input: { title: string; content: string; courseId?: string; documentType?: Note['documentType'] }) => Promise<string>
}

export function FileDropZone({ courseId, documentType = 'reading', onCreated, onCreate }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const result = await extractFileText(file)
      const trimmed = result.text.trim()
      if (!trimmed) {
        throw new Error('No text could be extracted from this file.')
      }
      const noteId = await onCreate({
        title: result.title,
        content: trimmed,
        courseId,
        documentType,
      })
      onCreated(noteId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import file.')
    } finally {
      setBusy(false)
    }
  }, [courseId, documentType, onCreate, onCreated])

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
      className={`file-drop-zone ${dragOver ? 'drag-over' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="file-drop-icon">
        {busy ? <Loader2 size={20} className="spin" /> : <Upload size={20} />}
      </div>
      <div className="file-drop-body">
        <strong>{busy ? 'Extracting text...' : 'Drop a PDF, TXT, or Markdown file'}</strong>
        <span>or click to browse. Text is extracted locally; no upload to a server.</span>
        {error && (
          <div className="file-drop-error"><AlertCircle size={12} /> {error}</div>
        )}
      </div>
      <label className="file-drop-button">
        <FileText size={14} /> Browse
        <input
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          onChange={onPick}
          disabled={busy}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  )
}
