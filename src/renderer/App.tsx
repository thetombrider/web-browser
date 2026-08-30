import { useCallback, useEffect, useState } from 'react'
import { Box, Text, useColorModeValue } from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import type { Bookmark, BrowserState, PopupRequest, ToastPayload } from '@shared/types'
import { CHROME_DRAG_HEIGHT } from '@shared/types'
import { NavigationChrome } from './components/NavigationChrome'
import { BookmarksPanel } from './components/BookmarksPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ShortcutsPanel } from './components/ShortcutsPanel'
import { PopupDialog } from './components/PopupDialog'
import { DragRegion } from './components/DragRegion'
import { ToastHost } from './components/ToastHost'
import type { CommandAction } from './utils/suggestions'

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
  const [toast, setToast] = useState<ToastPayload | null>(null)
  const [shortcutTip, setShortcutTip] = useState(false)
  const tipBg = useColorModeValue('gray.900', 'whiteAlpha.900')
  const tipColor = useColorModeValue('white', 'gray.900')

  const refreshBookmarks = useCallback(async () => {
    setBookmarks(await window.browsy.getBookmarks())
  }, [])

  useEffect(() => {
    window.browsy.getState().then(setState)
    const unsub = window.browsy.onStateChanged(setState)
    const unsubPopup = window.browsy.onPopupRequest(setPopup)
    const unsubToast = window.browsy.onToast((next) => {
      setToast(next)
      window.setTimeout(() => {
        setToast((current) => (current?.id === next.id ? null : current))
      }, 1800)
    })
    return () => {
      unsub()
      unsubPopup()
      unsubToast()
    }
  }, [])

  useEffect(() => {
    if (state.chromePanel === 'bookmarks') {
      void refreshBookmarks()
    }
  }, [state.chromePanel, refreshBookmarks])

  useEffect(() => {
    if (popup) {
      void window.browsy.setChromeHeight(window.innerHeight)
    } else if (!state.chromeVisible) {
      void window.browsy.setChromeHeight(CHROME_DRAG_HEIGHT)
    }
  }, [popup, state.chromeVisible])

  useEffect(() => {
    if (!state.chromeVisible || state.chromePanel !== 'navigation') return
    void window.browsy.getSettings().then((settings) => {
      if (!settings.hasSeenShortcutTip) {
        setShortcutTip(true)
        void window.browsy.setSettings({ hasSeenShortcutTip: true })
        window.setTimeout(() => setShortcutTip(false), 4200)
      }
    })
  }, [state.chromeVisible, state.chromePanel, state.chromeFocusToken])

  const runCommand = useCallback((action: CommandAction) => {
    switch (action) {
      case 'bookmarks':
        void window.browsy.showChrome('bookmarks')
        break
      case 'settings':
        void window.browsy.showChrome('settings')
        break
      case 'shortcuts':
        void window.browsy.showChrome('shortcuts')
        break
      case 'bookmark-page':
        void window.browsy.bookmarkPage()
        break
      case 'new-tab':
        void window.browsy.newTab()
        break
      case 'new-window':
        void window.browsy.newWindow()
        break
      case 'reload':
        void window.browsy.reload()
        void window.browsy.hideChrome()
        break
      case 'home':
        void window.browsy.navigate('browsy://home')
        break
      case 'close-tab':
        void window.browsy.closeTab()
        break
      case 'devtools':
        void window.browsy.toggleDevTools()
        void window.browsy.hideChrome()
        break
    }
  }, [])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  return (
    <>
      {state.chromeVisible ? (
        <Box position="fixed" inset={0} pointerEvents="none" zIndex={1000}>
          <DragRegion />
          <Box pointerEvents="auto">
            <AnimatePresence mode="wait">
              {state.chromePanel === 'navigation' && (
                <NavigationChrome
                  key="navigation"
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
                  onCommand={runCommand}
                />
              )}
              {state.chromePanel === 'bookmarks' && (
                <BookmarksPanel
                  key="bookmarks"
                  bookmarks={bookmarks}
                  onRemove={(id) => {
                    void window.browsy.removeBookmark(id).then(refreshBookmarks)
                  }}
                  onNavigate={(url) => window.browsy.navigate(url)}
                  onAdd={() => {
                    void window.browsy.bookmarkPage().then(refreshBookmarks)
                  }}
                  onClose={() => window.browsy.hideChrome()}
                />
              )}
              {state.chromePanel === 'settings' && (
                <SettingsPanel key="settings" onClose={() => window.browsy.hideChrome()} />
              )}
              {state.chromePanel === 'shortcuts' && (
                <ShortcutsPanel key="shortcuts" onClose={() => window.browsy.hideChrome()} />
              )}
            </AnimatePresence>
          </Box>
        </Box>
      ) : (
        <Box position="fixed" top={0} left={0} right={0} height="32px" pointerEvents="none" zIndex={1000}>
          <DragRegion peek onPeekClick={() => window.browsy.showChrome('navigation')} />
        </Box>
      )}

      {shortcutTip && (
        <Box
          position="fixed"
          bottom="24px"
          left="50%"
          transform="translateX(-50%)"
          zIndex={1800}
          pointerEvents="none"
          bg={tipBg}
          color={tipColor}
          px={3}
          py={2}
          borderRadius="md"
          boxShadow="md"
        >
          <Text fontSize="sm">
            Press <Text as="span" fontWeight="700">Ctrl+L</Text> anytime · <Text as="span" fontWeight="700">?</Text> for
            shortcuts
          </Text>
        </Box>
      )}

      <ToastHost toast={toast} />

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
