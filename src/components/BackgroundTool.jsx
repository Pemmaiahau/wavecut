import { useEffect, useRef } from 'react'
import { loadImageFile } from '../lib/segmenter'

const PRESET_COLORS = ['#00b140', '#0000ff', '#ffffff', '#000000', '#1c1c28', '#f5f5dc']

// Live preview: a canvas over the video picture, redrawn while the video
// plays, after a seek, and whenever the settings change.
export function BackgroundOverlay({ rect, video, compositor, settings }) {
  const canvasRef = useRef(null)
  const dirtyRef  = useRef(true)

  useEffect(() => {
    compositor.setSettings(settings)
    dirtyRef.current = true
  }, [compositor, settings])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !compositor) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let alive = true

    const markDirty = () => { dirtyRef.current = true }
    video.addEventListener('seeked', markDirty)
    video.addEventListener('loadeddata', markDirty)

    const loop = () => {
      if (!alive) return
      if (!video.paused || dirtyRef.current) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.min(video.videoWidth,  Math.round(rect.width  * dpr))
        const h = Math.min(video.videoHeight, Math.round(rect.height * dpr))
        if (w > 0 && h > 0) {
          if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
          if (compositor.drawFrame(video, ctx, w, h)) dirtyRef.current = false
        }
      }
      raf = requestAnimationFrame(loop)
    }
    dirtyRef.current = true
    loop()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      video.removeEventListener('seeked', markDirty)
      video.removeEventListener('loadeddata', markDirty)
    }
  }, [compositor, video, rect.width, rect.height])

  return (
    <canvas
      ref={canvasRef}
      className="bg-preview"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    />
  )
}

export function BackgroundControls({ settings, onChange, render, canRender, onApply, onCancel }) {
  const fileRef = useRef(null)
  const busy = !!render

  async function pickImage(file) {
    if (!file) return
    try {
      const image = await loadImageFile(file)
      onChange({ mode: 'image', image })
    } catch {
      /* ignore unreadable image */
    }
  }

  const set = patch => onChange(patch)

  return (
    <div className="tool-panel">
      <div className="tool-panel-title">
        <strong>Replace Background</strong>
        <span>
          {busy
            ? 'Rendering happens in real time — keep this tab visible until it finishes.'
            : 'Preview updates live. Apply renders the whole clip (takes about as long as the clip).'}
        </span>
      </div>

      <div className="tool-panel-row">
        <span className="tool-panel-label">Background</span>
        <div className="chip-row">
          <button className={`chip${settings.mode === 'color' ? ' active' : ''}`} disabled={busy} onClick={() => set({ mode: 'color' })}>Solid color</button>
          <button className={`chip${settings.mode === 'image' ? ' active' : ''}`} disabled={busy} onClick={() => settings.image ? set({ mode: 'image' }) : fileRef.current?.click()}>Photo</button>
          <button className={`chip${settings.mode === 'blur'  ? ' active' : ''}`} disabled={busy} onClick={() => set({ mode: 'blur' })}>Blur original</button>
        </div>
      </div>

      {settings.mode === 'color' && (
        <div className="tool-panel-row">
          <span className="tool-panel-label">Color</span>
          <div className="chip-row">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`swatch${settings.color === c ? ' active' : ''}`}
                style={{ background: c }}
                title={c}
                disabled={busy}
                onClick={() => set({ color: c })}
              />
            ))}
            <input
              type="color"
              value={settings.color}
              disabled={busy}
              onChange={e => set({ color: e.target.value })}
              className="color-input"
              title="Custom color"
            />
          </div>
        </div>
      )}

      {settings.mode === 'image' && (
        <div className="tool-panel-row">
          <span className="tool-panel-label">Photo</span>
          <div className="chip-row">
            {settings.image && (
              <img src={settings.image.src} alt="" className="bg-thumb" />
            )}
            <button className="chip" disabled={busy} onClick={() => fileRef.current?.click()}>
              {settings.image ? 'Change photo…' : 'Choose photo…'}
            </button>
          </div>
        </div>
      )}

      {settings.mode === 'blur' && (
        <div className="tool-panel-row">
          <span className="tool-panel-label">Blur</span>
          <input type="range" min={4} max={40} step={1} value={settings.blur} disabled={busy}
                 onChange={e => set({ blur: Number(e.target.value) })} />
          <span className="tool-panel-value">{settings.blur}px</span>
        </div>
      )}

      <div className="tool-panel-row">
        <span className="tool-panel-label">Edge</span>
        <input type="range" min={0.02} max={0.5} step={0.01} value={settings.softness} disabled={busy}
               title="Softness of the cut-out edge"
               onChange={e => set({ softness: Number(e.target.value) })} />
        <span className="tool-panel-label" style={{ marginLeft: 12 }}>Threshold</span>
        <input type="range" min={0.1} max={0.9} step={0.01} value={settings.threshold} disabled={busy}
               title="Lower keeps more of the frame as 'person'"
               onChange={e => set({ threshold: Number(e.target.value) })} />
        <label className="check-inline">
          <input type="checkbox" checked={settings.invert} disabled={busy}
                 onChange={e => set({ invert: e.target.checked })} />
          Invert
        </label>
      </div>

      {render && (
        <div className="tool-panel-row">
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill" style={{ width: `${Math.round(render.progress * 100)}%` }} />
          </div>
          <span className="tool-panel-value">{Math.round(render.progress * 100)}%</span>
        </div>
      )}

      <div className="tool-panel-actions">
        <button className="btn btn-ghost" onClick={onCancel}>{busy ? 'Cancel render' : 'Cancel'}</button>
        <button
          className="btn btn-primary"
          onClick={onApply}
          disabled={busy || !canRender || (settings.mode === 'image' && !settings.image)}
          title={canRender ? '' : 'This browser cannot record video'}
        >
          {busy ? 'Rendering…' : 'Apply to whole clip'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { pickImage(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )
}
