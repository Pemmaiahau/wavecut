import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import FileUpload        from './components/FileUpload'
import VideoPreview      from './components/VideoPreview'
import WaveformEditor    from './components/WaveformEditor'
import Toolbar           from './components/Toolbar'
import JoinModal         from './components/JoinModal'
import ExportModal, { downloadBlob } from './components/ExportModal'
import ExtractAudioModal from './components/ExtractAudioModal'
import SplitModal        from './components/SplitModal'
import { CropOverlay, CropControls, ASPECTS, fitCrop } from './components/CropTool'
import { BackgroundOverlay, BackgroundControls } from './components/BackgroundTool'
import { useUndoRedo } from './hooks/useUndoRedo'
import {
  loadFfmpeg,
  setProgressHandler,
  removeSection,
  trimRange,
  joinAudio,
  fadeIn,
  fadeOut,
  loopSection,
  changeSpeed,
  cropVideo,
  rotateVideo,
  extractAudio,
  prepareVideo,
  finalizeRecording,
  getMimeType,
  isVideoExt,
} from './lib/processor'
import { loadSegmenter, BackgroundCompositor, DEFAULT_BG_SETTINGS } from './lib/segmenter'
import { renderBackground, canRender } from './lib/renderer'

// Waveform peaks are keyed by the exact byte array so undo/redo is instant.
const peaksCache = new WeakMap()
const peaksJobs  = new WeakMap()   // in-flight prepareVideo promises

