import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { getMimeType, isVideoExt } from '../lib/processor'

function fmt(t) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const ms = Math.floor((t % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`
}

// `mediaElement` is the <video> rendered by VideoPreview; wavesurfer drives
// it directly so the picture, audio and waveform cursor never drift apart.
// `peaks` is only used for video files (see processor.prepareVideo) and is
// tagged with the bytes it was computed for; the load waits until the tag
// matches `audioData`.
const WaveformEditor = forwardRef(function WaveformEditor(
  { audioData, fileExt, mediaElement, peaks, onRegionChange, onDurationChange, onTimeUpdate, isProcessing },
  ref
) {
  const containerRef = useRef(null)
  const wsRef        = useRef(null)
  const regRef       = useRef(null)
  const blobRef      = useRef(null)
  const loadedRef    = useRef(null)   // the Uint8Array currently loaded

  const [playing,  setPlaying]  = useState(false)
  const [curTime,  setCurTime]  = useState(0)
  const [duration, setDuration] = useState(0)
  const [zoom,     setZoom]     = useState(50)
  const [ready,    setReady]    = useState(false)

  // (Re)create WaveSurfer whenever the media element changes
  useEffect(() => {
    if (!mediaElement) return
    const regions = RegionsPlugin.create()
    regRef.current = regions

    const ws = WaveSurfer.create({
      container:     containerRef.current,
      media:         mediaElement,
      waveColor:     '#6366f1',
      progressColor: '#a78bfa',
      cursorColor:   'rgba(255,255,255,0.6)',
      cursorWidth:   1,
      barWidth:      2,
      barGap:        1,
      barRadius:     2,
      height:        110,
      normalize:     true,
      interact:      true,
      plugins:       [regions],
    })

    wsRef.current = ws
    loadedRef.current = null

    ws.on('ready', () => {
      const d = ws.getDuration()
      setDuration(d)
      setReady(true)
      onDurationChange?.(d)
    })

    ws.on('timeupdate', t => {
      setCurTime(t)
      onTimeUpdate?.(t)
    })

    ws.on('play',   () => setPlaying(true))
    ws.on('pause',  () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))

    regions.enableDragSelection({ color: 'rgba(99,102,241,0.2)' })

    regions.on('region-created', region => {
      regions.getRegions().forEach(r => { if (r.id !== region.id) r.remove() })
      onRegionChange?.({ start: region.start, end: region.end })
    })

    regions.on('region-updated', region => {
      onRegionChange?.({ start: region.start, end: region.end })
    })

    return () => {
      ws.destroy()
      wsRef.current = null
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    }
  }, [mediaElement]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the document into wavesurfer when the bytes (or, for video, the
  // peaks for those bytes) become available.
  useEffect(() => {
    const ws = wsRef.current
    if (!audioData || !ws) return
    const video = isVideoExt(fileExt)
    if (video && peaks?.forData !== audioData) return
    if (loadedRef.current === audioData) return
    loadedRef.current = audioData

    setReady(false)
    setPlaying(false)
    setCurTime(0)

    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    const blob = new Blob([audioData], { type: getMimeType(fileExt) })
    const url  = URL.createObjectURL(blob)
    blobRef.current = url

    if (video) {
      ws.load(url, [peaks.samples]).catch(() => {})
    } else {
      ws.load(url).catch(() => {})
    }
    regRef.current?.getRegions().forEach(r => r.remove())
    onRegionChange?.(null)
  }, [audioData, peaks, mediaElement]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync zoom
  useEffect(() => {
    if (wsRef.current && ready) wsRef.current.zoom(zoom)
  }, [zoom, ready])

  useImperativeHandle(ref, () => ({
    play:   () => wsRef.current?.play(),
    pause:  () => wsRef.current?.pause(),
    seekTo: (t) => {
      const d = wsRef.current?.getDuration()
      if (d) wsRef.current.seekTo(Math.min(t / d, 1))
    },
    clearRegion: () => {
      regRef.current?.getRegions().forEach(r => r.remove())
      onRegionChange?.(null)
    },
  }))

  const togglePlay = () => wsRef.current?.playPause()
  const skipBack   = () => { wsRef.current?.seekTo(0); setCurTime(0) }
  const skipFwd    = () => { wsRef.current?.seekTo(1); setCurTime(duration) }

  return (
    <div className="waveform-panel">
      <div className="waveform-wrap" style={{ opacity: isProcessing ? 0.45 : 1 }}>
        <div className="waveform-inner">
          {!audioData && (
            <div className="waveform-empty">No file loaded</div>
          )}
          {audioData && !ready && (
            <div className="waveform-empty">Analyzing audio…</div>
          )}
          <div ref={containerRef} />
        </div>
      </div>

      <div className="transport">
        <button className="btn-icon" onClick={skipBack} disabled={!ready} title="Go to start">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
          </svg>
        </button>

        <button className="btn-play" onClick={togglePlay} disabled={!ready} title={playing ? 'Pause' : 'Play'}>
          {playing
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft:2}}><path d="M8 5v14l11-7z"/></svg>
          }
        </button>

        <button className="btn-icon" onClick={skipFwd} disabled={!ready} title="Go to end">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5-3.9v7.8L8.5 12zM16 6h2v12h-2z"/>
          </svg>
        </button>

        <span className="time-display">{fmt(curTime)} / {fmt(duration)}</span>

        <div className="zoom-row" style={{ marginLeft: 'auto' }}>
          <span className="zoom-label">Zoom</span>
          <input
            type="range"
            className="zoom-slider"
            min={10}
            max={300}
            value={zoom}
            disabled={!ready}
            onChange={e => setZoom(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  )
})

export default WaveformEditor
