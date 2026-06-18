import { useState } from 'react'
import { exportFile, loadFfmpeg } from '../lib/processor'

const FORMATS = [
  { id: 'mp3', ext: 'MP3', desc: 'Best for audio sharing',   icon: '🎵' },
  { id: 'mp4', ext: 'MP4', desc: 'Video or audio container', icon: '🎬' },
]

function downloadBlob(data, filename) {
  const blob   = new Blob([data])
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
}

export default function ExportModal({ audioData, fileExt, ffmpegReady, onClose }) {
  const [format,   setFormat]   = useState('mp3')
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
      const result   = await exportFile(audioData, fileExt, format)
      setProgress(95)
      const baseName = 'wavecut-export'
      downloadBlob(result, `${baseName}.${format}`)
      setProgress(100)
      setTimeout(onClose, 400)
    } catch (e) {
      setError(e.message || 'Export failed')
    } finally {
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
            {FORMATS.map(f => (
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
              {progress < 10 ? 'Loading engine…' : progress < 95 ? 'Encoding…' : 'Done!'}
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
