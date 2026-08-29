import { Box } from '@chakra-ui/react'
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
  return (
    <Box
      height="200px"
      overflow="hidden"
      bg="blackAlpha.800"
      backdropFilter="blur(12px)"
      borderBottom="1px solid"
      borderColor="whiteAlpha.200"
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
