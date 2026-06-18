import { useState } from 'react'

function IconCut()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/></svg> }
function IconJoin()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/><path d="M11 3v18h2V3h-2z"/></svg> }
function IconFadeIn() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h2v18H3zm4 4h2v14H7zm4 4h2v10h-2zm4 4h2v6h-2zm4 4h2v2h-2z"/></svg> }
function IconFadeOut(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17h2v4H3zm4-4h2v8H7zm4-4h2v12h-2zm4-4h2v16h-2zm4-4h2v20h-2z"/></svg> }
function IconLoop()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg> }

export default function Toolbar({
  region,
  isProcessing,
  onRemove,
  onJoin,
  onFadeIn,
  onFadeOut,
  onLoop,
}) {
  const [fadeInDur,  setFadeInDur]  = useState(2)
  const [fadeOutDur, setFadeOutDur] = useState(2)
  const [loopCount,  setLoopCount]  = useState(3)

  const busy = isProcessing
  const noRegion = !region

  return (
    <div className="toolbar">
      {/* Cut */}
      <div className="toolbar-group">
        <button
          className="tool-btn danger"
          disabled={busy || noRegion}
          onClick={onRemove}
          title={noRegion ? 'Select a region first' : 'Remove selected region'}
        >
          <span className="icon"><IconCut /></span>
          <span className="label">Remove Selected</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Join */}
      <div className="toolbar-group">
        <button
          className="tool-btn"
          disabled={busy}
          onClick={onJoin}
          title="Join another audio/video file"
        >
          <span className="icon"><IconJoin /></span>
          <span className="label">Join Audio</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Fade In */}
      <div className="toolbar-group">
        <div className="param-inline">
          <IconFadeIn />
          <span>Fade&nbsp;In</span>
          <input
            type="number"
            value={fadeInDur}
            min={0.1}
            max={30}
            step={0.5}
            disabled={busy}
            onChange={e => setFadeInDur(parseFloat(e.target.value) || 1)}
          />
          <span>s</span>
        </div>
        <button
          className="tool-btn"
          disabled={busy}
          onClick={() => onFadeIn(fadeInDur)}
          title="Apply fade in"
        >
          Apply
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Fade Out */}
      <div className="toolbar-group">
        <div className="param-inline">
          <IconFadeOut />
          <span>Fade&nbsp;Out</span>
          <input
            type="number"
            value={fadeOutDur}
            min={0.1}
            max={30}
            step={0.5}
            disabled={busy}
            onChange={e => setFadeOutDur(parseFloat(e.target.value) || 1)}
          />
          <span>s</span>
        </div>
        <button
          className="tool-btn"
          disabled={busy}
          onClick={() => onFadeOut(fadeOutDur)}
          title="Apply fade out"
        >
          Apply
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Loop */}
      <div className="toolbar-group">
        <div className="param-inline">
          <IconLoop />
          <span>Loop</span>
          <input
            type="number"
            value={loopCount}
            min={2}
            max={20}
            step={1}
            disabled={busy || noRegion}
            onChange={e => setLoopCount(parseInt(e.target.value) || 2)}
          />
          <span>×</span>
        </div>
        <button
          className="tool-btn"
          disabled={busy || noRegion}
          onClick={() => onLoop(loopCount)}
          title={noRegion ? 'Select a region first' : `Repeat region ${loopCount} times`}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
