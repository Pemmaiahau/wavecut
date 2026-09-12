import { useState } from 'react'

const FORMATS = [
  { id: 'mp3', ext: 'MP3', desc: 'Small, plays anywhere', icon: '🎵' },
  { id: 'wav', ext: 'WAV', desc: 'Lossless, large file',  icon: '🎚️' },
  { id: 'm4a', ext: 'M4A', desc: 'AAC, good quality',     icon: '🎧' },
]

// onExtract(format, target) — target: 'download' | 'editor'
export default function ExtractAudioModal({ onExtract, onClose }) {
  const [format, setFormat] = useState('mp3')
  const [busy,   setBusy]   = useState(false)

  async function go(target) {
    setBusy(true)
    try { await onExtract(format, target) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Extract Audio</h2>
            <p>Pull the soundtrack out of this video as a standalone audio file.</p>
          </div>
          <button className="modal-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-section">
          <span className="modal-label">Audio format</span>
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

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-ghost" onClick={() => go('editor')} disabled={busy} title="Replace the video with just its audio (undo to go back)">
            Open in editor
          </button>
          <button className="btn btn-primary" onClick={() => go('download')} disabled={busy}>
            {busy ? 'Extracting…' : `Download .${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
