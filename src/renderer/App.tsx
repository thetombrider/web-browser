import { useCallback, useEffect, useState } from 'react'
import type { ThumbnailReadyPayload } from '@shared/types'
import { Box, Text } from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import type { BrowserState, PopupRequest, ToastPayload } from '@shared/types'
import { CHROME_DRAG_HEIGHT } from '@shared/types'
import { NavigationChrome } from './components/NavigationChrome'
import { PopupDialog } from './components/PopupDialog'
import { DragRegion } from './components/DragRegion'
import { ToastHost } from './components/ToastHost'
import { TabCarousel } from './components/TabCarousel'
import type { CommandAction } from './utils/suggestions'

export default function App() {
  const [state, setState] = useState<BrowserState>({
    tabs: [],
    activeTabId: null,
    chromePanel: null,
    chromeVisible: false,
    chromeFocusToken: 0,
    carousel: null
  })
  const [popup, setPopup] = useState<PopupRequest | null>(null)
  const [toast, setToast] = useState<ToastPayload | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [shortcutTip, setShortcutTip] = useState(false)

  useEffect(() => {
    window.browsy.getState().then(setState)
    const unsub = window.browsy.onStateChanged(setState)
    const unsubPopup = window.browsy.onPopupRequest(setPopup)
    const unsubThumbnail = window.browsy.onThumbnailReady((payload: ThumbnailReadyPayload) => {
      setThumbnails((current) => ({ ...current, [payload.tabId]: payload.dataUrl }))
    })
    const unsubThumbnailFailed = window.browsy.onThumbnailFailed(({ tabId }) => {
      setThumbnails((current) => {
        const next = { ...current }
        delete next[tabId]
        return next
      })
    })
    const unsubToast = window.browsy.onToast((next) => {
      setToast(next)
      window.setTimeout(() => {
        setToast((current) => (current?.id === next.id ? null : current))
      }, 1800)
    })
    return () => {
      unsub()
      unsubPopup()
      unsubThumbnail()
      unsubThumbnailFailed()
      unsubToast()
    }
  }, [])

  useEffect(() => {
    if (popup || state.carousel || (state.chromeVisible && state.chromePanel === 'navigation')) {
      void window.browsy.setChromeHeight(window.innerHeight)
    } else if (!state.chromeVisible) {
      void window.browsy.setChromeHeight(CHROME_DRAG_HEIGHT)
    }
  }, [popup, state.chromeVisible, state.chromePanel, state.carousel])

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
        void window.browsy.navigate('browsy://bookmarks')
        break
      case 'settings':
        void window.browsy.navigate('browsy://settings')
        break
      case 'shortcuts':
        void window.browsy.navigate('browsy://shortcuts')
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

  useEffect(() => {
    const openTabIds = new Set(state.tabs.map((tab) => tab.id))
    setThumbnails((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => openTabIds.has(id)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [state.tabs])

  return (
    <>
      {/* Drag region stays available above spotlight / peek */}
      {!state.carousel && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          height="32px"
          pointerEvents="none"
          zIndex={1200}
        >
          <DragRegion
            peek={!state.chromeVisible}
            onPeekClick={() => window.browsy.showChrome('navigation')}
          />
        </Box>
      )}

      {state.carousel ? (
        <TabCarousel tabs={state.tabs} carousel={state.carousel} thumbnails={thumbnails} />
      ) : (
        <AnimatePresence>
          {state.chromeVisible && state.chromePanel === 'navigation' && (
            <NavigationChrome
              key="navigation"
              tabs={state.tabs}
              activeTabId={state.activeTabId}
              initialValue={activeTab?.url ?? ''}
              focusToken={state.chromeFocusToken}
              isLoading={activeTab?.isLoading ?? false}
              onSwitchTab={(id) => window.browsy.switchTab(id)}
              onCloseTab={(id) => window.browsy.closeTab(id)}
              onSubmit={(value) => window.browsy.navigate(value)}
              onClose={() => window.browsy.hideChrome()}
              onCommand={runCommand}
            />
          )}
        </AnimatePresence>
      )}

      {shortcutTip && (
        <Box
          position="fixed"
          bottom="24px"
          left="50%"
          transform="translateX(-50%)"
          zIndex={1800}
          pointerEvents="none"
          bg="browsy.tooltip"
          color="browsy.tooltipText"
          px={3}
          py={2}
          borderRadius="md"
          boxShadow="md"
        >
          <Text fontSize="sm">
            Press <Text as="span" fontWeight="700">Ctrl+L</Text> for launcher ·{' '}
            <Text as="span" fontWeight="700">Cmd←/→</Text> for tabs ·{' '}
            <Text as="span" fontWeight="700">Ctrl+/</Text> shortcuts
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
