import { Box } from '@chakra-ui/react'
import { CHROME_PEEK_HEIGHT } from '@shared/types'

interface DragRegionProps {
  onPeekClick?: () => void
  peek?: boolean
}

export function DragRegion({ onPeekClick, peek = false }: DragRegionProps) {
  const beginDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    // CSS drag regions are unreliable in layered WebContentsViews, so move the
    // native window from the main process while the pointer is held down.
    const drag = { moved: false, startScreenX: event.screenX, startScreenY: event.screenY }
    window.browsy.startWindowDrag(event.screenX, event.screenY)

    const handleMove = (moveEvent: MouseEvent) => {
      if (
        Math.abs(moveEvent.screenX - drag.startScreenX) > 2 ||
        Math.abs(moveEvent.screenY - drag.startScreenY) > 2
      ) {
        drag.moved = true
      }
      window.browsy.moveWindowDrag(moveEvent.screenX, moveEvent.screenY)
    }
    const finishDrag = (activatePeek: boolean) => {
      window.browsy.endWindowDrag()
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('blur', handleBlur)
      if (activatePeek && peek && !drag.moved) onPeekClick?.()
    }
    const handleUp = () => finishDrag(true)
    const handleBlur = () => finishDrag(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('blur', handleBlur)
  }

  if (peek) {
    return (
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        height="100%"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        pointerEvents="auto"
        onMouseDown={beginDrag}
        zIndex={2}
      >
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          height={`${CHROME_PEEK_HEIGHT}px`}
          bg="blackAlpha.100"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          pointerEvents="auto"
          cursor="pointer"
          title="Show navigation"
          _hover={{ bg: 'blackAlpha.400' }}
        />
      </Box>
    )
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
