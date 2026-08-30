import { Box } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { useChromeHeight } from '../hooks/useChromeHeight'
import type { ReactNode } from 'react'

const MotionBox = motion(Box)

interface ChromePanelProps {
  children: ReactNode
  maxHeight?: string | number
}

/** Shared chrome shell: unified surface, drag inset, height sync, enter motion. */
export function ChromePanel({ children, maxHeight }: ChromePanelProps) {
  const ref = useChromeHeight<HTMLDivElement>()
  return (
    <MotionBox
      ref={ref}
      bg="browsy.surface"
      borderBottom="1px solid"
      borderColor="browsy.border"
      pt="32px"
      maxH={maxHeight}
      overflow="hidden"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      {children}
    </MotionBox>
  )
}
