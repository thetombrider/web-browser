export const BROWSY_API_PORT = 9375
export const BROWSY_CDP_PORT = 9222
/** Max JSON body size for the local agent API (bytes). */
export const BROWSY_API_MAX_BODY_BYTES = 64 * 1024
export const RECENT_SITES_COUNT = 12
/** Max bookmarks that can be marked as pinned home/launcher shortcuts. */
export const PINNED_SITES_MAX = 5
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
/** Top padding on browsy:// internal pages (below the chrome strip). */
export const HOME_PAGE_TOP_PADDING = 48
/** Max background tabs that keep a live WebContents (active is always live). */
export const MAX_WARM_BACKGROUND_TABS = 8
/** Idle time before a warm background tab may hibernate. */
export const TAB_HIBERNATE_IDLE_MS = 2 * 60 * 1000
/** How often to scan for hibernation candidates. */
export const TAB_HIBERNATE_POLL_MS = 15_000
/** Carousel thumbnail capture radius around the selected tab. */
export const CAROUSEL_THUMB_NEIGHBOR_RADIUS = 2
/** Coalesce chrome state IPC bursts (ms). */
export const STATE_BROADCAST_COALESCE_MS = 32
/** Omnibox history search result cap. */
export const HISTORY_SEARCH_LIMIT = 12
/** Recent history rows fetched when the launcher opens (not the full store). */
export const HISTORY_LAUNCHER_PREFETCH = 40

export type ChromePanel = 'navigation' | 'bookmarks' | null

export type SearchEngine = 'google' | 'duckduckgo' | 'bing'
export type RestoreSession = 'always' | 'never'
export type ThemeMode = 'light' | 'dark' | 'system'
export type AiAssistant = 'chatgpt' | 'claude' | 'gemini'

export interface TabState {
  id: string
  title: string
  url: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** True when the tab has no live WebContents and only stores metadata. */
  hibernated: boolean
}

export interface CarouselState {
  selectedTabId: string
  direction: -1 | 1
}

export interface ThumbnailReadyPayload {
  tabId: string
  dataUrl: string
}

export interface ThumbnailFailedPayload {
  tabId: string
}

export interface LinkHoverPayload {
  url: string
  title: string
}

export interface LinkPreviewPayload {
  url: string
  title: string
  hostname: string
  favicon: string | null
  dataUrl: string | null
  theme: 'light' | 'dark'
  failed?: boolean
}

export interface BrowserState {
  tabs: TabState[]
  activeTabId: string | null
  chromePanel: ChromePanel
  chromeVisible: boolean
  chromeFocusToken: number
  carousel: CarouselState | null
}

