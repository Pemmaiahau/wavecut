import { useRef, useState } from 'react'

function fmt(t) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function JoinModal({ duration, currentTime, onJoin, onClose }) {
  const inputRef  = useRef(null)
  const [file,    setFile]   = useState(null)
  const [drag,    setDrag]   = useState(false)
  const [pos,     setPos]    = useState('end')       // 'end' | 'cursor' | 'custom'
  const [customT, setCustomT] = useState(0)
  const [busy,    setBusy]   = useState(false)

  function pickFile(f) {
    if (f) setFile(f)
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false)
    pickFile(e.dataTransfer.files[0])
  }

  async function handleJoin() {
    if (!file) return
    setBusy(true)
    let insertAt = null // null = end
    if (pos === 'cursor') insertAt = currentTime
    if (pos === 'custom')  insertAt = Math.min(Math.max(0, parseFloat(customT) || 0), duration)
    await onJoin(file, insertAt)
    setBusy(false)
  }

  const insertTime =
    pos === 'end'    ? null :
    pos === 'cursor' ? currentTime :
    Math.min(Math.max(0, parseFloat(customT) || 0), duration)

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>Join Audio / Video</h2>
            <p>Pick a file to insert and choose where to place it.</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* File picker */}
        <div className="modal-section">
          <span className="modal-label">File to insert</span>
          <div
            className={`modal-drop${drag ? ' drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
          >
            <span className="md-icon">🎵</span>
            {file
              ? <span className="md-filename">✅ {file.name}</span>
              : <span>Click or drag a file here</span>
            }
            <input
              ref={inputRef}
              type="file"
              accept=".mp3,.mp4,.wav,.ogg,.webm,.m4a,.aac,.flac"
              style={{ display: 'none' }}
              onChange={e => pickFile(e.target.files[0])}
            />
          </div>
        </div>

        {/* Insert position */}
        <div className="modal-section">
          <span className="modal-label">Insert position</span>
          <div className="pos-selector">
            {[
              { key: 'end',    label: `Append at end (${fmt(duration)})` },
              { key: 'cursor', label: `At playhead (${fmt(currentTime)})` },
              { key: 'custom', label: 'Custom time' },
            ].map(o => (
              <div
                key={o.key}
                className={`pos-option${pos === o.key ? ' selected' : ''}`}
                onClick={() => setPos(o.key)}
                role="radio"
                aria-checked={pos === o.key}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setPos(o.key)}
              >
                {o.label}
              </div>
            ))}
            {pos === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  className="modal-input"
                  value={customT}
                  min={0}
                  max={duration}
                  step={0.1}
                  onChange={e => setCustomT(e.target.value)}
                  placeholder="seconds"
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  / {fmt(duration)}
                </span>
              </div>
            )}
          </div>

          {insertTime !== null && (
            <p style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>
              Will insert at {fmt(insertTime)}
            </p>
          )}
          {insertTime === null && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Will append after {fmt(duration)}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={!file || busy}
          >
            {busy ? 'Joining…' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  )
}
