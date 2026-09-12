import { useState } from 'react'

function fmt(t) {
  if (!isFinite(t) || t < 0) return '0:00.0'
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1)
  return `${m}:${s.padStart(4, '0')}`
}

// Splits the clip at the playhead. One half stays in the editor, the other
// can be downloaded. onSplit(keep: 'first' | 'second', downloadOther: bool)
export default function SplitModal({ at, duration, onSplit, onClose }) {
  const [keep, setKeep] = useState('first')
  const [downloadOther, setDownloadOther] = useState(true)
  const [busy, setBusy] = useState(false)

  const invalid = at <= 0.05 || at >= duration - 0.05

  async function go() {
    setBusy(true)
    try { await onSplit(keep, downloadOther) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Split at Playhead</h2>
            <p>Cut the clip into two at {fmt(at)}.</p>
          </div>
          <button className="modal-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        {invalid ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--warning)' }}>
            Move the playhead somewhere inside the clip first.
          </p>
        ) : (
          <div className="modal-section">
            <span className="modal-label">Keep in editor</span>
            <div className="pos-selector">
              {[
                { key: 'first',  label: `First part  (0:00.0 – ${fmt(at)})` },
                { key: 'second', label: `Second part  (${fmt(at)} – ${fmt(duration)})` },
              ].map(o => (
                <div
                  key={o.key}
                  className={`pos-option${keep === o.key ? ' selected' : ''}`}
                  onClick={() => setKeep(o.key)}
                  role="radio"
                  aria-checked={keep === o.key}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setKeep(o.key)}
                >
                  {o.label}
                </div>
              ))}
            </div>
            <label className="check-inline">
              <input type="checkbox" checked={downloadOther} onChange={e => setDownloadOther(e.target.checked)} />
              Download the other part
            </label>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={busy || invalid}>
            {busy ? 'Splitting…' : 'Split'}
          </button>
        </div>
      </div>
    </div>
  )
}
