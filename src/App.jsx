import { useState, useRef, useCallback } from 'react'
import FileUpload    from './components/FileUpload'
import WaveformEditor from './components/WaveformEditor'
import Toolbar       from './components/Toolbar'
import JoinModal     from './components/JoinModal'
import ExportModal   from './components/ExportModal'
import { useUndoRedo } from './hooks/useUndoRedo'
import {
  loadFfmpeg,
  removeSection,
  joinAudio,
  fadeIn,
  fadeOut,
  loopSection,
  isVideoExt,
} from './lib/processor'

export default function App() {
  const [fileName,   setFileName]   = useState(null)
  const [fileExt,    setFileExt]    = useState(null)
  const [region,     setRegion]     = useState(null)   // {start, end} seconds
  const [duration,   setDuration]   = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [busy,       setBusy]       = useState(false)
  const [busyMsg,    setBusyMsg]    = useState('')
  const [ffReady,    setFfReady]    = useState(false)
  const [showJoin,   setShowJoin]   = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [toast,      setToast]      = useState(null)

  const wsRef = useRef(null)
  const toastTimer = useRef(null)

  const { state: audioData, set: setAudioData, undo, redo, reset, canUndo, canRedo } = useUndoRedo(null)

  function showError(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  async function ensureFfmpeg() {
    if (ffReady) return
    setBusyMsg('Loading audio engine…')
    setBusy(true)
    try {
      await loadFfmpeg()
      setFfReady(true)
    } catch (e) {
      showError('Failed to load audio engine. Check your internet connection.')
      throw e
    } finally {
      setBusy(false)
      setBusyMsg('')
    }
  }

  async function withProcessing(label, fn) {
    setBusy(true)
    setBusyMsg(label)
    try {
      await ensureFfmpeg()
      const result = await fn()
      if (result) setAudioData(result)
    } catch (e) {
      if (e.message !== 'blocked') showError(e.message || 'Processing failed')
    } finally {
      setBusy(false)
      setBusyMsg('')
    }
  }

  // ── File select ──────────────────────────────────────────────
  async function handleFileSelect(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    setFileName(file.name)
    setFileExt(ext)
    setRegion(null)

    const buffer = await file.arrayBuffer()
    reset(new Uint8Array(buffer))

    // Start loading ffmpeg in background (non-blocking)
    loadFfmpeg().then(() => setFfReady(true)).catch(() => {})
  }

  // ── Edit operations ─────────────────────────────────────────
  const handleRemove = useCallback(async () => {
    if (!region) return showError('Select a region on the waveform first')
    await withProcessing('Removing selected region…', () =>
      removeSection(audioData, fileExt, region.start, region.end)
    )
    setRegion(null)
    wsRef.current?.clearRegion()
  }, [region, audioData, fileExt])

  const handleFadeIn = useCallback(async (dur) => {
    await withProcessing(`Applying ${dur}s fade in…`, () =>
      fadeIn(audioData, fileExt, dur)
    )
  }, [audioData, fileExt])

  const handleFadeOut = useCallback(async (dur) => {
    await withProcessing(`Applying ${dur}s fade out…`, () =>
      fadeOut(audioData, fileExt, duration, dur)
    )
  }, [audioData, fileExt, duration])

  const handleLoop = useCallback(async (count) => {
    if (!region) return showError('Select a region on the waveform first')
    await withProcessing(`Looping region ×${count}…`, () =>
      loopSection(audioData, fileExt, region.start, region.end, count)
    )
  }, [region, audioData, fileExt])

  const handleJoin = useCallback(async (joinFile, insertAt) => {
    const joinExt = joinFile.name.split('.').pop().toLowerCase()
    const buf     = await joinFile.arrayBuffer()
    const joinData = new Uint8Array(buf)
    await withProcessing('Joining audio…', () =>
      joinAudio(audioData, fileExt, joinData, joinExt, insertAt, duration)
    )
    setShowJoin(false)
  }, [audioData, fileExt, duration])

  const handleUndo = () => { undo(); setRegion(null); wsRef.current?.clearRegion() }
  const handleRedo = () => { redo(); setRegion(null); wsRef.current?.clearRegion() }

  // ── New file ─────────────────────────────────────────────────
  function handleNew() {
    reset(null)
    setFileName(null)
    setFileExt(null)
    setRegion(null)
    setDuration(0)
    setCurrentTime(0)
  }

  // ── Render: upload screen ─────────────────────────────────────
  if (!audioData) {
    return <FileUpload onFileSelect={handleFileSelect} />
  }

  const isVideo = fileExt ? isVideoExt(fileExt) : false

  // ── Render: editor ────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">🎵</div>
            <span>WaveCut</span>
          </div>
          {fileName && (
            <span className="filename-chip" title={fileName}>{fileName}</span>
          )}
        </div>

        <div className="header-center">
          <button
            className="btn-icon"
            onClick={handleUndo}
            disabled={!canUndo || busy}
            title="Undo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
            </svg>
          </button>
          <button
            className="btn-icon"
            onClick={handleRedo}
            disabled={!canRedo || busy}
            title="Redo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 15.5h9v-9l-3.6 4.1z"/>
            </svg>
          </button>
        </div>

        <div className="header-right">
          <button className="btn btn-ghost" onClick={handleNew} disabled={busy}>
            New File
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowExport(true)}
            disabled={busy}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}>
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/>
            </svg>
            Export
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">
        <WaveformEditor
          ref={wsRef}
          audioData={audioData}
          fileExt={fileExt}
          onRegionChange={setRegion}
          onDurationChange={setDuration}
          onTimeUpdate={setCurrentTime}
          isProcessing={busy}
        />

        {/* Region indicator */}
        {region && (
          <div style={{ padding: '0 24px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="region-display">
              <span className="dot" />
              Selected: {fmtSec(region.start)} – {fmtSec(region.end)}
              &nbsp;({(region.end - region.start).toFixed(2)}s)
            </div>
            <button
              className="btn-icon"
              style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.78rem' }}
              onClick={() => { setRegion(null); wsRef.current?.clearRegion() }}
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        )}

        <Toolbar
          region={region}
          isProcessing={busy}
          onRemove={handleRemove}
          onJoin={() => setShowJoin(true)}
          onFadeIn={handleFadeIn}
          onFadeOut={handleFadeOut}
          onLoop={handleLoop}
        />
      </main>

      {/* ── Modals ── */}
      {showJoin && (
        <JoinModal
          duration={duration}
          currentTime={currentTime}
          onJoin={handleJoin}
          onClose={() => setShowJoin(false)}
        />
      )}

      {showExport && (
        <ExportModal
          audioData={audioData}
          fileExt={fileExt}
          ffmpegReady={ffReady}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* ── Processing overlay ── */}
      {busy && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="spinner" />
            <p>{busyMsg || 'Processing…'}</p>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          ⚠ {toast}
        </div>
      )}
    </div>
  )
}

function fmtSec(t) {
  if (!isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1)
  return `${m}:${s.padStart(4, '0')}`
}
