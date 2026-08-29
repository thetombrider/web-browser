import { Box, type BoxProps } from '@chakra-ui/react'
import type { ReactNode } from 'react'

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export const floatingSurface = {
  bg: 'rgba(255, 255, 255, 0.88)',
  border: '1px solid',
  borderColor: 'blackAlpha.100',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06)',
  backdropFilter: 'blur(20px)',
  color: 'gray.800'
} as const

interface FloatingPanelProps extends BoxProps {
  children: ReactNode
}

export function FloatingPanel({ children, ...props }: FloatingPanelProps) {
  return (
    <Box {...floatingSurface} style={noDrag} {...props}>
      {children}
    </Box>
  )
}

interface FloatingOverlayProps {
  children: ReactNode
  onDismiss?: () => void
  position?: 'center' | 'top'
}

export function FloatingOverlay({ children, onDismiss, position = 'center' }: FloatingOverlayProps) {
  return (
    <Box
      position="fixed"
      inset={0}
      pointerEvents="auto"
      onClick={onDismiss}
      style={noDrag}
    >
      <Box
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        top={position === 'center' ? '18%' : '44px'}
        w="92%"
        maxW={position === 'center' ? '520px' : '720px'}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Box>
    </Box>
  )
}
