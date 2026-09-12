import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

// Both paths are same-origin on purpose: COEP require-corp blocks CDN loads.
// The wasm dir is served by the mediapipeAssets plugin in vite.config.js and
// the model lives in public/models.
const BASE       = import.meta.env.BASE_URL.replace(/\/$/, '')
const WASM_PATH  = `${BASE}/mediapipe/wasm`
const MODEL_PATH = `${BASE}/models/selfie_segmenter.tflite`

// Segmentation runs on a downscaled copy of the frame; the model itself works
// at 256×256 so anything bigger only costs mask-upload time.
const SEG_MAX_SIDE = 512

let segmenterPromise = null
// MediaPipe requires strictly increasing timestamps across every call to a
// segmenter, so the counter is shared by all compositor instances.
let lastTs = 0

export function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
      const options = {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }
      try {
        return await ImageSegmenter.createFromOptions(fileset, options)
      } catch {
        options.baseOptions.delegate = 'CPU'
        return await ImageSegmenter.createFromOptions(fileset, options)
      }
    })().catch(e => { segmenterPromise = null; throw e })
  }
  return segmenterPromise
}

export const DEFAULT_BG_SETTINGS = {
  mode:      'color',   // 'color' | 'image' | 'blur'
  color:     '#00b140',
  image:     null,      // HTMLImageElement
  blur:      18,        // px, blur mode only
  threshold: 0.5,       // confidence at which a pixel counts as "person"
  softness:  0.15,      // width of the alpha ramp around the threshold
  feather:   2,         // px blur applied to the mask edge
  invert:    false,
}

// Draws one frame of `video` with its background replaced, using `settings`.
// Owns the scratch canvases so a preview loop and an export loop can each
// keep their own instance without sharing state.
export class BackgroundCompositor {
  constructor(segmenter) {
    this.segmenter = segmenter
    this.settings  = { ...DEFAULT_BG_SETTINGS }

    this.segCanvas  = document.createElement('canvas')
    this.segCtx     = this.segCanvas.getContext('2d', { willReadFrequently: false })
    this.maskCanvas = document.createElement('canvas')
    this.maskCtx    = this.maskCanvas.getContext('2d')
    this.fgCanvas   = document.createElement('canvas')
    this.fgCtx      = this.fgCanvas.getContext('2d')
    this.maskImage  = null
  }

  setSettings(next) {
    this.settings = { ...this.settings, ...next }
  }

  // Populates maskCanvas with an alpha mask of the person.
  updateMask(video) {
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return false

    const scale = Math.min(1, SEG_MAX_SIDE / Math.max(vw, vh))
    const sw = Math.max(1, Math.round(vw * scale))
    const sh = Math.max(1, Math.round(vh * scale))
    if (this.segCanvas.width !== sw || this.segCanvas.height !== sh) {
      this.segCanvas.width = sw; this.segCanvas.height = sh
    }
    this.segCtx.drawImage(video, 0, 0, sw, sh)

    // The preview seeks backwards freely, so use wall-clock time rather
    // than video time for the monotonic timestamp.
    const ts = Math.max(performance.now(), lastTs + 1)
    lastTs = ts

    const { threshold, softness, invert } = this.settings
    let ok = false
    this.segmenter.segmentForVideo(this.segCanvas, ts, result => {
      const masks = result.confidenceMasks
      if (!masks || !masks.length) return
      // selfie_segmenter: index 0 = background, index 1 = person
      const mask = masks[masks.length - 1]
      const conf = mask.getAsFloat32Array()
      const mw = mask.width, mh = mask.height

      if (!this.maskImage || this.maskImage.width !== mw || this.maskImage.height !== mh) {
        this.maskImage = new ImageData(mw, mh)
        this.maskCanvas.width = mw; this.maskCanvas.height = mh
        // RGB is irrelevant for destination-in; only alpha matters
        this.maskImage.data.fill(255)
      }
      const px = this.maskImage.data
      const lo = threshold - softness, span = Math.max(1e-4, softness * 2)
      for (let i = 0, n = mw * mh; i < n; i++) {
        let a = (conf[i] - lo) / span
        a = a < 0 ? 0 : a > 1 ? 1 : a
        if (invert) a = 1 - a
        px[i * 4 + 3] = (a * 255) | 0
      }
      this.maskCtx.putImageData(this.maskImage, 0, 0)
      ok = true
    })
    return ok
  }

  drawBackground(ctx, video, w, h) {
    const { mode, color, image, blur } = this.settings
    if (mode === 'blur') {
      // Over-draw past the edges so the blur doesn't fade to transparent
      const pad = blur * 2
      ctx.save()
      ctx.filter = `blur(${blur}px)`
      ctx.drawImage(video, -pad, -pad, w + pad * 2, h + pad * 2)
      ctx.restore()
    } else if (mode === 'image' && image && image.naturalWidth) {
      drawCover(ctx, image, w, h)
    } else {
      ctx.fillStyle = mode === 'image' ? '#000' : color
      ctx.fillRect(0, 0, w, h)
    }
  }

  // Renders the composited frame into `ctx` at w×h. Returns false if the
  // frame couldn't be segmented (e.g. video metadata not loaded yet).
  drawFrame(video, ctx, w, h) {
    if (!this.updateMask(video)) return false

    if (this.fgCanvas.width !== w || this.fgCanvas.height !== h) {
      this.fgCanvas.width = w; this.fgCanvas.height = h
    }
    const fg = this.fgCtx
    fg.clearRect(0, 0, w, h)
    fg.drawImage(video, 0, 0, w, h)
    fg.globalCompositeOperation = 'destination-in'
    fg.imageSmoothingEnabled = true
    fg.imageSmoothingQuality = 'high'
    const feather = this.settings.feather
    if (feather > 0) fg.filter = `blur(${feather}px)`
    fg.drawImage(this.maskCanvas, 0, 0, w, h)
    fg.filter = 'none'
    fg.globalCompositeOperation = 'source-over'

    this.drawBackground(ctx, video, w, h)
    ctx.drawImage(this.fgCanvas, 0, 0)
    return true
  }
}

// object-fit: cover
function drawCover(ctx, img, w, h) {
  const iw = img.naturalWidth, ih = img.naturalHeight
  const s = Math.max(w / iw, h / ih)
  const dw = iw * s, dh = ih * s
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

// The object URL stays alive because the controls show the image as a
// thumbnail via img.src; the caller revokes it when the image is replaced.
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}