export default function App() {
  const [fileName,    setFileName]    = useState(null)
  const [region,      setRegion]      = useState(null)   // {start, end} seconds
  const [duration,    setDuration]    = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [busy,        setBusy]        = useState(false)
  const [busyMsg,     setBusyMsg]     = useState('')
  const [busyPct,     setBusyPct]     = useState(null)
  const [analyzing,   setAnalyzing]   = useState(false)  // computing video peaks
  const [ffReady,     setFfReady]     = useState(false)
  const [modal,       setModal]       = useState(null)   // 'join' | 'export' | 'extract' | 'split'
  const [toolTab,     setToolTab]     = useState('edit') // toolbar tab, kept here so tools don't reset it
  const [toast,       setToast]       = useState(null)
  const [mediaEl,     setMediaEl]     = useState(null)
  const [peaks,       setPeaks]       = useState(undefined)

  // Tool modes that take over the video preview
  const [tool,        setTool]        = useState(null)   // null | 'crop' | 'background'
  const [crop,        setCrop]        = useState(null)
  const [aspect,      setAspect]      = useState('free')
  const [bgSettings,  setBgSettings]  = useState(DEFAULT_BG_SETTINGS)
  const [compositor,  setCompositor]  = useState(null)
  const [render,      setRender]      = useState(null)   // { progress } while rendering
  const renderAbort = useRef(null)

  const wsRef = useRef(null)
  const toastTimer = useRef(null)

  // The document is { data: Uint8Array, ext } — ext travels with the bytes
  // because some edits change the container (a background render yields WebM).
  const { state: doc, set: setDoc, undo, redo, reset, replace, canUndo, canRedo } = useUndoRedo(null)
  const audioData = doc?.data ?? null
  const fileExt   = doc?.ext  ?? null
  const isVideo   = fileExt ? isVideoExt(fileExt) : false

  function showError(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
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

  // Runs an ffmpeg op and pushes its output as the new document. `fn` may
  // return raw bytes (same ext) or { data, ext }.
  async function withProcessing(label, fn, { push = true } = {}) {
    setBusy(true)
    setBusyMsg(label)
    setBusyPct(null)
    setProgressHandler(p => setBusyPct(p))
    try {
      await ensureFfmpeg()
      setBusy(true)
      setBusyMsg(label)
      const result = await fn()
      if (result && push) {
        if (result instanceof Uint8Array) setDoc({ data: result, ext: fileExt })
        else setDoc(result)
      }
      return result
    } catch (e) {
      if (e.message !== 'blocked') showError(e.message || 'Processing failed')
      return null
    } finally {
      setProgressHandler(null)
      setBusyPct(null)
      setBusy(false)
      setBusyMsg('')
    }
  }

  // ── Video documents: waveform peaks + silent-track normalisation ──
  // `peaks` is always tagged with the bytes it describes (`forData`) so the
  // waveform can never show a stale analysis for a new document.
  useEffect(() => {
    if (!doc || !isVideoExt(doc.ext)) { setPeaks(null); setAnalyzing(false); return }
    const cached = peaksCache.get(doc.data)
    if (cached) { setPeaks(cached); setAnalyzing(false); return }

    let cancelled = false
    setAnalyzing(true)
    ;(async () => {
      try {
        // Memoised per byte array so a re-run (StrictMode, quick undo/redo)
        // shares the in-flight analysis instead of starting a second one.
        let job = peaksJobs.get(doc.data)
        if (!job) { job = prepareVideo(doc.data, doc.ext); peaksJobs.set(doc.data, job) }
        const { data, replaced, peaks: p, fps } = await job
        setFfReady(true)
        const entry = { forData: data, samples: p.samples, rate: p.rate, fps }
        peaksCache.set(data, entry)
        if (cancelled) return
        // A silent track was added: swap the bytes in place, which re-runs
        // this effect and hits the cache.
        if (replaced) replace({ data, ext: doc.ext })
        else setPeaks(entry)
      } catch (e) {
        if (cancelled) return
        showError('Could not analyze this video: ' + (e.message || e))
        setPeaks({ forData: doc.data, samples: new Float32Array(100), rate: 1000, fps: 30 })
      } finally {
        if (!cancelled) setAnalyzing(false)
      }
    })()
    return () => { cancelled = true }
  }, [doc]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── File select ──────────────────────────────────────────────
  async function handleFileSelect(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    setFileName(file.name)
    setRegion(null)
    setTool(null)

    if (file.size > 800 * 1024 * 1024) {
      showError('Files over ~800 MB may exceed the browser engine\'s memory. Try a smaller file if edits fail.')
    }

    const buffer = await file.arrayBuffer()
    reset({ data: new Uint8Array(buffer), ext })

    // Start loading ffmpeg in background (non-blocking)
    loadFfmpeg().then(() => setFfReady(true)).catch(() => {})
  }

  // ── Edit operations ─────────────────────────────────────────
  const clearSelection = () => { setRegion(null); wsRef.current?.clearRegion() }

  const handleRemove = useCallback(async () => {
    if (!region) return showError('Select a region on the waveform first')
    await withProcessing('Removing selected region…', () =>
      removeSection(audioData, fileExt, region.start, region.end)
    )
    clearSelection()
  }, [region, audioData, fileExt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeep = useCallback(async () => {
    if (!region) return showError('Select a region on the waveform first')
    await withProcessing('Trimming to selection…', () =>
      trimRange(audioData, fileExt, region.start, region.end)
    )
    clearSelection()
  }, [region, audioData, fileExt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSplit = useCallback(async (keep, downloadOther) => {
    const at = currentTime
    const base = (fileName || 'clip').replace(/\.[^.]+$/, '')
    await withProcessing('Splitting clip…', async () => {
      const first  = () => trimRange(audioData, fileExt, 0, at)
      const second = () => trimRange(audioData, fileExt, at, duration)
      const kept   = keep === 'first' ? await first() : await second()
      if (downloadOther) {
        const other = keep === 'first' ? await second() : await first()
        downloadBlob(other, `${base}-part${keep === 'first' ? 2 : 1}.${fileExt}`)
      }
      return kept
    })
    setModal(null)
    clearSelection()
  }, [audioData, fileExt, currentTime, duration, fileName]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSpeed = useCallback(async (factor) => {
    await withProcessing(`Changing speed to ${factor}×…`, () =>
      changeSpeed(audioData, fileExt, factor)
    )
    clearSelection()
  }, [audioData, fileExt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFadeIn = useCallback(async (dur) => {
    await withProcessing(`Applying ${dur}s fade in…`, () =>
      fadeIn(audioData, fileExt, dur)
    )
  }, [audioData, fileExt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFadeOut = useCallback(async (dur) => {
    await withProcessing(`Applying ${dur}s fade out…`, () =>
      fadeOut(audioData, fileExt, duration, dur)
    )
  }, [audioData, fileExt, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoop = useCallback(async (count) => {
    if (!region) return showError('Select a region on the waveform first')
    await withProcessing(`Looping region ×${count}…`, () =>
      loopSection(audioData, fileExt, region.start, region.end, count)
    )
  }, [region, audioData, fileExt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = useCallback(async (joinFile, insertAt) => {
    const joinExt = joinFile.name.split('.').pop().toLowerCase()
    const buf     = await joinFile.arrayBuffer()
    const joinData = new Uint8Array(buf)
    await withProcessing('Joining files…', () =>
      joinAudio(audioData, fileExt, joinData, joinExt, insertAt, duration)
    )
    setModal(null)
  }, [audioData, fileExt, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRotate = useCallback(async (mode) => {
    await withProcessing('Rotating video…', () => rotateVideo(audioData, fileExt, mode))
  }, [audioData, fileExt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExtractAudio = useCallback(async (format, target) => {
    const base = (fileName || 'audio').replace(/\.[^.]+$/, '')
    await withProcessing('Extracting audio…', async () => {
      const bytes = await extractAudio(audioData, fileExt, format)
      if (target === 'download') { downloadBlob(bytes, `${base}.${format}`); return null }
      return { data: bytes, ext: format }
    })
    setModal(null)
  }, [audioData, fileExt, fileName]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Crop tool ───────────────────────────────────────────────
  function startCrop() {
    if (!mediaEl?.videoWidth) return showError('Video is still loading')
    wsRef.current?.pause()
    setAspect('free')
    setCrop(fitCrop(mediaEl.videoWidth, mediaEl.videoHeight, null))
    setTool('crop')
  }

  function handleAspect(id) {
    setAspect(id)
    const ratio = ASPECTS.find(a => a.id === id)?.ratio ?? null
    setCrop(fitCrop(mediaEl.videoWidth, mediaEl.videoHeight, ratio))
  }

  async function applyCrop() {
    const c = crop
    setTool(null)
    await withProcessing('Cropping video…', () => cropVideo(audioData, fileExt, c))
  }

  // ── Background tool ─────────────────────────────────────────
  async function startBackground() {
    if (!mediaEl?.videoWidth) return showError('Video is still loading')
    wsRef.current?.pause()
    if (!compositor) {
      setBusy(true)
      setBusyMsg('Loading background model…')
      try {
        const seg = await loadSegmenter()
        setCompositor(new BackgroundCompositor(seg))
      } catch (e) {
        showError('Could not load the segmentation model: ' + (e.message || e))
        return
      } finally {
        setBusy(false)
        setBusyMsg('')
      }
    }
    setTool('background')
  }

  function updateBg(patch) {
    setBgSettings(s => {
      if (patch.image && s.image && s.image !== patch.image) URL.revokeObjectURL(s.image.src)
      return { ...s, ...patch }
    })
  }

  async function applyBackground() {
    wsRef.current?.pause()
    const url = URL.createObjectURL(new Blob([audioData], { type: getMimeType(fileExt) }))
    const ctrl = new AbortController()
    renderAbort.current = ctrl
    setRender({ progress: 0 })
    try {
      const renderComp = new BackgroundCompositor(compositor.segmenter)
      renderComp.setSettings(bgSettings)
      const source = { data: audioData, ext: fileExt }
      const { blob, mimeType, hasAudio } = await renderBackground({
        src: url,
        compositor: renderComp,
        fps: peaks?.fps || 30,
        signal: ctrl.signal,
        onProgress: p => setRender({ progress: p }),
      })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      setRender(null)
      setTool(null)
      await withProcessing('Finalizing video…', () => finalizeRecording(bytes, mimeType, { hasAudio, source }))
    } catch (e) {
      if (e.name !== 'AbortError') showError(e.message || 'Render failed')
    } finally {
      URL.revokeObjectURL(url)
      renderAbort.current = null
      setRender(null)
    }
  }

  function cancelBackground() {
    if (renderAbort.current) { renderAbort.current.abort(); return }
    setTool(null)
  }

  const handleUndo = () => { undo(); clearSelection() }
  const handleRedo = () => { redo(); clearSelection() }

  // ── New file ─────────────────────────────────────────────────
  function handleNew() {
    reset(null)
    setFileName(null)
    setRegion(null)
    setDuration(0)
    setCurrentTime(0)
    setTool(null)
    setPeaks(undefined)
  }

  const cropRatio = useMemo(() => ASPECTS.find(a => a.id === aspect)?.ratio ?? null, [aspect])

  // ── Render: upload screen ─────────────────────────────────────
  if (!audioData) {
    return <FileUpload onFileSelect={handleFileSelect} />
  }

  const toolActive = tool !== null
  const uiBusy = busy || analyzing || !!render

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
            disabled={!canUndo || uiBusy || toolActive}
            title="Undo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
            </svg>
          </button>
          <button
            className="btn-icon"
            onClick={handleRedo}
            disabled={!canRedo || uiBusy || toolActive}
            title="Redo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 15.5h9v-9l-3.6 4.1z"/>
            </svg>
          </button>
        </div>

        <div className="header-right">
          <button className="btn btn-ghost" onClick={handleNew} disabled={uiBusy}>
            New File
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setModal('export')}
            disabled={uiBusy || toolActive}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}>
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/>
            </svg>
            Export
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className={`main${isVideo ? ' has-video' : ''}`}>
        <VideoPreview visible={isVideo} onMediaElement={setMediaEl}>
          {({ rect, video }) => (
            <>
              {tool === 'crop' && crop && (
                <CropOverlay rect={rect} crop={crop} ratio={cropRatio} onChange={setCrop} />
              )}
              {tool === 'background' && compositor && !render && (
                <BackgroundOverlay rect={rect} video={video} compositor={compositor} settings={bgSettings} />
              )}
            </>
          )}
        </VideoPreview>

        <WaveformEditor
          ref={wsRef}
          audioData={audioData}
          fileExt={fileExt}
          mediaElement={mediaEl}
          peaks={peaks}
          onRegionChange={setRegion}
          onDurationChange={setDuration}
          onTimeUpdate={setCurrentTime}
          isProcessing={uiBusy}
        />

        {/* Region indicator */}
        {region && !toolActive && (
          <div style={{ padding: '0 24px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="region-display">
              <span className="dot" />
              Selected: {fmtSec(region.start)} – {fmtSec(region.end)}
              &nbsp;({(region.end - region.start).toFixed(2)}s)
            </div>
            <button
              className="btn-icon"
              style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.78rem' }}
              onClick={clearSelection}
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        )}

        {tool === 'crop' && crop && mediaEl && (
          <CropControls
            crop={crop}
            aspect={aspect}
            onAspect={handleAspect}
            vw={mediaEl.videoWidth}
            vh={mediaEl.videoHeight}
            busy={uiBusy}
            onApply={applyCrop}
            onCancel={() => setTool(null)}
          />
        )}

        {tool === 'background' && (
          <BackgroundControls
            settings={bgSettings}
            onChange={updateBg}
            render={render}
            canRender={canRender()}
            onApply={applyBackground}
            onCancel={cancelBackground}
          />
        )}

        {!toolActive && (
          <Toolbar
            region={region}
            isVideo={isVideo}
            isProcessing={uiBusy}
            tab={toolTab}
            onTabChange={setToolTab}
            onRemove={handleRemove}
            onKeep={handleKeep}
            onSplit={() => setModal('split')}
            onSpeed={handleSpeed}
            onJoin={() => setModal('join')}
            onFadeIn={handleFadeIn}
            onFadeOut={handleFadeOut}
            onLoop={handleLoop}
            onExtractAudio={() => setModal('extract')}
            onCrop={startCrop}
            onRotate={handleRotate}
            onBackground={startBackground}
          />
        )}
      </main>

      {/* ── Modals ── */}
      {modal === 'join' && (
        <JoinModal
          duration={duration}
          currentTime={currentTime}
          onJoin={handleJoin}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'export' && (
        <ExportModal
          audioData={audioData}
          fileExt={fileExt}
          fileName={fileName}
          ffmpegReady={ffReady}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'extract' && (
        <ExtractAudioModal
          onExtract={handleExtractAudio}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'split' && (
        <SplitModal
          at={currentTime}
          duration={duration}
          onSplit={handleSplit}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Processing overlay ── */}
      {(busy || analyzing) && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="spinner" />
            <p>
              {busy ? (busyMsg || 'Processing…') : 'Analyzing audio…'}
              {busy && busyPct !== null && busyPct > 0 ? ` ${busyPct}%` : ''}
            </p>
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
