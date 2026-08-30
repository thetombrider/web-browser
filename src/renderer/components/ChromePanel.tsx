import { Box, useColorModeValue } from '@chakra-ui/react'
import { APP_SURFACE_DARK, APP_SURFACE_LIGHT } from '@shared/types'
import { useChromeHeight } from '../hooks/useChromeHeight'
import type { ReactNode } from 'react'

interface ChromePanelProps {
  children: ReactNode
  maxHeight?: string | number
}

/** Shared chrome shell: unified surface, drag inset, height sync. */
export function ChromePanel({ children, maxHeight }: ChromePanelProps) {
  const ref = useChromeHeight<HTMLDivElement>()
  const surface = useColorModeValue(APP_SURFACE_LIGHT, APP_SURFACE_DARK)
  const border = useColorModeValue('blackAlpha.200', 'whiteAlpha.200')

  return (
    <Box
      ref={ref}
      bg={surface}
      borderBottom="1px solid"
      borderColor={border}
      pt="32px"
      maxH={maxHeight}
      overflow="hidden"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {children}
    </Box>
  )
}
