import { Box, type BoxProps } from '@chakra-ui/react'
import type { CSSProperties, ReactNode } from 'react'

const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

export const floatingSurfaceStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.92)',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  color: '#1a1a1e'
}

interface FloatingPanelProps extends BoxProps {
  children: ReactNode
}

export function FloatingPanel({ children, ...props }: FloatingPanelProps) {
  return (
    <Box style={{ ...floatingSurfaceStyle, ...noDrag }} {...props}>
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
