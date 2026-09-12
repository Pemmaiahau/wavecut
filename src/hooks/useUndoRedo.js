import { useState, useCallback } from 'react'

export function useUndoRedo(initial = null) {
  const [past,    setPast]    = useState([])
  const [present, setPresent] = useState(initial)
  const [future,  setFuture]  = useState([])

  const set = useCallback((next) => {
    setPast(p => [...p, present])
    setPresent(next)
    setFuture([])
  }, [present])

  const undo = useCallback(() => {
    setPast(p => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture(f => [present, ...f])
      setPresent(prev)
      return p.slice(0, -1)
    })
  }, [present])

  const redo = useCallback(() => {
    setFuture(f => {
      if (!f.length) return f
      const next = f[0]
      setPast(p => [...p, present])
      setPresent(next)
      return f.slice(1)
    })
  }, [present])

  // Swap the current state without touching history (e.g. normalising a
  // freshly loaded file).
  const replace = useCallback((next) => {
    setPresent(next)
  }, [])

  const reset = useCallback((next) => {
    setPast([])
    setPresent(next)
    setFuture([])
  }, [])

  return {
    state:    present,
    set,
    undo,
    redo,
    reset,
    replace,
    canUndo:  past.length > 0,
    canRedo:  future.length > 0,
    historyLen: past.length,
  }
}
