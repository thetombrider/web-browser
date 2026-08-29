export const BROWSY_API_PORT = 9375
export const BROWSY_CDP_PORT = 9222
export const RECENT_SITES_COUNT = 12
export const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q='
export const APP_NAME = 'Browsy'
export const APP_SURFACE_LIGHT = '#f5f5f7'
export const APP_SURFACE_DARK = '#0f0f12'

export type ChromePanel = 'navigation' | 'bookmarks' | 'settings' | null

export interface TabState {
  id: string
  title: string
  url: string
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
  searchEngine: 'google'
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
  NEW_WINDOW: 'browser:new-window',
  SHOW_CHROME: 'browser:show-chrome',
  HIDE_CHROME: 'browser:hide-chrome',
  TOGGLE_DEVTOOLS: 'browser:toggle-devtools',
  GET_BOOKMARKS: 'browser:get-bookmarks',
  ADD_BOOKMARK: 'browser:add-bookmark',
  REMOVE_BOOKMARK: 'browser:remove-bookmark',
  GET_HISTORY: 'browser:get-history',
  GET_RECENT_SITES: 'browser:get-recent-sites',
  GET_SETTINGS: 'browser:get-settings',
  SET_SETTINGS: 'browser:set-settings',
  POPUP_REQUEST: 'browser:popup-request',
  POPUP_RESPONSE: 'browser:popup-response'
} as const

export interface PopupRequest {
  id: string
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
  newWindow: () => Promise<void>
  showChrome: (panel: ChromePanel) => Promise<void>
  hideChrome: () => Promise<void>
  toggleDevTools: () => Promise<void>
  getBookmarks: () => Promise<Bookmark[]>
  addBookmark: (url?: string, title?: string) => Promise<void>
  removeBookmark: (id: string) => Promise<void>
  getHistory: () => Promise<HistoryEntry[]>
  getRecentSites: () => Promise<HistoryEntry[]>
  getSettings: () => Promise<Settings>
  setSettings: (settings: Partial<Settings>) => Promise<Settings>
  onStateChanged: (callback: (state: BrowserState) => void) => () => void
  onPopupRequest: (callback: (request: PopupRequest) => void) => () => void
  respondToPopup: (id: string, allow: boolean) => Promise<void>
}

declare global {
  interface Window {
    browsy: BrowsyAPI
  }
}
