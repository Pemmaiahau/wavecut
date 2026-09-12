import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg = null
let loadPromise = null
let progressHandler = null
// Ring buffer of recent ffmpeg log lines, used to build useful error messages
const recentLogs = []
const LOG_KEEP = 200

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv'])

export function isVideoExt(ext) {
  return VIDEO_EXTS.has(ext.toLowerCase())
}

export function getMimeType(ext) {
  const map = {
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'video/webm',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
  }
  return map[ext.toLowerCase()] || 'audio/mpeg'
}

// Idempotent and safe to call concurrently — every caller awaits the same
// load promise, so only one FFmpeg instance is ever created.
export async function loadFfmpeg(onProgress) {
  if (!loadPromise) {
    loadPromise = (async () => {
      const ff = new FFmpeg()
      ff.on('progress', ({ progress }) => {
        progressHandler?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
      })
      ff.on('log', ({ message }) => {
        recentLogs.push(message)
        if (recentLogs.length > LOG_KEEP) recentLogs.shift()
        if (import.meta.env.DEV) console.debug('[ffmpeg]', message)
      })
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpeg = ff
    })().catch(e => { loadPromise = null; throw e })
  }
  await loadPromise
  if (onProgress) onProgress(100)
}

// Single global listener for ffmpeg's encode progress (0–100). Pass null to clear.
export function setProgressHandler(fn) {
  progressHandler = fn
}

async function run(args) {
  recentLogs.length = 0
  const code = await ffmpeg.exec(args)
  if (code !== 0) {
    const reason = recentLogs
      .filter(l => /error|invalid|not supported|no such|failed|matches no streams|unable/i.test(l))
      .slice(-2)
      .join(' · ')
    throw new Error(reason ? `ffmpeg: ${reason}` : `ffmpeg exited with code ${code}`)
  }
}

// Frame rate of the first video stream in the most recent run's log
function loggedFps() {
  for (const l of recentLogs) {
    const m = /Video:.*?(\d+(?:\.\d+)?) fps/.exec(l)
    if (m) return Number(m[1])
  }
  return null
}

// Duration reported by ffmpeg in the most recent run's log, in seconds
function loggedDuration() {
  for (let i = recentLogs.length - 1; i >= 0; i--) {
    const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(recentLogs[i])
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  return null
}

// ffmpeg.writeFile transfers the buffer to its worker, which would detach
// the bytes held in undo history — so always hand it a copy.
async function write(name, data) {
  await ffmpeg.writeFile(name, data.slice())
}

async function read(name) {
  return ffmpeg.readFile(name)
}

async function del(name) {
  try { await ffmpeg.deleteFile(name) } catch {}
}

// Every op shares one ffmpeg instance and a flat virtual FS with fixed temp
// file names, so ops must never overlap (e.g. an export while the waveform
// analysis is still running). Public ops are wrapped to run one at a time.
let queue = Promise.resolve()
function serialized(fn) {
  return (...args) => {
    const next = queue.then(async () => { await loadFfmpeg(); return fn(...args) })
    queue = next.catch(() => {})
    return next
  }
}

// Encoder flags that are valid for the target container. WebM only accepts
// VP8/VP9 + Opus/Vorbis; everything else gets H.264 + AAC.
function videoEncodeArgs(ext, { copyAudio = false } = {}) {
  const e = ext.toLowerCase()
  const audio = copyAudio ? ['-c:a', 'copy'] : null
  if (e === 'webm') {
    return [
      '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '4M',
      ...(audio || ['-c:a', 'libopus', '-b:a', '128k']),
    ]
  }
  const args = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio || ['-c:a', 'aac'])]
  if (e === 'mp4' || e === 'mov') args.push('-movflags', '+faststart')
  return args
}

