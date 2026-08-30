import { Box } from '@chakra-ui/react'

interface DragRegionProps {
  onPeekClick?: () => void
  peek?: boolean
}

export function DragRegion({ onPeekClick, peek = false }: DragRegionProps) {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      height={peek ? '100%' : '32px'}
      minH={peek ? '6px' : '32px'}
      style={{ WebkitAppRegion: peek ? 'no-drag' : 'drag' } as React.CSSProperties}
      pointerEvents="auto"
      cursor={peek ? 'pointer' : undefined}
      onMouseDown={
        peek
          ? (e) => {
              e.preventDefault()
              onPeekClick?.()
            }
          : undefined
      }
      title={peek ? 'Show navigation' : undefined}
      zIndex={2}
      _hover={peek ? { bg: 'blackAlpha.300' } : undefined}
    />
  )
}
