// Full-length background render. ffmpeg.wasm can't run the ML model, so the
// composite is produced in the page and handed to processor.finalizeRecording().
//
// Preferred path (WebCodecs): step through the clip frame by frame — seek,
// segment + composite onto a canvas, encode with an explicit timestamp, mux
// to MP4. Deterministic and frame-accurate no matter how fast the machine
// is; the original audio is copied in afterwards by ffmpeg.
//
// Fallback (MediaRecorder): play a hidden copy in real time and record the
// canvas plus the element's audio. Wall-clock based, so it drifts if the
// machine can't keep up.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

const MAX_SIDE = 1920

function even(n) { return Math.max(2, Math.floor(n / 2) * 2) }

function waitFor(el, event, errMsg = 'Could not load video for rendering') {
  return new Promise((resolve, reject) => {
    const ok  = () => { cleanup(); resolve() }
    const bad = () => { cleanup(); reject(new Error(errMsg)) }
    const cleanup = () => { el.removeEventListener(event, ok); el.removeEventListener('error', bad) }
    el.addEventListener(event, ok)
    el.addEventListener('error', bad)
  })
}

function abortError() {
  return new DOMException('Render cancelled', 'AbortError')
}

async function openVideo(src) {
  const video = document.createElement('video')
  video.src = src
  video.preload = 'auto'
  video.playsInline = true
  video.muted = true
  await waitFor(video, 'loadeddata')
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  return {
    video,
    w: even(video.videoWidth * scale),
    h: even(video.videoHeight * scale),
    duration: video.duration,
    close() { video.pause(); video.removeAttribute('src'); video.load() },
  }
}

// ── WebCodecs path ───────────────────────────────────────────────

const AVC_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'] // High/Main L4.0, Baseline L3.1

async function pickEncoderConfig(w, h, fps) {
  if (typeof VideoEncoder === 'undefined') return null
  const bitrate = Math.max(1_000_000, Math.min(8_000_000, Math.round(w * h * fps * 0.07)))
  const candidates = [
    ...AVC_CODECS.map(codec => ({ codec, avc: { format: 'avc' }, muxCodec: 'avc' })),
    { codec: 'vp09.00.31.08', muxCodec: 'vp9' },
  ]
  for (const c of candidates) {
    const config = { codec: c.codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality', ...(c.avc ? { avc: c.avc } : {}) }
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config)
      if (supported) return { config, muxCodec: c.muxCodec }
    } catch { /* try next */ }
  }
  return null
}

function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return resolve()
    const ok  = () => { cleanup(); resolve() }
    const bad = () => { cleanup(); reject(new Error('Seek failed')) }
    const cleanup = () => { video.removeEventListener('seeked', ok); video.removeEventListener('error', bad) }
    video.addEventListener('seeked', ok)
    video.addEventListener('error', bad)
    video.currentTime = t
  })
}

async function renderWithWebCodecs({ src, compositor, fps, onProgress, signal }) {
  const clip = await openVideo(src)
  const { video, w, h, duration } = clip
  const enc = await pickEncoderConfig(w, h, fps)
  if (!enc) { clip.close(); return null }

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: enc.muxCodec, width: w, height: h, frameRate: fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })

  let encodeError = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error:  e => { encodeError = e },
  })
  encoder.configure(enc.config)

  const frameUs = Math.round(1e6 / fps)
  const total = Math.max(1, Math.round(duration * fps))
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError()
      if (encodeError) throw encodeError
      const t = Math.min(i / fps, Math.max(0, duration - 0.001))
      await seekTo(video, t)
      compositor.drawFrame(video, ctx, w, h)
      const frame = new VideoFrame(canvas, { timestamp: i * frameUs, duration: frameUs })
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      // Back-pressure: don't let the encode queue run away from the encoder
      if (encoder.encodeQueueSize > 6) {
        await new Promise(r => encoder.addEventListener('dequeue', r, { once: true }))
      }
      onProgress?.((i + 1) / total)
    }
    await encoder.flush()
    if (encodeError) throw encodeError
    encoder.close()
    muxer.finalize()
  } catch (e) {
    try { encoder.close() } catch { /* already closed */ }
    throw e
  } finally {
    clip.close()
  }

  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), mimeType: 'video/mp4', hasAudio: false }
}

