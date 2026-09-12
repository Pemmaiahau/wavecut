import { useState } from 'react'

const I = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
)
const IconCut     = () => <I d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z" />
const IconKeep    = () => <I d="M3 5h2v14H3zm16 0h2v14h-2zM7 9h10v6H7z" />
const IconSplit   = () => <I d="M11 3h2v18h-2zM3 7h6v10H3zm12 0h6v10h-6z" />
const IconJoin    = () => <I d="M19 13H5v-2h14v2zM11 3v18h2V3h-2z" />
const IconFadeIn  = () => <I d="M3 3h2v18H3zm4 4h2v14H7zm4 4h2v10h-2zm4 4h2v6h-2zm4 4h2v2h-2z" />
const IconFadeOut = () => <I d="M3 17h2v4H3zm4-4h2v8H7zm4-4h2v12h-2zm4-4h2v16h-2zm4-4h2v20h-2z" />
const IconLoop    = () => <I d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
const IconSpeed   = () => <I d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z" />
const IconExtract = () => <I d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6zM4 5h6v2H4zm0 4h6v2H4zm0 4h4v2H4z" />
const IconCrop    = () => <I d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z" />
const IconRotCW   = () => <I d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z" />
const IconRotCCW  = () => <I d="M8.45 5.55L13 1v3.07c3.94.49 7 3.85 7 7.93s-3.05 7.44-7 7.93v-2.02c2.84-.48 5-2.94 5-5.91s-2.16-5.43-5-5.91V10L8.45 5.55zM4.07 11c.17-1.39.72-2.73 1.62-3.89l1.42 1.42c-.54.75-.88 1.6-1.02 2.47H4.07zM11 17.9v2.02c-1.39-.17-2.74-.71-3.9-1.61l1.44-1.44c.75.54 1.59.89 2.46 1.03zm-3.89-2.42l-1.42 1.41c-.9-1.16-1.45-2.5-1.62-3.89h2.02c.14.87.48 1.72 1.02 2.48z" />
const IconFlipH   = () => <I d="M15 21h2v-2h-2v2zm4-12h2V7h-2v2zM3 5v14c0 1.1.9 2 2 2h4v-2H5V5h4V3H5c-1.1 0-2 .9-2 2zm16-2v2h2c0-1.1-.9-2-2-2zm-8 20h2V1h-2v22zm8-6h2v-2h-2v2zM15 5h2V3h-2v2zm4 8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2z" />
const IconFlipV   = () => <I d="M3 15v2h2v-2H3zm12 4v2h2v-2h-2zM5 3H19c1.1 0 2 .9 2 2v4h-2V5H5v4H3V5c0-1.1.9-2 2-2zm16 16v-2h-2v2h2zM1 11v2h22v-2H1zm6 8v2h2v-2H7zm-2 0H3c0 1.1.9 2 2 2v-2zm14 0h2v2c1.1 0 2-.9 2-2h-2z" />
const IconBg      = () => <I d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zM2 2h4v2H4v2H2V2zm16 0h4v4h-2V4h-2V2zM2 18h2v2h2v2H2v-4zm18 0h2v4h-4v-2h2v-2z" />

const SPEEDS = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4]

