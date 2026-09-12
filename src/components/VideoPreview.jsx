import { useCallback, useEffect, useRef, useState } from 'react'

// Hosts the single <video> element that wavesurfer drives for playback.
// It is always mounted (audio files play through it too, just hidden) so
// wavesurfer never has to be rebuilt when switching between file types.
//
// `children` is a render prop receiving { rect, video } where `rect` is the
// area the picture actually occupies inside the stage (object-fit: contain),
// in CSS px relative to the stage, plus the intrinsic size (vw, vh).
export default function VideoPreview({ visible, onMediaElement, children }) {
  const stageRef = useRef(null)
  const [videoEl, setVideoEl] = useState(null)
  const [rect,    setRect]    = useState(null)

  const videoRef = useCallback(el => {
    setVideoEl(el)
    onMediaElement?.(el)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stage = stageRef.current
    if (!videoEl || !stage) return

    const compute = () => {
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight
      const cw = stage.clientWidth, ch = stage.clientHeight
      if (!vw || !vh || !cw || !ch) { setRect(null); return }
      const s = Math.min(cw / vw, ch / vh)
      const width = vw * s, height = vh * s
      setRect({ left: (cw - width) / 2, top: (ch - height) / 2, width, height, vw, vh })
    }

    const ro = new ResizeObserver(compute)
    ro.observe(stage)
    videoEl.addEventListener('loadedmetadata', compute)
    videoEl.addEventListener('resize', compute)
    videoEl.addEventListener('emptied', compute)
    compute()
    return () => {
      ro.disconnect()
      videoEl.removeEventListener('loadedmetadata', compute)
      videoEl.removeEventListener('resize', compute)
      videoEl.removeEventListener('emptied', compute)
    }
  }, [videoEl, visible])

  return (
    <div className="video-panel" style={{ display: visible ? undefined : 'none' }}>
      <div className="video-stage" ref={stageRef}>
        <video ref={videoRef} className="video-el" playsInline preload="auto" />
        {visible && rect && videoEl && children?.({ rect, video: videoEl })}
      </div>
    </div>
  )
}
