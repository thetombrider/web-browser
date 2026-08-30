export const BROWSY_API_PORT = 9375
export const BROWSY_CDP_PORT = 9222
/** Max JSON body size for the local agent API (bytes). */
export const BROWSY_API_MAX_BODY_BYTES = 64 * 1024
export const RECENT_SITES_COUNT = 12
/** Max chrome overlay height the renderer may request (px). */
export const CHROME_HEIGHT_MAX = 4000
export const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q='
export const DUCKDUCKGO_SEARCH_URL = 'https://duckduckgo.com/?q='
export const BING_SEARCH_URL = 'https://www.bing.com/search?q='
export const APP_NAME = 'Browsy'
export const APP_SURFACE_LIGHT = '#f4f4f5'
export const APP_SURFACE_DARK = '#111114'
export const APP_SURFACE_ELEVATED_LIGHT = '#ffffff'
export const APP_SURFACE_ELEVATED_DARK = '#1a1a1f'
export const CHROME_NAV_HEIGHT = 100
export const CHROME_PANEL_HEIGHT = 280
export const CHROME_DRAG_HEIGHT = 32
export const CHROME_PEEK_HEIGHT = 6

export type ChromePanel = 'navigation' | 'bookmarks' | 'settings' | 'shortcuts' | null

export type SearchEngine = 'google' | 'duckduckgo' | 'bing'
export type RestoreSession = 'always' | 'never'

export interface TabState {
  id: string
  title: string
  url: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface Bookmark {
  id: string
  title: string
  url: string
  createdAt: number
}

export interface HistoryEntry {
  url: string
  title: string
  visitedAt: number
}

export interface SessionTab {
  url: string
  active: boolean
}

export interface SessionWindow {
  tabs: SessionTab[]
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface BrowserState {
  tabs: TabState[]
  activeTabId: string | null
  chromePanel: ChromePanel
  chromeVisible: boolean
  chromeFocusToken: number
}

export interface Settings {
  homepage: 'recent' | 'blank'
  searchEngine: SearchEngine
  restoreSession: RestoreSession
  hasSeenShortcutTip: boolean
}

export interface ToastPayload {
  id: string
  message: string
  tone?: 'default' | 'success'
}

export const SEARCH_ENGINE_URLS: Record<SearchEngine, string> = {
  google: GOOGLE_SEARCH_URL,
  duckduckgo: DUCKDUCKGO_SEARCH_URL,
  bing: BING_SEARCH_URL
}

export const IPC = {
  GET_STATE: 'browser:get-state',
  STATE_CHANGED: 'browser:state-changed',
  NAVIGATE: 'browser:navigate',
  GO_BACK: 'browser:go-back',
  GO_FORWARD: 'browser:go-forward',
  RELOAD: 'browser:reload',
  STOP: 'browser:stop',
  NEW_TAB: 'browser:new-tab',
  CLOSE_TAB: 'browser:close-tab',
  SWITCH_TAB: 'browser:switch-tab',
  NEXT_TAB: 'browser:next-tab',
  PREV_TAB: 'browser:prev-tab',
  NEW_WINDOW: 'browser:new-window',
  SHOW_CHROME: 'browser:show-chrome',
  HIDE_CHROME: 'browser:hide-chrome',
  SET_CHROME_HEIGHT: 'browser:set-chrome-height',
  TOGGLE_DEVTOOLS: 'browser:toggle-devtools',
  GET_BOOKMARKS: 'browser:get-bookmarks',
  ADD_BOOKMARK: 'browser:add-bookmark',
  REMOVE_BOOKMARK: 'browser:remove-bookmark',
  GET_HISTORY: 'browser:get-history',
  GET_RECENT_SITES: 'browser:get-recent-sites',
  GET_SETTINGS: 'browser:get-settings',
  SET_SETTINGS: 'browser:set-settings',
  POPUP_REQUEST: 'browser:popup-request',
  POPUP_RESPONSE: 'browser:popup-response',
  TOAST: 'browser:toast',
  BOOKMARK_PAGE: 'browser:bookmark-page'
} as const

export interface PopupRequest {
  id: string
  url: string
}

export interface BookmarkResult {
  added: boolean
  alreadyExists: boolean
  title: string
  url: string
}

export interface BrowsyAPI {
  getState: () => Promise<BrowserState>
  navigate: (input: string) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  reload: () => Promise<void>
  stop: () => Promise<void>
  newTab: (url?: string) => Promise<void>
  closeTab: (tabId?: string) => Promise<void>
  switchTab: (tabId: string) => Promise<void>
  nextTab: () => Promise<void>
  prevTab: () => Promise<void>
  newWindow: () => Promise<void>
  showChrome: (panel: ChromePanel) => Promise<void>
  hideChrome: () => Promise<void>
  setChromeHeight: (height: number) => Promise<void>
  toggleDevTools: () => Promise<void>
  getBookmarks: () => Promise<Bookmark[]>
  addBookmark: (url?: string, title?: string) => Promise<BookmarkResult>
  bookmarkPage: () => Promise<BookmarkResult>
  removeBookmark: (id: string) => Promise<void>
  getHistory: () => Promise<HistoryEntry[]>
  getRecentSites: () => Promise<HistoryEntry[]>
  getSettings: () => Promise<Settings>
  setSettings: (settings: Partial<Settings>) => Promise<Settings>
  onStateChanged: (callback: (state: BrowserState) => void) => () => void
  onPopupRequest: (callback: (request: PopupRequest) => void) => () => void
  onToast: (callback: (toast: ToastPayload) => void) => () => void
  respondToPopup: (id: string, allow: boolean) => Promise<void>
}

declare global {
  interface Window {
    browsy: BrowsyAPI
  }
}