// ── Remove a region [start, end] (seconds) ──────────────────────
async function removeSectionImpl(data, ext, start, end) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  const s = start.toFixed(6)
  const e = end.toFixed(6)

  if (isVideoExt(ext)) {
    await run([
      '-i', inp,
      '-filter_complex',
      `[0:v]split=2[vi1][vi2];[0:a]asplit=2[ai1][ai2];` +
      `[vi1]trim=0:${s},setpts=PTS-STARTPTS[v1];` +
      `[vi2]trim=${e},setpts=PTS-STARTPTS[v2];` +
      `[ai1]atrim=0:${s},asetpts=PTS-STARTPTS[a1];` +
      `[ai2]atrim=${e},asetpts=PTS-STARTPTS[a2];` +
      `[v1][a1][v2][a2]concat=n=2:v=1:a=1[vo][ao]`,
      '-map', '[vo]', '-map', '[ao]',
      ...videoEncodeArgs(ext),
      out,
    ])
  } else {
    await run([
      '-i', inp,
      '-filter_complex',
      `[0:a]atrim=0:${s},asetpts=PTS-STARTPTS[a1];` +
      `[0:a]atrim=${e},asetpts=PTS-STARTPTS[a2];` +
      `[a1][a2]concat=n=2:v=0:a=1[ao]`,
      '-map', '[ao]',
      out,
    ])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Keep only [start, end] (seconds) ────────────────────────────
// Input-side -ss makes ffmpeg skip straight to the keyframe before `start`
// instead of decoding everything in front of it — matters for long videos.
async function trimRangeImpl(data, ext, start, end) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  const s = Math.max(0, start).toFixed(6)
  const d = Math.max(0.01, end - start).toFixed(6)

  if (isVideoExt(ext)) {
    await run(['-ss', s, '-i', inp, '-t', d, ...videoEncodeArgs(ext), out])
  } else {
    await run(['-ss', s, '-i', inp, '-t', d, out])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Stream info for a file already in the virtual FS ────────────
// ffmpeg prints the input's stream table before doing any work; a run
// limited to 0.01 s is a near-free way to get it.
async function probe(name) {
  recentLogs.length = 0
  await ffmpeg.exec(['-i', name, '-t', '0.01', '-f', 'null', 'probe'])
  const info = { hasVideo: false, hasAudio: false, width: 0, height: 0, fps: 0, duration: loggedDuration() }
  for (const l of recentLogs) {
    if (!/Stream #0:/.test(l)) continue
    if (/: Video:/.test(l) && !info.hasVideo) {
      info.hasVideo = true
      const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(l)
      if (size) { info.width = Number(size[1]); info.height = Number(size[2]) }
      const fps = /(\d+(?:\.\d+)?) fps/.exec(l)
      if (fps) info.fps = Number(fps[1])
    } else if (/: Audio:/.test(l)) {
      info.hasAudio = true
    }
  }
  return info
}

// ── Join another audio/video at a given position (seconds) ──────
// insertAt === null → append at end
async function joinAudioImpl(data1, ext1, data2, ext2, insertAt, totalDuration) {
  const inp1 = `inp1.${ext1}`
  const inp2 = `inp2.${ext2}`
  const out  = `out.${ext1}`
  await write(inp1, data1)
  await write(inp2, data2)

  const appendMode = insertAt === null || insertAt >= totalDuration - 0.01
  const s = appendMode ? null : insertAt.toFixed(6)

  if (!isVideoExt(ext1)) {
    const other = await probe(inp2)
    if (!other.hasAudio) throw new Error('The file to join has no audio track')
    if (appendMode) {
      await run([
        '-i', inp1, '-i', inp2,
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[ao]',
        '-map', '[ao]',
        out,
      ])
    } else {
      await run([
        '-i', inp1, '-i', inp2,
        '-filter_complex',
        `[0:a]atrim=0:${s},asetpts=PTS-STARTPTS[a1];` +
        `[0:a]atrim=${s},asetpts=PTS-STARTPTS[a3];` +
        `[a1][1:a][a3]concat=n=3:v=0:a=1[ao]`,
        '-map', '[ao]',
        out,
      ])
    }
  } else {
    // The concat filter needs every segment at the same resolution, and a
    // video+audio stream pair per segment. Normalise the second file:
    //  • video → scaled/padded to the main clip's size and frame rate
    //  • audio-only → black picture for its duration
    //  • silent video → silent audio track
    const main  = await probe(inp1)
    const other = await probe(inp2)
    if (!other.hasVideo && !other.hasAudio) throw new Error('Could not read the file to join')
    const W = main.width || 1280, H = main.height || 720, F = main.fps || 30
    const dur = (other.duration || 0).toFixed(3)
    const inputs = ['-i', inp1, '-i', inp2]
    let extra = 2
    let pre = ''
    if (other.hasVideo) {
      pre += `[1:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
             `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${F}[v2];`
    } else {
      inputs.push('-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${F}`)
      pre += `[${extra++}:v]trim=0:${dur},setpts=PTS-STARTPTS[v2];`
    }
    if (other.hasAudio) {
      pre += `[1:a]anull[a2];`
    } else {
      inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo')
      pre += `[${extra++}:a]atrim=0:${dur},asetpts=PTS-STARTPTS[a2];`
    }

    if (appendMode) {
      await run([
        ...inputs,
        '-filter_complex',
        pre + '[0:v][0:a][v2][a2]concat=n=2:v=1:a=1[vo][ao]',
        '-map', '[vo]', '-map', '[ao]',
        ...videoEncodeArgs(ext1),
        out,
      ])
    } else {
      await run([
        ...inputs,
        '-filter_complex',
        pre +
        `[0:v]split=2[vi1][vi3];[0:a]asplit=2[ai1][ai3];` +
        `[vi1]trim=0:${s},setpts=PTS-STARTPTS[v1];` +
        `[vi3]trim=${s},setpts=PTS-STARTPTS[v3];` +
        `[ai1]atrim=0:${s},asetpts=PTS-STARTPTS[a1];` +
        `[ai3]atrim=${s},asetpts=PTS-STARTPTS[a3];` +
        `[v1][a1][v2][a2][v3][a3]concat=n=3:v=1:a=1[vo][ao]`,
        '-map', '[vo]', '-map', '[ao]',
        ...videoEncodeArgs(ext1),
        out,
      ])
    }
  }

  const result = await read(out)
  await del(inp1); await del(inp2); await del(out)
  return result
}

// ── Fade in (applies to first `dur` seconds) ────────────────────
async function fadeInImpl(data, ext, dur) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  const d = dur.toFixed(3)
  if (isVideoExt(ext)) {
    await run([
      '-i', inp,
      '-vf', `fade=t=in:st=0:d=${d}`,
      '-af', `afade=t=in:st=0:d=${d}`,
      ...videoEncodeArgs(ext),
      out,
    ])
  } else {
    await run(['-i', inp, '-af', `afade=t=in:st=0:d=${d}`, out])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Fade out (applies to last `dur` seconds) ────────────────────
async function fadeOutImpl(data, ext, totalDuration, dur) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  const st = Math.max(0, totalDuration - dur).toFixed(3)
  const d  = dur.toFixed(3)

  if (isVideoExt(ext)) {
    await run([
      '-i', inp,
      '-vf', `fade=t=out:st=${st}:d=${d}`,
      '-af', `afade=t=out:st=${st}:d=${d}`,
      ...videoEncodeArgs(ext),
      out,
    ])
  } else {
    await run(['-i', inp, '-af', `afade=t=out:st=${st}:d=${d}`, out])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Loop a selected region N times (replaces region with N copies) ─
async function loopSectionImpl(data, ext, start, end, count) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  const s = start.toFixed(6)
  const e = end.toFixed(6)
  const n = Math.max(2, Math.floor(count))

  if (!isVideoExt(ext)) {
    // Build filter: extract seg, concat n times, reassemble
    const segs = Array.from({ length: n }, (_, i) => `[seg${i}]`).join('')
    const segDefs = Array.from({ length: n }, (_, i) =>
      `[0:a]atrim=${s}:${e},asetpts=PTS-STARTPTS[seg${i}]`
    ).join(';')

    await run([
      '-i', inp,
      '-filter_complex',
      `[0:a]atrim=0:${s},asetpts=PTS-STARTPTS[pre];` +
      `${segDefs};` +
      `${segs}concat=n=${n}:v=0:a=1[loop];` +
      `[0:a]atrim=${e},asetpts=PTS-STARTPTS[post];` +
      `[pre][loop][post]concat=n=3:v=0:a=1[ao]`,
      '-map', '[ao]',
      out,
    ])
  } else {
    const segsV = Array.from({ length: n }, (_, i) => `[sv${i}][sa${i}]`).join('')
    const segDefs = Array.from({ length: n }, (_, i) =>
      `[0:v]trim=${s}:${e},setpts=PTS-STARTPTS[sv${i}];[0:a]atrim=${s}:${e},asetpts=PTS-STARTPTS[sa${i}]`
    ).join(';')

    await run([
      '-i', inp,
      '-filter_complex',
      `[0:v]trim=0:${s},setpts=PTS-STARTPTS[prev];[0:a]atrim=0:${s},asetpts=PTS-STARTPTS[prea];` +
      `${segDefs};` +
      `${segsV}concat=n=${n}:v=1:a=1[loopv][loopa];` +
      `[0:v]trim=${e},setpts=PTS-STARTPTS[postv];[0:a]atrim=${e},asetpts=PTS-STARTPTS[posta];` +
      `[prev][prea][loopv][loopa][postv][posta]concat=n=3:v=1:a=1[vo][ao]`,
      '-map', '[vo]', '-map', '[ao]',
      ...videoEncodeArgs(ext),
      out,
    ])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Playback speed (factor > 1 = faster) ────────────────────────
async function changeSpeedImpl(data, ext, factor) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  // atempo only accepts 0.5–100 per instance; chain for slower speeds.
  const tempo = []
  let f = factor
  while (f < 0.5) { tempo.push('atempo=0.5'); f /= 0.5 }
  tempo.push(`atempo=${f.toFixed(4)}`)
  const atempo = tempo.join(',')

  if (isVideoExt(ext)) {
    await run([
      '-i', inp,
      '-filter_complex',
      `[0:v]setpts=PTS/${factor.toFixed(4)}[vo];[0:a]${atempo}[ao]`,
      '-map', '[vo]', '-map', '[ao]',
      ...videoEncodeArgs(ext),
      out,
    ])
  } else {
    await run(['-i', inp, '-af', atempo, out])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Crop the video frame (pixel rect in source coordinates) ─────
async function cropVideoImpl(data, ext, { x, y, w, h }) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  // yuv420p needs even dimensions
  const even = n => Math.max(2, Math.floor(n / 2) * 2)
  const cw = even(w), ch = even(h)
  const cx = Math.max(0, Math.floor(x)), cy = Math.max(0, Math.floor(y))

  await run([
    '-i', inp,
    '-vf', `crop=${cw}:${ch}:${cx}:${cy}`,
    ...videoEncodeArgs(ext, { copyAudio: true }),
    out,
  ])

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Rotate / flip ───────────────────────────────────────────────
// mode: 'cw' | 'ccw' | '180' | 'hflip' | 'vflip'
const ROTATE_FILTERS = {
  cw:    'transpose=1',
  ccw:   'transpose=2',
  180:   'hflip,vflip',
  hflip: 'hflip',
  vflip: 'vflip',
}
async function rotateVideoImpl(data, ext, mode) {
  const vf = ROTATE_FILTERS[mode]
  if (!vf) throw new Error(`Unknown rotate mode: ${mode}`)
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  await run(['-i', inp, '-vf', vf, ...videoEncodeArgs(ext, { copyAudio: true }), out])

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Extract the audio track from a video ────────────────────────
// format: 'mp3' | 'wav' | 'm4a'
async function extractAudioImpl(data, ext, format) {
  const inp = `inp.${ext}`
  const out = `out.${format}`
  await write(inp, data)

  const codec =
    format === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '2'] :
    format === 'wav' ? ['-c:a', 'pcm_s16le'] :
                       ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']

  await run(['-i', inp, '-vn', ...codec, out])

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Prepare a freshly loaded video for editing ──────────────────
// Two jobs in one ffmpeg session:
//  1. Every video op's filter graph maps [0:a], so a clip with no audio
//     track (screen recordings, silent clips) gets a silent one muxed in
//     once here, with the video stream copied — cheap even for long files.
//  2. Waveform peaks. Decoding a whole video with Web Audio's decodeAudioData
//     is prohibitively memory-hungry for long clips, so ffmpeg decodes the
//     audio to a tiny 8 kHz mono WAV which is reduced to PEAKS_PER_SECOND
//     max-abs values per second.
// Returns { data, replaced, peaks, fps } — `data` is new bytes when `replaced`.
export const PEAKS_PER_SECOND = 1000

async function prepareVideoImpl(data, ext) {
  const inp = `inp.${ext}`
  await write(inp, data)

  // Probe: does an audio stream exist? (-t 0.01 keeps this near-instant)
  recentLogs.length = 0
  const hasAudio = (await ffmpeg.exec(['-i', inp, '-map', '0:a:0', '-t', '0.01', '-f', 'null', 'probe'])) === 0
  const duration = loggedDuration()
  const fps = loggedFps()

  if (!hasAudio) {
    const out = `silent.${ext}`
    const e = ext.toLowerCase()
    const codec = e === 'webm' ? ['-c:a', 'libopus', '-b:a', '64k'] : ['-c:a', 'aac', '-b:a', '64k']
    const flags = (e === 'mp4' || e === 'mov') ? ['-movflags', '+faststart'] : []
    await run([
      '-i', inp, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...codec, ...flags,
      ...(duration ? ['-t', duration.toFixed(3)] : ['-shortest']),
      out,
    ])
    const result = await read(out)
    await del(inp); await del(out)
    return { data: result, replaced: true, fps, peaks: { samples: new Float32Array(100), rate: PEAKS_PER_SECOND } }
  }

  const out = 'peaks.wav'
  await run([
    '-i', inp, '-vn', '-ac', '1', '-ar', '8000',
    '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-f', 'wav', out,
  ])
  const wav = await read(out)
  await del(inp); await del(out)
  return { data, replaced: false, fps, peaks: { samples: wavToPeaks(wav, 8000 / PEAKS_PER_SECOND), rate: PEAKS_PER_SECOND } }
}

function wavToPeaks(bytes, step) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // Walk RIFF chunks to find the "data" payload
  let pos = 12
  let dataStart = -1, dataLen = 0
  while (pos + 8 <= bytes.byteLength) {
    const id  = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
    const len = view.getUint32(pos + 4, true)
    if (id === 'data') { dataStart = pos + 8; dataLen = Math.min(len, bytes.byteLength - dataStart); break }
    pos += 8 + len + (len & 1)
  }
  if (dataStart < 0) return new Float32Array(0)

  const count = Math.floor(dataLen / 2)
  const peaks = new Float32Array(Math.ceil(count / step))
  for (let i = 0; i < count; i++) {
    const v = Math.abs(view.getInt16(dataStart + i * 2, true)) / 32768
    const j = Math.floor(i / step)
    if (v > peaks[j]) peaks[j] = v
  }
  return peaks
}

// ── Turn a browser-side render into an editable document ────────
// Two flavours of input (see renderer.js):
//  • WebCodecs output: a video-only MP4 → copy the audio over from `source`.
//  • MediaRecorder output: has audio but no duration/cue metadata (the
//    browser reports Infinity), fixed by a stream-copy remux. H.264-in-WebM
//    (Chrome) is remuxed to MP4 so the document stays MP4.
async function finalizeRecordingImpl(data, mimeType, { hasAudio, source } = {}) {
  const isMp4  = /mp4/.test(mimeType)
  const isH264 = /h264|avc1/i.test(mimeType)
  const inp = isMp4 ? 'rec.mp4' : 'rec.webm'
  await write(inp, data)

  let out, ext
  if (!hasAudio && source) {
    const src = `src.${source.ext}`
    await write(src, source.data)
    ext = 'mp4'; out = 'out.mp4'
    await run([
      '-i', inp, '-i', src,
      '-map', '0:v:0', '-map', '1:a:0?',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
      '-movflags', '+faststart', out,
    ])
    await del(src)
  } else if (isMp4) {
    ext = 'mp4'; out = 'out.mp4'
    await run(['-i', inp, '-c', 'copy', '-movflags', '+faststart', out])
  } else if (isH264) {
    ext = 'mp4'; out = 'out.mp4'
    await run(['-i', inp, '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', out])
  } else {
    ext = 'webm'; out = 'out.webm'
    await run(['-i', inp, '-c', 'copy', out])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return { data: result, ext }
}

// ── Export to target format ─────────────────────────────────────
async function exportFileImpl(data, inputExt, outputFormat) {
  const inp = `inp.${inputExt}`
  const out = `out.${outputFormat}`
  await write(inp, data)

  const video = isVideoExt(inputExt)

  if (outputFormat === 'mp3') {
    await run(['-i', inp, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', out])
  } else if (outputFormat === 'wav') {
    await run(['-i', inp, '-vn', '-c:a', 'pcm_s16le', out])
  } else if (outputFormat === 'm4a') {
    await run(['-i', inp, '-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out])
  } else if (outputFormat === 'mp4') {
    if (video) {
      await run(['-i', inp, ...videoEncodeArgs('mp4'), out])
    } else {
      // audio → audio-only MP4 container
      await run(['-i', inp, '-c:a', 'aac', '-movflags', '+faststart', out])
    }
  } else if (outputFormat === 'webm') {
    if (video && inputExt.toLowerCase() === 'webm') {
      await run(['-i', inp, '-c', 'copy', out])
    } else if (video) {
      await run(['-i', inp, ...videoEncodeArgs('webm'), out])
    } else {
      await run(['-i', inp, '-c:a', 'libopus', '-b:a', '128k', out])
    }
  } else {
    throw new Error(`Unsupported export format: ${outputFormat}`)
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Public, serialized API ──────────────────────────────────────
export const removeSection      = serialized(removeSectionImpl)
export const trimRange          = serialized(trimRangeImpl)
export const joinAudio          = serialized(joinAudioImpl)
export const fadeIn             = serialized(fadeInImpl)
export const fadeOut            = serialized(fadeOutImpl)
export const loopSection        = serialized(loopSectionImpl)
export const changeSpeed        = serialized(changeSpeedImpl)
export const cropVideo          = serialized(cropVideoImpl)
export const rotateVideo        = serialized(rotateVideoImpl)
export const extractAudio       = serialized(extractAudioImpl)
export const prepareVideo       = serialized(prepareVideoImpl)
export const finalizeRecording  = serialized(finalizeRecordingImpl)
export const exportFile         = serialized(exportFileImpl)
