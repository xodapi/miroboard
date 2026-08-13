import { useCallback, useEffect, useRef, useState } from 'react'

export function useFileDrop(onDrop: (transfer: DataTransfer) => Promise<void>) {
  const [isDropTarget, setIsDropTarget] = useState(false)
  const dragDepth = useRef(0)

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setIsDropTarget(true)
  }, [])
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
  }, [])
  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDropTarget(false)
  }, [])
  const onCanvasDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDropTarget(false)
    await onDrop(event.dataTransfer)
  }, [onDrop])

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  return { isDropTarget, onDragEnter, onDragOver, onDragLeave, onCanvasDrop }
}
