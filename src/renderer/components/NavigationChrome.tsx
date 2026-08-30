import type { TabState } from '@shared/types'
import { ChromePanel } from './ChromePanel'
import { Omnibox } from './Omnibox'
import { TabBar } from './TabBar'

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
}

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
  onStop
}: NavigationChromeProps) {
  return (
    <ChromePanel>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={onSwitchTab}
        onClose={onCloseTab}
        onNew={onNewTab}
      />
      <Omnibox
        initialValue={initialValue}
        focusToken={focusToken}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isLoading={isLoading}
        tabs={tabs}
        onSubmit={onSubmit}
        onClose={onClose}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onStop={onStop}
      />
    </ChromePanel>
  )
}
