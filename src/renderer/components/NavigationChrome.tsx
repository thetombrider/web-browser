import type { TabState } from '@shared/types'
import { Box } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { Omnibox } from './Omnibox'
import type { CommandAction } from '../utils/suggestions'

const MotionBox = motion(Box)

interface NavigationChromeProps {
  tabs: TabState[]
  activeTabId: string | null
  initialValue: string
  focusToken: number
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  onSwitchTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onSubmit: (value: string) => void
  onClose: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onCommand: (action: CommandAction) => void
}

/** Spotlight-style launcher: centered floating card over a dimmed page. */
export function NavigationChrome({
  tabs,
  activeTabId,
  initialValue,
  focusToken,
  canGoBack,
  canGoForward,
  isLoading,
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onSubmit,
  onClose,
  onBack,
  onForward,
  onReload,
  onStop,
  onCommand
}: NavigationChromeProps) {
  return (
    <MotionBox
      position="fixed"
      inset={0}
      zIndex={1100}
      display="flex"
      alignItems="flex-start"
      justifyContent="center"
      pt={{ base: '12vh', md: '18vh' }}
      px={4}
      bg="browsy.backdrop"
      onMouseDown={(e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      <MotionBox
        w="100%"
        maxW="560px"
        bg="browsy.elevated"
        borderRadius="xl"
        border="1px solid"
        borderColor="browsy.border"
        boxShadow="browsySpotlight"
        overflow="hidden"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Omnibox
          initialValue={initialValue}
          focusToken={focusToken}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          isLoading={isLoading}
          tabs={tabs}
          activeTabId={activeTabId}
          onSubmit={onSubmit}
          onClose={onClose}
          onBack={onBack}
          onForward={onForward}
          onReload={onReload}
          onStop={onStop}
          onSwitchTab={onSwitchTab}
          onCloseTab={onCloseTab}
          onNewTab={onNewTab}
          onCommand={onCommand}
        />
      </MotionBox>
    </MotionBox>
  )
}
