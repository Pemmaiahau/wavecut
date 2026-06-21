import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg = null
let loaded = false

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
  }
  return map[ext.toLowerCase()] || 'audio/mpeg'
}

export async function loadFfmpeg(onProgress) {
  if (loaded) return
  ffmpeg = new FFmpeg()
  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => onProgress(Math.round(progress * 100)))
  }
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  loaded = true
}

async function run(args) {
  const code = await ffmpeg.exec(args)
  if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`)
}

async function write(name, data) {
  await ffmpeg.writeFile(name, data)
}

async function read(name) {
  return ffmpeg.readFile(name)
}

async function del(name) {
  try { await ffmpeg.deleteFile(name) } catch {}
}

// ── Remove a region [start, end] (seconds) ──────────────────────
export async function removeSection(data, ext, start, end) {
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
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', '+faststart',
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

// ── Join another audio/video at a given position (seconds) ──────
// insertAt === null → append at end
export async function joinAudio(data1, ext1, data2, ext2, insertAt, totalDuration) {
  const inp1 = `inp1.${ext1}`
  const inp2 = `inp2.${ext2}`
  const out  = `out.${ext1}`
  await write(inp1, data1)
  await write(inp2, data2)

  const appendMode = insertAt === null || insertAt >= totalDuration - 0.01

  if (!isVideoExt(ext1)) {
    if (appendMode) {
      await run([
        '-i', inp1, '-i', inp2,
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[ao]',
        '-map', '[ao]',
        out,
      ])
    } else {
      const s = insertAt.toFixed(6)
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
    if (appendMode) {
      await run([
        '-i', inp1, '-i', inp2,
        '-filter_complex',
        '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[vo][ao]',
        '-map', '[vo]', '-map', '[ao]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', '+faststart',
        out,
      ])
    } else {
      const s = insertAt.toFixed(6)
      await run([
        '-i', inp1, '-i', inp2,
        '-filter_complex',
        `[0:v]split=2[vi1][vi3];[0:a]asplit=2[ai1][ai3];` +
        `[vi1]trim=0:${s},setpts=PTS-STARTPTS[v1];` +
        `[vi3]trim=${s},setpts=PTS-STARTPTS[v3];` +
        `[ai1]atrim=0:${s},asetpts=PTS-STARTPTS[a1];` +
        `[ai3]atrim=${s},asetpts=PTS-STARTPTS[a3];` +
        `[v1][a1][1:v][1:a][v3][a3]concat=n=3:v=1:a=1[vo][ao]`,
        '-map', '[vo]', '-map', '[ao]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', '+faststart',
        out,
      ])
    }
  }

  const result = await read(out)
  await del(inp1); await del(inp2); await del(out)
  return result
}

// ── Fade in (applies to first `dur` seconds) ────────────────────
export async function fadeIn(data, ext, dur) {
  const inp = `inp.${ext}`
  const out = `out.${ext}`
  await write(inp, data)

  const d = dur.toFixed(3)
  if (isVideoExt(ext)) {
    await run([
      '-i', inp,
      '-vf', `fade=t=in:st=0:d=${d}`,
      '-af', `afade=t=in:st=0:d=${d}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
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
export async function fadeOut(data, ext, totalDuration, dur) {
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
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
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
export async function loopSection(data, ext, start, end, count) {
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
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
      out,
    ])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}

// ── Export to target format ─────────────────────────────────────
export async function exportFile(data, inputExt, outputFormat) {
  const inp = `inp.${inputExt}`
  const out = `out.${outputFormat}`
  await write(inp, data)

  if (outputFormat === 'mp3') {
    await run(['-i', inp, '-c:a', 'libmp3lame', '-q:a', '2', out])
  } else if (outputFormat === 'mp4') {
    if (isVideoExt(inputExt)) {
      await run(['-i', inp, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', out])
    } else {
      // audio → audio-only MP4 container
      await run(['-i', inp, '-c:a', 'aac', '-movflags', '+faststart', out])
    }
  } else if (outputFormat === 'wav') {
    await run(['-i', inp, '-c:a', 'pcm_s16le', out])
  }

  const result = await read(out)
  await del(inp); await del(out)
  return result
}
