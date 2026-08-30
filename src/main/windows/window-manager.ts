import { BrowserWindow, WebContentsView, ipcMain, app, type IpcMainInvokeEvent } from 'electron'
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
import { resolveNavigationInput, generateId } from '../../shared/utils'
import type { BookmarkResult, BrowserState, ChromePanel, SessionWindow, ToastPayload } from '../../shared/types'
import {
  CHROME_DRAG_HEIGHT,
  CHROME_NAV_HEIGHT,
  CHROME_PANEL_HEIGHT,
  CHROME_PEEK_HEIGHT,
  IPC
} from '../../shared/types'

interface BrowserWindowEntry {
  window: BrowserWindow
  tabs: TabManager
  chromeView: WebContentsView
  chromeHeight: number
  toastExpandTimer: ReturnType<typeof setTimeout> | null
}

export class WindowManager {
  private windows = new Map<number, BrowserWindowEntry>()
  private apiServer: ApiServer

  constructor() {
    this.apiServer = new ApiServer(this)
  }

  async initialize(): Promise<void> {
    setupProtocolHandler()
    this.registerIpc()
    this.apiServer.start()

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
      ...(isMac
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } }
        : { frame: false }),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    // Window shell is unused for UI — chrome lives in its own WebContentsView.
    await win.loadURL('data:text/html,<html><body style="margin:0;background:#111114"></body></html>')

    const chromeView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    })
    chromeView.setBackgroundColor('#00000000')

    const tabs = new TabManager(
      win,
      () => this.broadcastState(win.id),
      (id, url) => {
        chromeView.webContents.send(IPC.POPUP_REQUEST, { id, url })
      },
      (action) => this.handleShortcut(win.id, action),
      () => this.layoutWindow(win.id)
    )

    this.windows.set(win.id, {
      window: win,
      tabs,
      chromeView,
      chromeHeight: CHROME_NAV_HEIGHT,
      toastExpandTimer: null
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

    if (session?.tabs?.length) {
      for (const tab of session.tabs) {
        const url = tab.url && tab.url.length > 0 ? tab.url : 'browsy://home'
        await tabs.createTab(url, tab.active)
      }
    } else {
      await tabs.createTab('browsy://home')
    }

    this.layoutWindow(win.id)
    this.registerChromeShortcuts(chromeView, win.id)
    this.broadcastState(win.id)
    return win
  }

  private layoutWindow(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry || entry.window.isDestroyed()) return

    entry.tabs.layoutTabViews()

    const bounds = entry.window.getContentBounds()
    const chromeVisible = entry.tabs.isChromeVisible()
    const height = chromeVisible
      ? Math.max(CHROME_DRAG_HEIGHT, entry.chromeHeight)
      : process.platform === 'linux'
        ? CHROME_DRAG_HEIGHT
        : CHROME_PEEK_HEIGHT

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
    const next = Math.max(CHROME_DRAG_HEIGHT, Math.round(height))
    if (next === entry.chromeHeight) return
    entry.chromeHeight = next
    this.layoutWindow(windowId)
  }

  private handleShortcut(windowId: number, action: string): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    const { tabs } = entry

    switch (action) {
      case 'navigation':
        tabs.showChrome('navigation')
        entry.chromeHeight = CHROME_NAV_HEIGHT
        break
      case 'bookmarks':
        tabs.showChrome('bookmarks')
        entry.chromeHeight = CHROME_PANEL_HEIGHT
        break
      case 'settings':
        tabs.showChrome('settings')
        entry.chromeHeight = CHROME_PANEL_HEIGHT
        break
      case 'shortcuts':
        tabs.showChrome('shortcuts')
        entry.chromeHeight = CHROME_PANEL_HEIGHT
        break
      case 'hide-chrome':
        tabs.hideChrome()
        break
      case 'new-tab':
        void tabs.createTab()
        break
      case 'close-tab': {
        const id = tabs.getActiveTabId()
        if (id) tabs.closeTab(id)
        break
      }
      case 'next-tab':
        tabs.nextTab()
        break
      case 'prev-tab':
        tabs.prevTab()
        break
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
    if (!entry.tabs.isChromeVisible()) {
      const bounds = entry.window.getContentBounds()
      entry.chromeView.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: Math.min(120, bounds.height)
      })
      entry.window.contentView.addChildView(entry.chromeView)
      if (entry.toastExpandTimer) clearTimeout(entry.toastExpandTimer)
      entry.toastExpandTimer = setTimeout(() => {
        entry.toastExpandTimer = null
        if (this.windows.has(windowId) && !entry.tabs.isChromeVisible()) {
          this.layoutWindow(windowId)
        }
      }, 2000)
    }
  }

  private registerChromeShortcuts(chromeView: WebContentsView, windowId: number): void {
    chromeView.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault()
        this.handleShortcut(windowId, 'hide-chrome')
        return
      }
      const mod = input.control || input.meta
      if (!mod) return
      const key = input.key.toLowerCase()
      let action: string | null = null
      if (key === 'l') action = 'navigation'
      else if (key === 't' && !input.shift) action = 'new-tab'
      else if (key === 'w') action = 'close-tab'
      else if (key === 'b') action = 'bookmarks'
      else if (key === 'd') action = 'bookmark-page'
      else if (key === ',') action = 'settings'
      else if (key === '/' || key === '?') action = 'shortcuts'
      else if (key === 'tab') action = input.shift ? 'prev-tab' : 'next-tab'
      else if (key === 'pagedown') action = 'next-tab'
      else if (key === 'pageup') action = 'prev-tab'

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
      return { tabs: [], activeTabId: null, chromePanel: null, chromeVisible: false, chromeFocusToken: 0 }
    }
    return this.buildState(entry.tabs)
  }

  async navigateFocused(input: string): Promise<void> {
    const entry = this.getFocusedEntry()
    if (!entry) return
    const url = resolveNavigationInput(input, getSettings().searchEngine)
    await entry.tabs.navigate(url)
    if (url === 'browsy://home') entry.tabs.showChrome('navigation')
    else entry.tabs.hideChrome()
    this.layoutWindow(entry.window.id)
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
    const resolved = url ? resolveNavigationInput(url, getSettings().searchEngine) : 'browsy://home'
    await entry.tabs.createTab(resolved)
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
      chromeFocusToken: tabs.getChromeFocusToken()
    }
  }

  private broadcastState(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry || entry.chromeView.webContents.isDestroyed()) return
    const state = this.buildState(entry.tabs)
    entry.chromeView.webContents.send(IPC.STATE_CHANGED, state)
  }

  private getEntryFromEvent(event: IpcMainInvokeEvent): BrowserWindowEntry | null {
    const wc = event.sender
    for (const entry of this.windows.values()) {
      if (entry.chromeView.webContents.id === wc.id) return entry
      for (const tab of entry.tabs.getTabs()) {
        if (!tab.view.webContents.isDestroyed() && tab.view.webContents.id === wc.id) {
          return entry
        }
      }
    }
    const win = BrowserWindow.fromWebContents(wc)
    if (!win) return null
    return this.windows.get(win.id) ?? null
  }

  private registerIpc(): void {
    ipcMain.handle(IPC.GET_STATE, (event) => {
      const entry = this.getEntryFromEvent(event)
      return entry ? this.buildState(entry.tabs) : this.getFocusedState()
    })

    ipcMain.handle(IPC.NAVIGATE, async (event, input: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      const url = resolveNavigationInput(input, getSettings().searchEngine)
      await entry.tabs.navigate(url)
      if (url === 'browsy://home') entry.tabs.showChrome('navigation')
      else entry.tabs.hideChrome()
      this.layoutWindow(entry.window.id)
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

    ipcMain.handle(IPC.NEW_TAB, async (event, url?: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      const resolved = url ? resolveNavigationInput(url, getSettings().searchEngine) : 'browsy://home'
      await entry.tabs.createTab(resolved)
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
      if (panel === 'navigation') entry.chromeHeight = CHROME_NAV_HEIGHT
      else entry.chromeHeight = CHROME_PANEL_HEIGHT
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

    ipcMain.handle(IPC.SET_CHROME_HEIGHT, (event, height: number) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      this.setChromeHeight(entry.window.id, height)
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
        const bookmarkTitle = title ?? url
        const result = addBookmark({ id: generateId(), title: bookmarkTitle, url, createdAt: Date.now() })
        return {
          added: result.added,
          alreadyExists: result.alreadyExists,
          title: bookmarkTitle,
          url
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
    ipcMain.handle(IPC.SET_SETTINGS, (_event, settings) => setSettings(settings))

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