const TABS = [
  { id: 'edit',  label: 'Edit' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video', videoOnly: true },
]

function Tool({ icon, label, danger, ...rest }) {
  return (
    <button className={`tool-btn${danger ? ' danger' : ''}`} {...rest}>
      <span className="icon">{icon}</span>
      <span className="label">{label}</span>
    </button>
  )
}

export default function Toolbar({
  region,
  isVideo,
  isProcessing,
  tab,
  onTabChange,
  onRemove,
  onKeep,
  onSplit,
  onSpeed,
  onJoin,
  onFadeIn,
  onFadeOut,
  onLoop,
  onExtractAudio,
  onCrop,
  onRotate,
  onBackground,
}) {
  const [fadeInDur,  setFadeInDur]  = useState(2)
  const [fadeOutDur, setFadeOutDur] = useState(2)
  const [loopCount,  setLoopCount]  = useState(3)
  const [speed,      setSpeed]      = useState(2)

  const busy = isProcessing
  const noRegion = !region
  const regionTitle = noRegion ? 'Select a region on the waveform first' : ''
  const activeTab = tab === 'video' && !isVideo ? 'edit' : tab

  return (
    <div className="toolbar">
      <div className="toolbar-tabs" role="tablist">
        {TABS.filter(t => !t.videoOnly || isVideo).map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`toolbar-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {activeTab === 'edit' && (
        <>
          <div className="toolbar-group">
            <Tool icon={<IconCut />}   label="Remove Selected" danger disabled={busy || noRegion} onClick={onRemove} title={regionTitle || 'Delete the selected region'} />
            <Tool icon={<IconKeep />}  label="Keep Selected"          disabled={busy || noRegion} onClick={onKeep}   title={regionTitle || 'Trim the clip down to the selection'} />
            <Tool icon={<IconSplit />} label="Split at Playhead"      disabled={busy}             onClick={onSplit}  title="Cut the clip in two at the playhead" />
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <div className="param-inline">
              <IconSpeed />
              <span>Speed</span>
              <select value={speed} disabled={busy} onChange={e => setSpeed(Number(e.target.value))}>
                {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
              </select>
            </div>
            <button className="tool-btn" disabled={busy} onClick={() => onSpeed(speed)} title={`Change playback speed to ${speed}×`}>
              Apply
            </button>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <Tool icon={<IconJoin />} label="Join File" disabled={busy} onClick={onJoin} title="Insert or append another file" />
          </div>
        </>
      )}

      {activeTab === 'audio' && (
        <>
          <div className="toolbar-group">
            <div className="param-inline">
              <IconFadeIn />
              <span>Fade&nbsp;In</span>
              <input type="number" value={fadeInDur} min={0.1} max={30} step={0.5} disabled={busy}
                     onChange={e => setFadeInDur(parseFloat(e.target.value) || 1)} />
              <span>s</span>
            </div>
            <button className="tool-btn" disabled={busy} onClick={() => onFadeIn(fadeInDur)} title="Apply fade in">Apply</button>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <div className="param-inline">
              <IconFadeOut />
              <span>Fade&nbsp;Out</span>
              <input type="number" value={fadeOutDur} min={0.1} max={30} step={0.5} disabled={busy}
                     onChange={e => setFadeOutDur(parseFloat(e.target.value) || 1)} />
              <span>s</span>
            </div>
            <button className="tool-btn" disabled={busy} onClick={() => onFadeOut(fadeOutDur)} title="Apply fade out">Apply</button>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <div className="param-inline">
              <IconLoop />
              <span>Loop</span>
              <input type="number" value={loopCount} min={2} max={20} step={1} disabled={busy || noRegion}
                     onChange={e => setLoopCount(parseInt(e.target.value) || 2)} />
              <span>×</span>
            </div>
            <button className="tool-btn" disabled={busy || noRegion} onClick={() => onLoop(loopCount)}
                    title={regionTitle || `Repeat region ${loopCount} times`}>
              Apply
            </button>
          </div>

          {isVideo && (
            <>
              <div className="toolbar-divider" />
              <div className="toolbar-group">
                <Tool icon={<IconExtract />} label="Extract Audio" disabled={busy} onClick={onExtractAudio} title="Save the soundtrack as an audio file" />
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'video' && isVideo && (
        <>
          <div className="toolbar-group">
            <Tool icon={<IconCrop />} label="Crop" disabled={busy} onClick={onCrop} title="Crop the picture" />
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <Tool icon={<IconRotCW />}  label="Rotate 90°"  disabled={busy} onClick={() => onRotate('cw')}    title="Rotate 90° clockwise" />
            <Tool icon={<IconRotCCW />} label="Rotate −90°" disabled={busy} onClick={() => onRotate('ccw')}   title="Rotate 90° counter-clockwise" />
            <Tool icon={<IconFlipH />}  label="Flip H"      disabled={busy} onClick={() => onRotate('hflip')} title="Mirror horizontally" />
            <Tool icon={<IconFlipV />}  label="Flip V"      disabled={busy} onClick={() => onRotate('vflip')} title="Mirror vertically" />
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <Tool icon={<IconBg />} label="Replace Background" disabled={busy} onClick={onBackground} title="Remove the background behind a person and replace it" />
          </div>
        </>
      )}
    </div>
  )
}
