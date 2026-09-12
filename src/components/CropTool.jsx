import { useRef } from 'react'

export const ASPECTS = [
  { id: 'free', label: 'Free',  ratio: null },
  { id: '16:9', label: '16:9',  ratio: 16 / 9 },
  { id: '9:16', label: '9:16',  ratio: 9 / 16 },
  { id: '1:1',  label: '1:1',   ratio: 1 },
  { id: '4:5',  label: '4:5',   ratio: 4 / 5 },
  { id: '4:3',  label: '4:3',   ratio: 4 / 3 },
]

const MIN_SIZE = 32

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Largest centred rect of the given ratio that fits the frame
export function fitCrop(vw, vh, ratio) {
  if (!ratio) return { x: 0, y: 0, w: vw, h: vh }
  let w = vw, h = w / ratio
  if (h > vh) { h = vh; w = h * ratio }
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}

function applyDrag(s, mode, dx, dy, vw, vh, ratio) {
  if (mode === 'move') {
    return { ...s, x: clamp(s.x + dx, 0, vw - s.w), y: clamp(s.y + dy, 0, vh - s.h) }
  }
  const right = s.x + s.w, bottom = s.y + s.h
  let x1 = s.x, y1 = s.y, x2 = right, y2 = bottom
  if (mode.includes('e')) x2 = clamp(right  + dx, s.x + MIN_SIZE, vw)
  if (mode.includes('w')) x1 = clamp(s.x    + dx, 0, right  - MIN_SIZE)
  if (mode.includes('s')) y2 = clamp(bottom + dy, s.y + MIN_SIZE, vh)
  if (mode.includes('n')) y1 = clamp(s.y    + dy, 0, bottom - MIN_SIZE)

  let w = x2 - x1, h = y2 - y1
  if (ratio) {
    // Keep the ratio, anchored at the corner opposite the one being dragged
    if (w / h > ratio) w = h * ratio; else h = w / ratio
    const maxW = mode.includes('w') ? x2 : vw - x1
    const maxH = mode.includes('n') ? y2 : vh - y1
    const k = Math.min(1, maxW / w, maxH / h)
    w *= k; h *= k
    if (mode.includes('w')) x1 = x2 - w; else x2 = x1 + w
    if (mode.includes('n')) y1 = y2 - h; else y2 = y1 + h
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

// Draggable crop rectangle drawn over the video picture.
// `crop` is in source-pixel coordinates; `rect` comes from VideoPreview.
export function CropOverlay({ rect, crop, ratio, onChange }) {
  const dragRef = useRef(null)
  const scale = rect.width / rect.vw

  function down(e, mode) {
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode, x: e.clientX, y: e.clientY, start: { ...crop } }
  }
  function move(e) {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.x) / scale
    const dy = (e.clientY - d.y) / scale
    onChange(applyDrag(d.start, d.mode, dx, dy, rect.vw, rect.vh, ratio))
  }
  function up() { dragRef.current = null }

  const box = {
    left:   crop.x * scale,
    top:    crop.y * scale,
    width:  crop.w * scale,
    height: crop.h * scale,
  }

  return (
    <div
      className="crop-overlay"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <div
        className="crop-box"
        style={box}
        onPointerDown={e => down(e, 'move')}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div className="crop-grid" />
        {['nw', 'ne', 'sw', 'se'].map(c => (
          <div
            key={c}
            className={`crop-handle ${c}`}
            onPointerDown={e => down(e, c)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        ))}
      </div>
    </div>
  )
}

export function CropControls({ crop, aspect, onAspect, vw, vh, busy, onApply, onCancel }) {
  const unchanged = crop.x === 0 && crop.y === 0 && crop.w === vw && crop.h === vh
  return (
    <div className="tool-panel">
      <div className="tool-panel-title">
        <strong>Crop</strong>
        <span>Drag the box or its corners. Output: {Math.round(crop.w)} × {Math.round(crop.h)} px</span>
      </div>
      <div className="tool-panel-row">
        <span className="tool-panel-label">Aspect</span>
        <div className="chip-row">
          {ASPECTS.map(a => (
            <button
              key={a.id}
              className={`chip${aspect === a.id ? ' active' : ''}`}
              onClick={() => onAspect(a.id)}
              disabled={busy}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="tool-panel-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={onApply} disabled={busy || unchanged}>Apply Crop</button>
      </div>
    </div>
  )
}
