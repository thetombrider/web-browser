import { useCallback, useEffect, useState } from 'react'
import { Box } from '@chakra-ui/react'
import type { Bookmark, BrowserState, PopupRequest } from '@shared/types'
import { NavigationChrome } from './components/NavigationChrome'
import { BookmarksPanel } from './components/BookmarksPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { PopupDialog } from './components/PopupDialog'
import { DragRegion } from './components/DragRegion'

export default function App() {
  const [state, setState] = useState<BrowserState>({
    tabs: [],
    activeTabId: null,
    chromePanel: null,
    chromeVisible: false,
    chromeFocusToken: 0
  })
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [popup, setPopup] = useState<PopupRequest | null>(null)

  const refreshBookmarks = useCallback(async () => {
    setBookmarks(await window.browsy.getBookmarks())
  }, [])

  useEffect(() => {
    window.browsy.getState().then(setState)
    const unsub = window.browsy.onStateChanged(setState)
    const unsubPopup = window.browsy.onPopupRequest(setPopup)
    return () => {
      unsub()
      unsubPopup()
    }
  }, [])

  useEffect(() => {
    if (state.chromePanel === 'bookmarks') {
      void refreshBookmarks()
    }
  }, [state.chromePanel, refreshBookmarks])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  return (
    <>
      {state.chromeVisible ? (
        <Box position="fixed" inset={0} pointerEvents="none" zIndex={1000}>
          <DragRegion />
          <Box pointerEvents="auto">
            {state.chromePanel === 'navigation' && (
              <NavigationChrome
                tabs={state.tabs}
                activeTabId={state.activeTabId}
                initialValue={activeTab?.url ?? ''}
                focusToken={state.chromeFocusToken}
                canGoBack={activeTab?.canGoBack ?? false}
                canGoForward={activeTab?.canGoForward ?? false}
                isLoading={activeTab?.isLoading ?? false}
                onSwitchTab={(id) => window.browsy.switchTab(id)}
                onCloseTab={(id) => window.browsy.closeTab(id)}
                onNewTab={() => window.browsy.newTab()}
                onSubmit={(value) => window.browsy.navigate(value)}
                onClose={() => window.browsy.hideChrome()}
                onBack={() => window.browsy.goBack()}
                onForward={() => window.browsy.goForward()}
                onReload={() => window.browsy.reload()}
                onStop={() => window.browsy.stop()}
              />
            )}
            {state.chromePanel === 'bookmarks' && (
              <BookmarksPanel
                bookmarks={bookmarks}
                onRemove={(id) => {
                  void window.browsy.removeBookmark(id).then(refreshBookmarks)
                }}
                onNavigate={(url) => window.browsy.navigate(url)}
                onAdd={() => {
                  void window.browsy.addBookmark().then(refreshBookmarks)
                }}
                onClose={() => window.browsy.hideChrome()}
              />
            )}
            {state.chromePanel === 'settings' && (
              <SettingsPanel onClose={() => window.browsy.hideChrome()} />
            )}
          </Box>
        </Box>
      ) : (
        <Box position="fixed" top={0} left={0} right={0} height="32px" pointerEvents="none" zIndex={1000}>
          <DragRegion />
        </Box>
      )}
      {popup && (
        <PopupDialog
          request={popup}
          onAllow={() => {
            void window.browsy.respondToPopup(popup.id, true)
            setPopup(null)
          }}
          onDeny={() => {
            void window.browsy.respondToPopup(popup.id, false)
            setPopup(null)
          }}
        />
      )}
    </>
  )
}
