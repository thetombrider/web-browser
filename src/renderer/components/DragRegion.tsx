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
      // Opaque enough for Electron hit-testing; still nearly invisible.
      bg={peek ? 'blackAlpha.100' : undefined}
      style={{ WebkitAppRegion: peek ? 'no-drag' : 'drag' } as React.CSSProperties}
      pointerEvents="auto"
      cursor={peek ? 'pointer' : undefined}
      onMouseDown={
        peek
          ? (e) => {
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              onPeekClick?.()
            }
          : undefined
      }
      title={peek ? 'Show navigation' : undefined}
      zIndex={2}
      _hover={peek ? { bg: 'blackAlpha.400' } : undefined}
    />
  )
}