export interface Bookmark {
  id: string
  title: string
  url: string
  createdAt: number
  /** When true, this bookmark is shown as a pinned shortcut (max PINNED_SITES_MAX). */
  pinned?: boolean
  /** Timestamp used to order pinned shortcuts; ignored when not pinned. */
  pinnedAt?: number
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

export interface Settings {
  homepage: 'recent' | 'blank'
  searchEngine: SearchEngine
  restoreSession: RestoreSession
  theme: ThemeMode
  hasSeenShortcutTip: boolean
  /** Hover previews of http(s) destinations. Default on. */
  linkPreview: boolean
  /** Chat assistant used by the page context menu “Ask AI” action. */
  aiAssistant: AiAssistant
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
  WINDOW_DRAG_START: 'browser:window-drag-start',
  WINDOW_DRAG_MOVE: 'browser:window-drag-move',
  WINDOW_DRAG_END: 'browser:window-drag-end',
  TOGGLE_DEVTOOLS: 'browser:toggle-devtools',
  GET_BOOKMARKS: 'browser:get-bookmarks',
  ADD_BOOKMARK: 'browser:add-bookmark',
  REMOVE_BOOKMARK: 'browser:remove-bookmark',
  GET_HISTORY: 'browser:get-history',
  SEARCH_HISTORY: 'browser:search-history',
  GET_RECENT_SITES: 'browser:get-recent-sites',
  GET_SETTINGS: 'browser:get-settings',
  SET_SETTINGS: 'browser:set-settings',
  SETTINGS_CHANGED: 'browser:settings-changed',
  POPUP_REQUEST: 'browser:popup-request',
  POPUP_RESPONSE: 'browser:popup-response',
  MEDIA_PERMISSION_REQUEST: 'browser:media-permission-request',
  MEDIA_PERMISSION_RESPONSE: 'browser:media-permission-response',
  THUMBNAIL_READY: 'browser:thumbnail-ready',
  THUMBNAIL_FAILED: 'browser:thumbnail-failed',
  TOAST: 'browser:toast',
  BOOKMARK_PAGE: 'browser:bookmark-page',
  PIN_PAGE: 'browser:pin-page',
  BOOKMARKS_CHANGED: 'browser:bookmarks-changed',
  LINK_HOVER: 'browser:link-hover',
  LINK_LEAVE: 'browser:link-leave',
  LINK_PREVIEW_READY: 'browser:link-preview-ready'
} as const

export interface PopupRequest {
  id: string
  url: string
}

export type MediaKind = 'microphone' | 'camera'
export type MediaPermissionDecision = 'allow' | 'deny'

export interface SiteMediaPermissions {
  microphone?: MediaPermissionDecision
  camera?: MediaPermissionDecision
}

export interface MediaPermissionRequest {
  id: string
  origin: string
  kinds: MediaKind[]
}

export interface BookmarkResult {
  added: boolean
  alreadyExists: boolean
  title: string
  url: string
}

export interface PinResult {
  pinned: boolean
  alreadyPinned: boolean
  atLimit: boolean
  bookmarked: boolean
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
  newTab: (url?: string, forceNew?: boolean) => Promise<void>
  closeTab: (tabId?: string) => Promise<void>
  switchTab: (tabId: string) => Promise<void>
  nextTab: () => Promise<void>
  prevTab: () => Promise<void>
  newWindow: () => Promise<void>
  showChrome: (panel: ChromePanel) => Promise<void>
  hideChrome: () => Promise<void>
  setChromeHeight: (height: number) => Promise<void>
  startWindowDrag: (screenX: number, screenY: number) => void
  moveWindowDrag: (screenX: number, screenY: number) => void
  endWindowDrag: () => void
  toggleDevTools: () => Promise<void>
  getBookmarks: () => Promise<Bookmark[]>
  addBookmark: (url?: string, title?: string) => Promise<BookmarkResult>
  bookmarkPage: () => Promise<BookmarkResult>
  pinPage: () => Promise<PinResult>
  removeBookmark: (id: string) => Promise<void>
  getHistory: (limit?: number) => Promise<HistoryEntry[]>
  searchHistory: (query: string, limit?: number) => Promise<HistoryEntry[]>
  getRecentSites: () => Promise<HistoryEntry[]>
  getSettings: () => Promise<Settings>
  setSettings: (settings: Partial<Settings>) => Promise<Settings>
  onSettingsChanged: (callback: (settings: Settings) => void) => () => void
  onBookmarksChanged: (callback: (bookmarks: Bookmark[]) => void) => () => void
  onStateChanged: (callback: (state: BrowserState) => void) => () => void
  onPopupRequest: (callback: (request: PopupRequest) => void) => () => void
  onMediaPermissionRequest: (callback: (request: MediaPermissionRequest) => void) => () => void
  onThumbnailReady: (callback: (payload: ThumbnailReadyPayload) => void) => () => void
  onThumbnailFailed: (callback: (payload: ThumbnailFailedPayload) => void) => () => void
  onToast: (callback: (toast: ToastPayload) => void) => () => void
  respondToPopup: (id: string, allow: boolean) => Promise<void>
  respondToMediaPermission: (id: string, allow: boolean) => Promise<void>
}

declare global {
  interface Window {
    browsy: BrowsyAPI
  }
}
