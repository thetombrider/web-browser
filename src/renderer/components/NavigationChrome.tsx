import { Box, useColorModeValue } from '@chakra-ui/react'
import type { TabState } from '@shared/types'
import { Omnibox } from './Omnibox'
import { TabBar } from './TabBar'

interface NavigationChromeProps {
  tabs: TabState[]
  activeTabId: string | null
  initialValue: string
  focusToken: number
  onSwitchTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onSubmit: (value: string) => void
  onClose: () => void
}

export function NavigationChrome({
  tabs,
  activeTabId,
  initialValue,
  focusToken,
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onSubmit,
  onClose
}: NavigationChromeProps) {
  const surface = useColorModeValue('whiteAlpha.900', 'blackAlpha.700')
  const border = useColorModeValue('blackAlpha.200', 'whiteAlpha.200')

  return (
    <Box
      height="200px"
      overflow="hidden"
      bg={surface}
      backdropFilter="blur(12px)"
      borderBottom="1px solid"
      borderColor={border}
      pt="32px"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={onSwitchTab}
        onClose={onCloseTab}
        onNew={onNewTab}
        onClosePanel={onClose}
      />
      <Omnibox initialValue={initialValue} focusToken={focusToken} onSubmit={onSubmit} onClose={onClose} />
    </Box>
  )
}
