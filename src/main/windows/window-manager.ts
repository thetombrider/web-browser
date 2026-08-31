import {
  BrowserWindow,
  WebContentsView,
  ipcMain,
  app,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { TabManager } from '../tabs/tab-manager'
import { ApiServer } from '../services/api-server'
import { setupProtocolHandler } from '../services/protocol'
import {
  addBookmark,
  getBookmarks,
  getHistory,
  getRecentSites,
  getSession,
  getSettings,
  removeBookmark,
  saveSession,
  setSettings
} from '../services/store'
import { resolveNavigationInput, generateId, sanitizeNavigationUrl } from '../../shared/utils'
import {
  parseBookmarkTitle,
  parseBookmarkUrl,
  parseFiniteHeight,
  parseSettingsPatch
} from '../services/validation'
import type {
  BookmarkResult,
  BrowserState,
  CarouselState,
  ChromePanel,
  SessionWindow,
  ThumbnailFailedPayload,
  ThumbnailReadyPayload,
  ToastPayload
} from '../../shared/types'
import {
  CHROME_DRAG_HEIGHT,
  CHROME_NAV_HEIGHT,
  CHROME_PANEL_HEIGHT,
  CHROME_HEIGHT_MAX,
  IPC
} from '../../shared/types'

interface BrowserWindowEntry {
  window: BrowserWindow
  tabs: TabManager
  chromeView: WebContentsView
  chromeHeight: number
  /** Page inset below the resting chrome strip (excludes suggestion dropdown expansion). */
  pageInset: number
  toastExpandUntil: number
  toastExpandTimer: ReturnType<typeof setTimeout> | null
  windowDrag: { startScreenX: number; startScreenY: number; startWindowX: number; startWindowY: number } | null
  carousel: CarouselState | null
  carouselTabIds: string[]
  popupOpen: boolean
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export class WindowManager {
  private windows = new Map<number, BrowserWindowEntry>()
  private apiServer: ApiServer | null = null

  constructor(options?: { apiToken?: string | null }) {
    const token = options?.apiToken ?? null
    if (token) {
      this.apiServer = new ApiServer(this, token)
    }
  }

  async initialize(): Promise<void> {
    setupProtocolHandler()
    this.registerIpc()
    this.apiServer?.start()

    const session = getSettings().restoreSession === 'always' ? getSession() : []
    if (session.length > 0) {
      for (const winSession of session) {
        await this.createWindow(winSession)
      }
    } else {
      await this.createWindow()
    }

    app.on('before-quit', () => this.persistSession())
  }

  async createWindow(session?: SessionWindow): Promise<BrowserWindow> {
    const isMac = process.platform === 'darwin'

    const win = new BrowserWindow({
      width: session?.bounds?.width ?? 1280,
      height: session?.bounds?.height ?? 800,
      x: session?.bounds?.x,
      y: session?.bounds?.y,
      show: false,
      title: 'Browsy',
      backgroundColor: '#111114',
      // Full-bleed page content; hide the native macOS traffic lights so they
      // never sit on top of web pages or the chrome overlay. Window move still
      // works via the custom drag strip; close/minimize/zoom via system shortcuts.
      ...(isMac ? { titleBarStyle: 'hidden' as const } : { frame: false }),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    if (isMac) {
      win.setWindowButtonVisibility(false)
      // macOS can restore the traffic lights after exiting fullscreen.
      win.on('leave-full-screen', () => {
        if (!win.isDestroyed()) win.setWindowButtonVisibility(false)
      })
    }

    // Window shell is unused for UI — chrome lives in its own WebContentsView.
    await win.loadURL('data:text/html,<html><body style="margin:0;background:#111114"></body></html>')

    const chromeView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false
      }
    })
    chromeView.setBackgroundColor('#00000001')

    const tabs = new TabManager(
      win,
      () => this.broadcastState(win.id),
      (id, url) => {
        const entry = this.windows.get(win.id)
        if (entry) {
          entry.popupOpen = true
          this.layoutWindow(win.id)
        }
        chromeView.webContents.send(IPC.POPUP_REQUEST, { id, url })
      },
      (id) => {
        const entry = this.windows.get(win.id)
        if (entry) {
          entry.popupOpen = false
          this.layoutWindow(win.id)
        }
      },
      (action) => this.handleShortcut(win.id, action),
      () => this.layoutWindow(win.id),
      () => this.windows.get(win.id)?.carousel !== null
    )

    this.windows.set(win.id, {
      window: win,
      tabs,
      chromeView,
      chromeHeight: CHROME_NAV_HEIGHT,
      pageInset: CHROME_NAV_HEIGHT,
      toastExpandUntil: 0,
      toastExpandTimer: null,
      windowDrag: null,
      carousel: null,
      carouselTabIds: [],
      popupOpen: false
    })

    win.on('ready-to-show', () => win.show())
    win.on('resize', () => this.layoutWindow(win.id))
    win.on('closed', () => {
      tabs.destroy()
      if (!chromeView.webContents.isDestroyed()) {
        chromeView.webContents.close()
      }
      this.windows.delete(win.id)
      if (this.windows.size === 0) {
        app.quit()
      }
    })

    win.on('focus', () => this.broadcastState(win.id))

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    const chromeUrl =
      rendererUrl && rendererUrl.length > 0
        ? rendererUrl
        : pathToFileURL(join(__dirname, '../renderer/index.html')).href

    await chromeView.webContents.loadURL(chromeUrl)

    // Lock the privileged chrome UI to its own origin.
    chromeView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    chromeView.webContents.on('will-navigate', (event, url) => {
      const allowed =
        url === chromeUrl ||
        (url.startsWith('file://') && chromeUrl.startsWith('file://')) ||
        (typeof rendererUrl === 'string' && rendererUrl.length > 0 && url.startsWith(rendererUrl))
      if (!allowed) event.preventDefault()
    })

    await tabs.createTab('browsy://home')

    this.layoutWindow(win.id)
    this.registerChromeShortcuts(chromeView, win.id)
    this.broadcastState(win.id)
    win.show()

    if (session?.tabs?.length) {
      void this.restoreSessionTabs(win.id, session.tabs)
    }

    return win
  }

  private async restoreSessionTabs(windowId: number, sessionTabs: SessionWindow['tabs']): Promise<void> {
    const entry = this.windows.get(windowId)
    if (!entry) return

    const urls = sessionTabs
      .map((tab) => sanitizeNavigationUrl(tab.url) ?? 'browsy://home')
      .filter((url) => !url.startsWith('browsy://home'))

    await Promise.allSettled(urls.map((url) => entry.tabs.createTab(url, false)))

    if (this.windows.has(windowId)) {
      this.layoutWindow(windowId)
      this.broadcastState(windowId)
    }
  }

  private layoutWindow(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry || entry.window.isDestroyed()) return

    const bounds = entry.window.getContentBounds()
    const chromeVisible = entry.tabs.isChromeVisible()
    const spotlightOpen = chromeVisible && entry.tabs.getChromePanel() === 'navigation'
    // Spotlight floats over full-bleed pages — never inset content for it.
    entry.tabs.layoutTabViews(0)

    if (entry.carousel || spotlightOpen || entry.popupOpen) {
      entry.chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
      entry.window.contentView.addChildView(entry.chromeView)
      entry.chromeView.webContents.focus()
      return
    }

    let height = chromeVisible
      ? Math.max(CHROME_DRAG_HEIGHT, entry.chromeHeight)
      : CHROME_DRAG_HEIGHT

    // Keep overlay tall enough for an in-flight toast after bookmark, etc.
    if (!chromeVisible && Date.now() < entry.toastExpandUntil) {
      height = Math.max(height, 120)
    }

    entry.chromeView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: Math.min(height, bounds.height)
    })

    // Keep chrome above the active page view.
    entry.window.contentView.addChildView(entry.chromeView)

    if (chromeVisible) {
      entry.chromeView.webContents.focus()
    }
  }

  private setChromeHeight(windowId: number, height: number): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    // Spotlight / carousel use the full window; only peek/toast need a height floor.
    const spotlightOpen =
      entry.tabs.isChromeVisible() && entry.tabs.getChromePanel() === 'navigation'
    if (spotlightOpen || entry.carousel) {
      entry.chromeHeight = Math.max(CHROME_DRAG_HEIGHT, Math.round(height))
      this.layoutWindow(windowId)
      return
    }
    const floor = entry.tabs.isChromeVisible() ? CHROME_PANEL_HEIGHT : CHROME_DRAG_HEIGHT
    const next = Math.max(floor, Math.round(height))
    if (next === entry.chromeHeight) return
    entry.chromeHeight = next
    this.layoutWindow(windowId)
  }

  private toggleChromePanel(entry: BrowserWindowEntry, panel: Exclude<ChromePanel, null>, height: number): void {
    if (entry.tabs.isChromeVisible() && entry.tabs.getChromePanel() === panel) {
      entry.tabs.hideChrome()
      return
    }
    entry.chromeHeight = height
    entry.tabs.showChrome(panel)
  }

  private handleShortcut(windowId: number, action: string): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    const { tabs } = entry

    if (action === 'next-tab' || action === 'prev-tab') {
      this.handleTabNavigationShortcut(windowId, action === 'next-tab' ? 1 : -1)
      return
    }

    if (entry.carousel && action === 'commit-carousel') {
      this.commitCarousel(windowId)
      return
    }
    if (entry.carousel && action === 'dismiss-carousel') {
      this.dismissCarousel(windowId)
      return
    }

    switch (action) {
      case 'navigation':
        this.toggleChromePanel(entry, 'navigation', CHROME_NAV_HEIGHT)
        break
      case 'bookmarks':
        void tabs.navigate('browsy://bookmarks').then(() => {
          tabs.hideChrome()
          this.layoutWindow(windowId)
          this.broadcastState(windowId)
        })
        return
      case 'settings':
        void tabs.navigate('browsy://settings')
        entry.chromeHeight = CHROME_NAV_HEIGHT
        break
      case 'shortcuts':
        void tabs.navigate('browsy://shortcuts')
        entry.chromeHeight = CHROME_NAV_HEIGHT
        break
      case 'hide-chrome':
        tabs.hideChrome()
        break
      case 'new-tab':
        void tabs.openNewTab()
        break
      case 'close-tab': {
        if (entry.carousel) {
          this.closeCarouselTab(windowId)
          return
        }
        const id = tabs.getActiveTabId()
        if (id) tabs.closeTab(id)
        break
      }
      case 'reload':
        tabs.reload()
        break
      case 'back':
        tabs.goBack()
        break
      case 'forward':
        tabs.goForward()
        break
      case 'toggle-devtools':
        tabs.toggleDevTools()
        break
      case 'new-window':
        void this.createWindow()
        break
      case 'bookmark-page':
        this.bookmarkActivePage(windowId)
        break
    }
    this.layoutWindow(windowId)
    this.broadcastState(windowId)
  }

  private handleTabNavigationShortcut(windowId: number, direction: -1 | 1): void {
    const entry = this.windows.get(windowId)
    if (!entry) return

    if (entry.carousel) {
      entry.carouselTabIds = entry.carouselTabIds.filter((tabId) => entry.tabs.hasTab(tabId))
      if (entry.carouselTabIds.length < 2) {
        this.dismissCarousel(windowId)
        return
      }
      const currentIndex = entry.carouselTabIds.indexOf(entry.carousel.selectedTabId)
      if (currentIndex === -1) {
        entry.carousel = { selectedTabId: entry.carouselTabIds[0], direction }
        this.layoutWindow(windowId)
        this.broadcastState(windowId)
        return
      }
      const nextIndex = (currentIndex + direction + entry.carouselTabIds.length) % entry.carouselTabIds.length
      entry.carousel = { selectedTabId: entry.carouselTabIds[nextIndex], direction }
      this.layoutWindow(windowId)
      this.broadcastState(windowId)
      return
    }

    // Carousel is the sole tab switcher (≥2 tabs). Spotlight dismisses first.
    if (entry.tabs.getTabs().length < 2) {
      if (direction === 1) entry.tabs.nextTab()
      else entry.tabs.prevTab()
      this.layoutWindow(windowId)
      this.broadcastState(windowId)
      return
    }

    if (entry.tabs.isChromeVisible()) {
      entry.tabs.hideChrome()
    }

    const tabIds = entry.tabs.getTabs().map((tab) => tab.id)
    const activeIndex = tabIds.indexOf(entry.tabs.getActiveTabId() ?? '')
    entry.carouselTabIds = tabIds
    entry.carousel = { selectedTabId: tabIds[activeIndex >= 0 ? activeIndex : 0], direction }
    this.layoutWindow(windowId)
    this.broadcastState(windowId)
    void this.captureCarouselThumbnails(windowId, tabIds)
  }

  private closeCarouselTab(windowId: number): void {
    const entry = this.windows.get(windowId)
    const carousel = entry?.carousel
    const selectedTabId = carousel?.selectedTabId
    if (!entry || !carousel || !selectedTabId) return

    const selectedIndex = entry.carouselTabIds.indexOf(selectedTabId)
    const direction = carousel.direction
    entry.tabs.closeTab(selectedTabId)
    entry.carouselTabIds = entry.carouselTabIds.filter((tabId) => tabId !== selectedTabId && entry.tabs.hasTab(tabId))

    if (entry.carouselTabIds.length < 2) {
      this.dismissCarousel(windowId)
      return
    }

    const nextIndex = Math.min(Math.max(selectedIndex, 0), entry.carouselTabIds.length - 1)
    entry.carousel = {
      selectedTabId: entry.carouselTabIds[nextIndex],
      direction
    }
    this.layoutWindow(windowId)
    this.broadcastState(windowId)
    void this.captureCarouselThumbnails(windowId, entry.carouselTabIds)
  }

  private async captureCarouselThumbnails(windowId: number, tabIds: string[]): Promise<void> {
    const entry = this.windows.get(windowId)
    if (!entry) return

    for (const tabId of tabIds) {
      const current = this.windows.get(windowId)
      if (!current || !current.carousel || !current.tabs.hasTab(tabId)) continue
      const dataUrl = await current.tabs.captureThumbnail(tabId)
      const latest = this.windows.get(windowId)
      if (!latest || !latest.carousel || !dataUrl || !latest.tabs.hasTab(tabId)) {
        if (latest?.carousel && latest.tabs.hasTab(tabId) && !dataUrl) {
          latest.chromeView.webContents.send(IPC.THUMBNAIL_FAILED, { tabId } satisfies ThumbnailFailedPayload)
        }
        continue
      }
      latest.chromeView.webContents.send(IPC.THUMBNAIL_READY, { tabId, dataUrl } satisfies ThumbnailReadyPayload)
    }
  }

  private commitCarousel(windowId: number): void {
    const entry = this.windows.get(windowId)
    const tabId = entry?.carousel?.selectedTabId
    if (!entry || !tabId || !entry.tabs.hasTab(tabId)) {
      this.dismissCarousel(windowId)
      return
    }

    entry.carousel = null
    entry.carouselTabIds = []
    entry.tabs.switchTab(tabId)
    this.layoutWindow(windowId)
    this.broadcastState(windowId)
  }

  private dismissCarousel(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry?.carousel) return
    entry.carousel = null
    entry.carouselTabIds = []
    this.layoutWindow(windowId)
    this.broadcastState(windowId)
  }

  private bookmarkActivePage(windowId: number): BookmarkResult {
    const entry = this.windows.get(windowId)
    const empty: BookmarkResult = { added: false, alreadyExists: false, title: '', url: '' }
    if (!entry) return empty

    const active = entry.tabs.getActiveTab()
    const wc = active?.view.webContents
    if (!wc || wc.isDestroyed()) return empty

    const url = wc.getURL()
    const title = wc.getTitle() || url
    if (!url || url.startsWith('browsy://')) {
      this.sendToast(windowId, { id: generateId(), message: 'This page can’t be bookmarked', tone: 'default' })
      return empty
    }

    const result = addBookmark({ id: generateId(), title, url, createdAt: Date.now() })
    const payload: BookmarkResult = {
      added: result.added,
      alreadyExists: result.alreadyExists,
      title,
      url
    }
    this.sendToast(windowId, {
      id: generateId(),
      message: result.alreadyExists ? 'Already bookmarked' : 'Bookmarked',
      tone: 'success'
    })
    return payload
  }

  private sendToast(windowId: number, toast: ToastPayload): void {
    const entry = this.windows.get(windowId)
    if (!entry || entry.chromeView.webContents.isDestroyed()) return
    entry.chromeView.webContents.send(IPC.TOAST, toast)

    // Expand overlay briefly so the toast isn't clipped when chrome is hidden.
    // layoutWindow (called after shortcuts) must respect this window.
    if (!entry.tabs.isChromeVisible()) {
      entry.toastExpandUntil = Date.now() + 2200
      if (entry.toastExpandTimer) clearTimeout(entry.toastExpandTimer)
      entry.toastExpandTimer = setTimeout(() => {
        entry.toastExpandTimer = null
        entry.toastExpandUntil = 0
        if (this.windows.has(windowId) && !entry.tabs.isChromeVisible()) {
          this.layoutWindow(windowId)
        }
      }, 2200)
      this.layoutWindow(windowId)
    }
  }

  private registerChromeShortcuts(chromeView: WebContentsView, windowId: number): void {
    chromeView.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const entry = this.windows.get(windowId)
      if (entry?.carousel && input.key === 'Escape') {
        event.preventDefault()
        this.handleShortcut(windowId, 'dismiss-carousel')
        return
      }
      if (entry?.carousel && input.key === 'Enter') {
        event.preventDefault()
        this.handleShortcut(windowId, 'commit-carousel')
        return
      }
      if (input.key === 'Escape') {
        event.preventDefault()
        this.handleShortcut(windowId, 'hide-chrome')
        return
      }
      const mod = input.control || input.meta
      if (!mod) return
      const key = input.key.toLowerCase()
      const code = input.code
      let action: string | null = null
      if (key === 'l') action = 'navigation'
      else if (key === 't' && !input.shift) action = 'new-tab'
      else if (key === 'w') action = 'close-tab'
      else if (key === 'b') action = 'bookmarks'
      else if (key === 'd') action = 'bookmark-page'
      else if (key === ',') action = 'settings'
      else if (key === '/' || key === '?' || code === 'Slash') action = 'shortcuts'
      else if (input.meta && (key === 'arrowright' || code === 'ArrowRight')) action = 'next-tab'
      else if (input.meta && (key === 'arrowleft' || code === 'ArrowLeft')) action = 'prev-tab'

      if (action) {
        event.preventDefault()
        this.handleShortcut(windowId, action)
      }
    })
  }

  getFocusedEntry(): BrowserWindowEntry | null {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return this.windows.values().next().value ?? null
    return this.windows.get(focused.id) ?? null
  }

  getFocusedState(): BrowserState {
    const entry = this.getFocusedEntry()
    if (!entry) {
      return { tabs: [], activeTabId: null, chromePanel: null, chromeVisible: false, chromeFocusToken: 0, carousel: null }
    }
    return this.buildState(entry.tabs)
  }

  async navigateFocused(input: string): Promise<void> {
    const entry = this.getFocusedEntry()
    if (!entry) return
    const url = resolveNavigationInput(input, getSettings().searchEngine)
    entry.tabs.hideChrome()
    this.layoutWindow(entry.window.id)
    void entry.tabs.navigate(url).catch(() => undefined)
  }

  goBackFocused(): void {
    this.getFocusedEntry()?.tabs.goBack()
  }

  goForwardFocused(): void {
    this.getFocusedEntry()?.tabs.goForward()
  }

  reloadFocused(): void {
    this.getFocusedEntry()?.tabs.reload()
  }

  stopFocused(): void {
    this.getFocusedEntry()?.tabs.stop()
  }

  async newTabFocused(url?: string): Promise<void> {
    const entry = this.getFocusedEntry()
    if (!entry) return
    if (url) {
      const resolved = resolveNavigationInput(url, getSettings().searchEngine)
      await entry.tabs.openNewTab(resolved)
    } else {
      await entry.tabs.openNewTab()
    }
    this.layoutWindow(entry.window.id)
  }

  closeTabFocused(tabId?: string): void {
    const entry = this.getFocusedEntry()
    if (!entry) return
    const id = tabId ?? entry.tabs.getActiveTabId()
    if (id) entry.tabs.closeTab(id)
    this.layoutWindow(entry.window.id)
  }

  switchTabFocused(tabId: string): void {
    const entry = this.getFocusedEntry()
    if (!entry) return
    entry.tabs.switchTab(tabId)
    this.layoutWindow(entry.window.id)
  }

  toggleDevToolsFocused(): void {
    this.getFocusedEntry()?.tabs.toggleDevTools()
  }

  private buildState(tabs: TabManager): BrowserState {
    return {
      tabs: tabs.getTabStates(),
      activeTabId: tabs.getActiveTabId(),
      chromeVisible: tabs.isChromeVisible(),
      chromePanel: tabs.getChromePanel(),
      chromeFocusToken: tabs.getChromeFocusToken(),
      carousel: [...this.windows.values()].find((entry) => entry.tabs === tabs)?.carousel ?? null
    }
  }

  private broadcastState(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry || entry.chromeView.webContents.isDestroyed()) return
    const state = this.buildState(entry.tabs)
    entry.chromeView.webContents.send(IPC.STATE_CHANGED, state)
  }

  private getEntryFromEvent(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindowEntry | null {
    const wc = event.sender
    for (const entry of this.windows.values()) {
      if (entry.chromeView.webContents.id === wc.id) return entry
      for (const tab of entry.tabs.getTabs()) {
        const tabWc = tab?.view?.webContents
        if (tabWc && !tabWc.isDestroyed() && tabWc.id === wc.id) {
          return entry
        }
      }
    }
    const win = BrowserWindow.fromWebContents(wc)
    if (!win) return null
    return this.windows.get(win.id) ?? null
  }

  private registerIpc(): void {
    ipcMain.on(IPC.WINDOW_DRAG_START, (event, screenX: unknown, screenY: unknown) => {
      if (!isFiniteNumber(screenX) || !isFiniteNumber(screenY)) return
      const entry = this.getEntryFromEvent(event)
      if (!entry || entry.window.isDestroyed()) return
      const [windowX, windowY] = entry.window.getPosition()
      entry.windowDrag = {
        startScreenX: screenX,
        startScreenY: screenY,
        startWindowX: windowX,
        startWindowY: windowY
      }
    })

    ipcMain.on(IPC.WINDOW_DRAG_MOVE, (event, screenX: unknown, screenY: unknown) => {
      if (!isFiniteNumber(screenX) || !isFiniteNumber(screenY)) return
      const entry = this.getEntryFromEvent(event)
      const drag = entry?.windowDrag
      if (!entry || !drag || entry.window.isDestroyed()) return
      entry.window.setPosition(
        Math.round(drag.startWindowX + screenX - drag.startScreenX),
        Math.round(drag.startWindowY + screenY - drag.startScreenY)
      )
    })

    ipcMain.on(IPC.WINDOW_DRAG_END, (event) => {
      const entry = this.getEntryFromEvent(event)
      if (entry) entry.windowDrag = null
    })

    ipcMain.handle(IPC.GET_STATE, (event) => {
      const entry = this.getEntryFromEvent(event)
      return entry ? this.buildState(entry.tabs) : this.getFocusedState()
    })

    ipcMain.handle(IPC.NAVIGATE, (event, input: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      const url = resolveNavigationInput(input, getSettings().searchEngine)
      entry.tabs.hideChrome()
      this.layoutWindow(entry.window.id)
      void entry.tabs.navigate(url).catch(() => undefined)
    })

    ipcMain.handle(IPC.GO_BACK, (event) => {
      this.getEntryFromEvent(event)?.tabs.goBack()
    })

    ipcMain.handle(IPC.GO_FORWARD, (event) => {
      this.getEntryFromEvent(event)?.tabs.goForward()
    })

    ipcMain.handle(IPC.RELOAD, (event) => {
      this.getEntryFromEvent(event)?.tabs.reload()
    })

    ipcMain.handle(IPC.STOP, (event) => {
      this.getEntryFromEvent(event)?.tabs.stop()
    })

    ipcMain.handle(IPC.NEW_TAB, async (event, url?: string, forceNew?: unknown) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      if (url) {
        const resolved = resolveNavigationInput(url, getSettings().searchEngine)
        await entry.tabs.openNewTab(resolved, forceNew === true)
      } else {
        await entry.tabs.openNewTab('browsy://home', forceNew === true)
      }
      this.layoutWindow(entry.window.id)
    })

    ipcMain.handle(IPC.CLOSE_TAB, (event, tabId?: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      const id = tabId ?? entry.tabs.getActiveTabId()
      if (id) entry.tabs.closeTab(id)
      this.layoutWindow(entry.window.id)
    })

    ipcMain.handle(IPC.SWITCH_TAB, (event, tabId: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      entry.tabs.switchTab(tabId)
      this.layoutWindow(entry.window.id)
    })

    ipcMain.handle(IPC.NEXT_TAB, (event) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      entry.tabs.nextTab()
      this.layoutWindow(entry.window.id)
    })

    ipcMain.handle(IPC.PREV_TAB, (event) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      entry.tabs.prevTab()
      this.layoutWindow(entry.window.id)
    })

    ipcMain.handle(IPC.NEW_WINDOW, async () => {
      await this.createWindow()
    })

    ipcMain.handle(IPC.SHOW_CHROME, (event, panel: ChromePanel) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      if (panel === 'navigation') {
        entry.chromeHeight = Math.max(entry.chromeHeight, CHROME_NAV_HEIGHT)
      } else {
        entry.chromeHeight = CHROME_PANEL_HEIGHT
      }
      entry.tabs.showChrome(panel)
      this.layoutWindow(entry.window.id)
      this.broadcastState(entry.window.id)
    })

    ipcMain.handle(IPC.HIDE_CHROME, (event) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      entry.tabs.hideChrome()
      this.layoutWindow(entry.window.id)
      this.broadcastState(entry.window.id)
    })

    ipcMain.handle(IPC.SET_CHROME_HEIGHT, (event, height: unknown) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      const safeHeight = parseFiniteHeight(height, entry.chromeHeight, CHROME_HEIGHT_MAX)
      this.setChromeHeight(entry.window.id, safeHeight)
    })

    ipcMain.handle(IPC.TOGGLE_DEVTOOLS, (event) => {
      this.getEntryFromEvent(event)?.tabs.toggleDevTools()
    })

    ipcMain.handle(IPC.GET_BOOKMARKS, () => getBookmarks())
    ipcMain.handle(IPC.ADD_BOOKMARK, (event, url?: string, title?: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) {
        return { added: false, alreadyExists: false, title: '', url: '' } satisfies BookmarkResult
      }
      if (url) {
        const safeUrl = parseBookmarkUrl(url)
        if (!safeUrl) {
          return { added: false, alreadyExists: false, title: '', url: '' } satisfies BookmarkResult
        }
        const bookmarkTitle = parseBookmarkTitle(title, safeUrl)
        const result = addBookmark({ id: generateId(), title: bookmarkTitle, url: safeUrl, createdAt: Date.now() })
        return {
          added: result.added,
          alreadyExists: result.alreadyExists,
          title: bookmarkTitle,
          url: safeUrl
        } satisfies BookmarkResult
      }
      return this.bookmarkActivePage(entry.window.id)
    })

    ipcMain.handle(IPC.BOOKMARK_PAGE, (event) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) {
        return { added: false, alreadyExists: false, title: '', url: '' } satisfies BookmarkResult
      }
      return this.bookmarkActivePage(entry.window.id)
    })

    ipcMain.handle(IPC.REMOVE_BOOKMARK, (_event, id: string) => {
      removeBookmark(id)
    })

    ipcMain.handle(IPC.GET_HISTORY, () => getHistory())
    ipcMain.handle(IPC.GET_RECENT_SITES, () => getRecentSites())
    ipcMain.handle(IPC.GET_SETTINGS, () => getSettings())
    ipcMain.handle(IPC.SET_SETTINGS, (_event, settings) => {
      const patch = parseSettingsPatch(settings)
      if (!patch) return getSettings()
      return setSettings(patch)
    })

    ipcMain.handle(IPC.POPUP_RESPONSE, (event, id: string, allow: boolean) => {
      this.getEntryFromEvent(event)?.tabs.respondToPopup(id, allow)
    })
  }

  private persistSession(): void {
    const session: SessionWindow[] = []
    for (const entry of this.windows.values()) {
      const bounds = entry.window.getBounds()
      session.push({
        tabs: entry.tabs.getSessionTabs(),
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      })
    }
    saveSession(session)
  }
}