// ── MediaRecorder fallback ───────────────────────────────────────

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return null
  return MIME_CANDIDATES.find(m => MediaRecorder.isTypeSupported(m)) || null
}

async function renderWithMediaRecorder({ src, compositor, onProgress, signal }) {
  const mimeType = pickRecorderMime()
  if (!mimeType) throw new Error('This browser cannot render video (no WebCodecs or MediaRecorder support)')

  const clip = await openVideo(src)
  const { video, w, h, duration } = clip
  video.muted = false

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')

  // Route the element's audio into the recording without playing it aloud:
  // a MediaElementSource that is never connected to the speakers.
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  const source   = audioCtx.createMediaElementSource(video)
  const dest     = audioCtx.createMediaStreamDestination()
  source.connect(dest)
  await audioCtx.resume()

  const stream = canvas.captureStream(30)
  dest.stream.getAudioTracks().forEach(t => stream.addTrack(t))

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: Math.min(12_000_000, Math.round(w * h * 30 * 0.12)),
    audioBitsPerSecond: 128_000,
  })
  const chunks = []
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }

  const useRVFC = typeof video.requestVideoFrameCallback === 'function'
  let stopped = false
  let rafId = 0

  const finished = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      if (signal?.aborted) reject(abortError())
      else resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mimeType }), mimeType: recorder.mimeType || mimeType, hasAudio: true })
    }
    recorder.onerror = e => reject(e.error || new Error('Recording failed'))
  })

  const stop = () => {
    if (stopped) return
    stopped = true
    if (rafId) cancelAnimationFrame(rafId)
    video.pause()
    if (recorder.state !== 'inactive') recorder.stop()
    stream.getTracks().forEach(t => t.stop())
    audioCtx.close().catch(() => {})
  }

  const drawLoop = () => {
    if (stopped) return
    compositor.drawFrame(video, ctx, w, h)
    onProgress?.(duration ? Math.min(1, video.currentTime / duration) : 0)
    if (video.ended) { stop(); return }
    if (useRVFC) video.requestVideoFrameCallback(drawLoop)
    else rafId = requestAnimationFrame(drawLoop)
  }

  signal?.addEventListener('abort', stop, { once: true })
  video.addEventListener('ended', stop, { once: true })

  compositor.drawFrame(video, ctx, w, h)
  await new Promise((resolve, reject) => {
    video.addEventListener('playing', () => {
      if (stopped) return resolve()
      recorder.start(1000)
      drawLoop()
      resolve()
    }, { once: true })
    video.play().catch(reject)
  })

  try {
    return await finished
  } finally {
    stop()
    clip.close()
  }
}

// ── Public API ───────────────────────────────────────────────────

export function canRender() {
  return typeof VideoEncoder !== 'undefined' || (!!pickRecorderMime() && !!HTMLCanvasElement.prototype.captureStream)
}

/**
 * @param {object} opts
 * @param {string} opts.src              blob URL of the source video
 * @param {import('./segmenter').BackgroundCompositor} opts.compositor
 * @param {number} [opts.fps]            output frame rate (default 30)
 * @param {(p: number) => void} [opts.onProgress]   0–1
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ blob: Blob, mimeType: string, hasAudio: boolean }>}
 */
export async function renderBackground({ src, compositor, fps = 30, onProgress, signal }) {
  fps = Math.max(10, Math.min(60, Math.round(fps || 30)))
  const result = await renderWithWebCodecs({ src, compositor, fps, onProgress, signal })
  if (result) return result
  return renderWithMediaRecorder({ src, compositor, onProgress, signal })
}
