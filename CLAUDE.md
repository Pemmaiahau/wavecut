# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WaveCut is a browser-based audio/video editor. **All processing happens client-side** — files never leave the device, and there is no backend. React 18 + Vite 6, plain JS (no TypeScript). Three engines run in the page:

- `ffmpeg.wasm` for every cut/encode/mux operation.
- MediaPipe `ImageSegmenter` (selfie segmenter) for AI person cut-out (background replacement).
- WebCodecs `VideoEncoder` + `mp4-muxer` to encode the composited background-replacement frames (MediaRecorder fallback).

## Commands

```bash
npm run dev      # Vite dev server (sets COOP/COEP headers — see below)
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

There is no unit test suite, linter, or typechecker configured. End-to-end verification has been done with Playwright scripts driving the dev server (load a clip, run each tool, assert `<video>` duration/dimensions) — a global `playwright` install exists on this machine.

## Critical constraint: COOP/COEP headers

`ffmpeg.wasm` requires `SharedArrayBuffer`, which the browser only exposes under cross-origin isolation. Two response headers are **mandatory** or the audio engine silently fails to load:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set in three places that must stay in sync:
- `vite.config.js` `server.headers` and `preview.headers` — for dev/preview.
- `public/_headers` (copied to `dist/_headers` on build) — for the Cloudflare Pages deploy target.

Consequences of `require-corp`:
- `@ffmpeg/ffmpeg` and `@ffmpeg/util` are excluded from Vite's dep optimizer (`optimizeDeps.exclude`) because pre-bundling breaks the worker. The ffmpeg **core** wasm/js is fetched at runtime from the unpkg CDN (`@ffmpeg/core@0.12.6`, ffmpeg 5.1.4 with libx264/libvpx/libopus/libmp3lame/lavfi), pinned in `src/lib/processor.js` — not bundled, so loading requires network access.
- MediaPipe's wasm runtime **cannot** be loaded from a CDN. The `mediapipeAssets` plugin in `vite.config.js` serves `/mediapipe/wasm/*` from `node_modules/@mediapipe/tasks-vision/wasm` in dev and copies those four files into `dist/` on build. The model (`public/models/selfie_segmenter.tflite`, ~250 KB) is committed and served same-origin.

## Architecture

The whole app is a single in-memory editing pipeline. The document is `{ data: Uint8Array, ext }` — the entire file's bytes plus its extension — and every edit replaces it with a new document. `ext` travels with the bytes because some operations change the container.

- **`src/App.jsx`** — the only stateful coordinator. Holds the document via `useUndoRedo`, plus UI state (region selection, duration, busy/toast, active modal, active tool). Every ffmpeg edit goes through `withProcessing(label, fn)`, which lazy-loads ffmpeg, runs the op, and pushes the result (raw bytes → same ext, or `{data, ext}`) as a new history entry. Two "tool modes" (`tool === 'crop' | 'background'`) replace the toolbar with a tool panel and draw an overlay on the video preview. There is no router and no global store; props are threaded down explicitly.

- **`src/lib/processor.js`** — the ffmpeg boundary. Every exported op is wrapped by `serialized()` so ops never overlap (one ffmpeg instance, one flat virtual FS with fixed temp names). `write()` always copies the bytes because `ffmpeg.writeFile` *transfers* the buffer, which would detach the arrays held in undo history. `videoEncodeArgs(ext)` picks container-valid codecs (WebM → VP8/Opus, else H.264/AAC) — use it rather than hardcoding `libx264`. Every op branches on `isVideoExt(ext)`; video filter graphs map both `[0:v]` and `[0:a]`, so `prepareVideo()` (run once on load) muxes a silent track into videos that have none. `prepareVideo` also produces waveform peaks (8 kHz mono decode → 1000 peaks/s) and the source fps by parsing ffmpeg's log; `probe()` parses stream info the same way. `run()` turns ffmpeg's log into a readable error message. `joinAudio` normalises the second file (scale/pad to the main clip, black frames for audio-only, silent track for silent video) before `concat`.

- **`src/lib/segmenter.js`** — MediaPipe loader (`loadSegmenter`, memoised) and `BackgroundCompositor`, which draws one frame with the background replaced: segment a ≤512 px copy of the frame, build an alpha mask (threshold/softness/invert), `destination-in` composite the person over a colour / cover-fit image / blurred original. MediaPipe demands strictly increasing timestamps per segmenter, so a module-level counter is shared by all compositors. The same class drives the live preview and the export render so they can't drift.

- **`src/lib/renderer.js`** — full-clip background render. Preferred path steps through the clip frame by frame (seek → composite → `VideoEncoder` with explicit timestamps → `mp4-muxer`), which is deterministic regardless of machine speed; the video-only MP4 then gets the original audio copied in by `processor.finalizeRecording()`. Fallback is a real-time `MediaRecorder` capture. Output longest side is capped at 1920 px.

- **`src/hooks/useUndoRedo.js`** — generic past/present/future stack. `set` pushes and clears the redo future; `replace` swaps the present without touching history (used when `prepareVideo` adds a silent track); `reset` clears everything (new-file load).

- **`src/components/VideoPreview.jsx`** — owns the single `<video>` element for the session (always mounted, hidden for audio files) and reports the on-screen rect of the picture (`object-fit: contain`) to overlay children via a render prop.

- **`src/components/WaveformEditor.jsx`** — wraps `wavesurfer.js` + Regions, created with `media: <that video element>` so picture, audio and cursor stay in sync. Audio files are decoded by wavesurfer itself; video files load with pre-computed peaks (`peaks.forData` must be the same `Uint8Array` as `audioData`, otherwise it waits — this prevents a stale waveform for a new document). On every document change it builds a fresh `Blob` + object URL (revoking the previous one).

- **`src/components/CropTool.jsx`** (`CropOverlay` + `CropControls`) and **`BackgroundTool.jsx`** (`BackgroundOverlay` + `BackgroundControls`) — the two tool modes. Crop state is in source-pixel coordinates; `App` passes it to `cropVideo`, which rounds to even dimensions for yuv420p.

- **`Toolbar`** is tabbed (Edit / Audio / Video — Video only for video docs); tab state lives in `App` so entering/leaving a tool doesn't reset it. `JoinModal`, `ExportModal`, `ExtractAudioModal`, `SplitModal`, `FileUpload` are presentational and call callbacks passed from `App`. Export offers MP4/WebM for video docs and MP3/WAV/M4A for all.

Styling is a single global stylesheet (`src/index.css`) using CSS variables; components use class names + occasional inline styles.

## Conventions

- File extension (lowercased) is the source of truth for audio-vs-video routing and MIME type — it lives in the document as `ext` and is threaded through as `fileExt`. Keep the `VIDEO_EXTS` set and `getMimeType` map in `processor.js` authoritative.
- Object URLs created from file bytes must be revoked when replaced (see `WaveformEditor`, `ExportModal`, `App.applyBackground`) — these files are large, leaks matter.
- Never hand a document's `Uint8Array` to ffmpeg or `postMessage` without copying it first (buffer transfer detaches it).
- Known limits: ffmpeg.wasm is single-threaded and lives in a 32-bit heap, so files beyond roughly 800 MB may fail; the UI warns at that size. The segmentation model is trained on people — it won't cut out objects or animals.
