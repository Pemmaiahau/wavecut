import { useRef, useState } from 'react'

const ACCEPTED = '.mp3,.mp4,.wav,.ogg,.webm,.m4a,.aac,.flac,.mov,.mkv,.avi'
const FORMATS  = ['MP3', 'MP4', 'WAV', 'OGG', 'WebM', 'M4A', 'AAC', 'FLAC', 'MOV', 'MKV', 'AVI']

const FEATURES = [
  { icon: '✂️', title: 'Cut, Trim & Split', desc: 'Remove or keep a selection, split at the playhead' },
  { icon: '🪄', title: 'Replace Background', desc: 'AI cut-out of people — swap in a photo, color or blur' },
  { icon: '🎵', title: 'Extract Audio',      desc: 'Pull the soundtrack out of any video as MP3/WAV' },
  { icon: '🖼️', title: 'Crop & Rotate',      desc: 'Reframe for 9:16, 1:1, 16:9 or free-form' },
  { icon: '⏩', title: 'Speed, Fade, Loop',  desc: 'Time-stretch, fade in/out, repeat a region' },
  { icon: '⬇️', title: 'Export',             desc: 'MP4, WebM, MP3, WAV or M4A — all on-device' },
]

export default function FileUpload({ onFileSelect }) {
  const inputRef   = useRef(null)
  const [drag, setDrag] = useState(false)

  function handleFile(file) {
    if (!file) return
    onFileSelect(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  function onDragOver(e) { e.preventDefault(); setDrag(true) }
  function onDragLeave()  { setDrag(false) }

  return (
    <div className="upload-page">
      <div className="upload-logo">
        <div className="upload-logo-icon">🎵</div>
        <h1>WaveCut</h1>
        <p>Browser-based audio &amp; video editor. All processing happens locally — your files never leave your device.</p>
      </div>

      <div
        className={`drop-zone${drag ? ' drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Upload audio or video file"
      >
        <div className="drop-icon">🎧</div>
        <h2>{drag ? 'Drop to load' : 'Drop your file here'}</h2>
        <p>or click to browse your device</p>
        <div className="formats">
          {FORMATS.map(f => <span key={f} className="format-tag">{f}</span>)}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>

      <div className="features-grid">
        {FEATURES.map(f => (
          <div key={f.title} className="feature-card">
            <span className="fc-icon">{f.icon}</span>
            <span className="fc-title">{f.title}</span>
            <span className="fc-desc">{f.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
