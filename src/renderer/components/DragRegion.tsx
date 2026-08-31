import { Box } from '@chakra-ui/react'

export function DragRegion() {
  const beginDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    // CSS drag regions are unreliable in layered WebContentsViews, so move the
    // native window from the main process while the pointer is held down.
    window.browsy.startWindowDrag(event.screenX, event.screenY)

    const handleMove = (moveEvent: MouseEvent) => {
      window.browsy.moveWindowDrag(moveEvent.screenX, moveEvent.screenY)
    }
    const finishDrag = () => {
      window.browsy.endWindowDrag()
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('blur', handleBlur)
    }
    const handleUp = () => finishDrag()
    const handleBlur = () => finishDrag()

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('blur', handleBlur)
  }

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      height="32px"
      minH="32px"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      pointerEvents="auto"
      onMouseDown={beginDrag}
      zIndex={2}
    />
  )
}
