import { useState } from 'react'
import { exportFile, loadFfmpeg, isVideoExt, setProgressHandler } from '../lib/processor'

const FORMATS = [
  { id: 'mp4',  ext: 'MP4',  desc: 'Video, plays anywhere',    icon: '🎬', video: true },
  { id: 'webm', ext: 'WebM', desc: 'Video, smaller & open',    icon: '🎞️', video: true },
  { id: 'mp3',  ext: 'MP3',  desc: 'Audio only, small',        icon: '🎵' },
  { id: 'wav',  ext: 'WAV',  desc: 'Audio only, lossless',     icon: '🎚️' },
  { id: 'm4a',  ext: 'M4A',  desc: 'Audio only, AAC',          icon: '🎧' },
]

export function downloadBlob(data, filename) {
  const blob   = new Blob([data])
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
}

export default function ExportModal({ audioData, fileExt, fileName, ffmpegReady, onClose }) {
  const isVideo = isVideoExt(fileExt)
  const formats = FORMATS.filter(f => isVideo || !f.video)
  const [format,   setFormat]   = useState(isVideo ? 'mp4' : 'mp3')
  const [busy,     setBusy]     = useState(false)
  const [progress, setProgress] = useState(0)
  const [error,    setError]    = useState(null)

  async function handleExport() {
    if (!audioData) return
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      if (!ffmpegReady) {
        await loadFfmpeg(p => setProgress(p))
      }
      setProgress(10)
      setProgressHandler(p => setProgress(10 + Math.round(p * 0.85)))
      const result   = await exportFile(audioData, fileExt, format)
      setProgressHandler(null)
      setProgress(95)
      const baseName = (fileName || 'wavecut-export').replace(/\.[^.]+$/, '')
      downloadBlob(result, `${baseName}-wavecut.${format}`)
      setProgress(100)
      setTimeout(onClose, 400)
    } catch (e) {
      setError(e.message || 'Export failed')
    } finally {
      setProgressHandler(null)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Export File</h2>
            <p>Choose your output format and download.</p>
          </div>
          <button className="modal-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-section">
          <span className="modal-label">Output format</span>
          <div className="format-grid">
            {formats.map(f => (
              <div
                key={f.id}
                className={`format-option${format === f.id ? ' selected' : ''}`}
                onClick={() => !busy && setFormat(f.id)}
                role="radio"
                aria-checked={format === f.id}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setFormat(f.id)}
              >
                <span style={{ fontSize: '1.5rem' }}>{f.icon}</span>
                <span className="fo-ext">.{f.ext}</span>
                <span className="fo-desc">{f.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {busy && (
          <div className="modal-section">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {progress < 10 ? 'Loading engine…' : progress < 95 ? `Encoding… ${progress}%` : 'Done!'}
            </p>
          </div>
        )}

        {error && (
          <p style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>{error}</p>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={busy || !audioData}
          >
            {busy ? 'Exporting…' : `Download .${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
