# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WaveCut is a browser-based audio/video editor. **All processing happens client-side** via `ffmpeg.wasm` — files never leave the device, and there is no backend. React 18 + Vite 6, plain JS (no TypeScript).

## Commands

```bash
npm run dev      # Vite dev server (sets COOP/COEP headers — see below)
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

There is no test suite, linter, or typechecker configured.

## Critical constraint: COOP/COEP headers

`ffmpeg.wasm` requires `SharedArrayBuffer`, which the browser only exposes under cross-origin isolation. Two response headers are **mandatory** or the audio engine silently fails to load:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set in two places that must stay in sync:
- `vite.config.js` `server.headers` — for dev/preview.
- `public/_headers` (copied to `dist/_headers` on build) — for the Cloudflare Pages deploy target.

`@ffmpeg/ffmpeg` and `@ffmpeg/util` are excluded from Vite's dep optimizer (`optimizeDeps.exclude`) because pre-bundling breaks the worker. The ffmpeg **core** wasm/js is fetched at runtime from the unpkg CDN (`@ffmpeg/core@0.12.6`), pinned in `src/lib/processor.js` — it is not bundled, so loading requires network access.

## Architecture

The whole app is a single in-memory editing pipeline. The audio/video file lives as a `Uint8Array` and every edit replaces it with a new full-file `Uint8Array`.

- **`src/App.jsx`** — the only stateful coordinator. Holds the current file bytes via `useUndoRedo`, plus UI state (region selection, duration, busy/toast). Every edit goes through `withProcessing(label, fn)`, which lazy-loads ffmpeg, runs the op, and pushes the returned bytes as a new history entry. There is no router and no global store; props are threaded down explicitly.

- **`src/lib/processor.js`** — the ffmpeg boundary. Each exported op (`removeSection`, `joinAudio`, `fadeIn`, `fadeOut`, `loopSection`, `exportFile`) follows the same pattern: write input bytes to ffmpeg's virtual FS, run an `-filter_complex` command, read output bytes, delete temp files, return the result. `loadFfmpeg()` is idempotent (module-level `loaded` flag). **Every op branches on `isVideoExt(ext)`** — video paths must process and concat both `[0:v]` and `[0:a]` streams and re-encode (`libx264`/`aac`), audio paths only touch `[0:a]`. When adding or changing an op, keep both branches consistent.

- **`src/hooks/useUndoRedo.js`** — generic past/present/future stack. `set` pushes a new state and clears the redo future; `reset` clears all history (used on new-file load). The "document" is the entire file's bytes, so undo is just swapping which `Uint8Array` is present.

- **`src/components/WaveformEditor.jsx`** — wraps `wavesurfer.js` + its Regions plugin. Imperative-handle exposes `play/pause/seekTo/clearRegion` to `App`. On every `audioData` change it builds a fresh `Blob` + object URL (revoking the previous one) and reloads. Region selection is single-region: creating a new region removes the old. Selected region `{start, end}` (seconds) flows up to `App` and is what `removeSection`/`loopSection` act on.

- **Components** (`FileUpload`, `Toolbar`, `JoinModal`, `ExportModal`) are presentational; they call callbacks passed from `App`. Export only offers MP3/MP4 even though many input formats are accepted.

Styling is a single global stylesheet (`src/index.css`) using CSS variables; components use class names + occasional inline styles.

## Conventions

- File extension (lowercased) is the source of truth for audio-vs-video routing and MIME type — derived from the filename, threaded through as `fileExt`. Keep the `VIDEO_EXTS` set and `getMimeType` map in `processor.js` authoritative.
- Object URLs created from file bytes must be revoked when replaced (see `WaveformEditor`, `ExportModal`) — these files are large, leaks matter.
