import { BrowserWindow, BrowserView, ipcMain, app, type IpcMainInvokeEvent } from 'electron'
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
import type { BrowserState, ChromePanel, SessionWindow } from '../../shared/types'
import { IPC } from '../../shared/types'

interface BrowserWindowEntry {
  window: BrowserWindow
  tabs: TabManager
  chromeView: BrowserView
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

    const session = getSession()
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
      backgroundColor: '#00000000',
      transparent: true,
      ...(isMac
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } }
        : { frame: false }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    const chromeUrl =
      rendererUrl && rendererUrl.length > 0
        ? rendererUrl
        : pathToFileURL(join(__dirname, '../renderer/index.html')).href

    const chromeView = new BrowserView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    })

    const tabs = new TabManager(
      win,
      () => this.broadcastState(win.id),
      (id, url) => {
        chromeView.webContents.send('browser:popup-request', { id, url })
      },
      (action) => this.handleShortcut(win.id, action),
      (visible) => this.setChromeOverlayVisible(win.id, visible)
    )

    this.windows.set(win.id, { window: win, tabs, chromeView })

    win.on('ready-to-show', () => win.show())
    win.on('resize', () => this.layoutChromeView(win.id))
    win.on('closed', () => {
      tabs.destroy()
      win.removeBrowserView(chromeView)
      this.windows.delete(win.id)
      if (this.windows.size === 0) {
        app.quit()
      }
    })

    win.on('focus', () => this.broadcastState(win.id))

    await win.loadURL('about:blank')

    win.addBrowserView(chromeView)
    chromeView.setBackgroundColor('#00000000')
    await chromeView.webContents.loadURL(chromeUrl)
    this.layoutChromeView(win.id)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setTopBrowserView(chromeView)

    if (session?.tabs?.length) {
      for (const tab of session.tabs) {
        const url = tab.url && tab.url.length > 0 ? tab.url : 'browsy://home'
        await tabs.createTab(url, tab.active)
      }
    } else {
      await tabs.createTab('browsy://home')
    }

    this.registerRendererShortcuts(chromeView)
    this.broadcastState(win.id)
    return win
  }

  private layoutChromeView(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    const bounds = entry.window.getContentBounds()
    entry.chromeView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    })
  }

  private setChromeOverlayVisible(windowId: number, visible: boolean): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    entry.window.setIgnoreMouseEvents(!visible, { forward: true })
    entry.window.setTopBrowserView(entry.chromeView)
    if (visible) {
      entry.chromeView.webContents.focus()
    }
  }

  private handleShortcut(windowId: number, action: string): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    const { tabs } = entry

    switch (action) {
      case 'omnibox':
        tabs.showChrome('omnibox')
        break
      case 'tabs':
        tabs.showChrome('tabs')
        break
      case 'bookmarks':
        tabs.showChrome('bookmarks')
        break
      case 'settings':
        tabs.showChrome('settings')
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
    }
    this.broadcastState(windowId)
  }

  private registerRendererShortcuts(chromeView: BrowserView): void {
    chromeView.webContents.on('before-input-event', (_event, input) => {
      const win = BrowserWindow.fromWebContents(chromeView.webContents)
      if (!win) return

      if (input.key === 'Escape') {
        this.handleShortcut(win.id, 'hide-chrome')
        return
      }
      const mod = input.control || input.meta
      if (!mod) return
      const key = input.key.toLowerCase()
      if (key === 'l') this.handleShortcut(win.id, 'omnibox')
      else if (key === 't' && input.shift) this.handleShortcut(win.id, 'tabs')
      else if (key === 't') this.handleShortcut(win.id, 'new-tab')
      else if (key === 'w') this.handleShortcut(win.id, 'close-tab')
      else if (key === 'b') this.handleShortcut(win.id, 'bookmarks')
      else if (key === ',') this.handleShortcut(win.id, 'settings')
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
      return { tabs: [], activeTabId: null, chromePanel: null, chromeVisible: false }
    }
    return this.buildState(entry.tabs)
  }

  async navigateFocused(input: string): Promise<void> {
    const entry = this.getFocusedEntry()
    if (!entry) return
    const url = resolveNavigationInput(input)
    await entry.tabs.navigate(url)
    entry.tabs.hideChrome()
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
    const resolved = url ? resolveNavigationInput(url) : 'browsy://home'
    await entry.tabs.createTab(resolved)
  }

  closeTabFocused(tabId?: string): void {
    const entry = this.getFocusedEntry()
    if (!entry) return
    const id = tabId ?? entry.tabs.getActiveTabId()
    if (id) entry.tabs.closeTab(id)
  }

  switchTabFocused(tabId: string): void {
    this.getFocusedEntry()?.tabs.switchTab(tabId)
  }

  toggleDevToolsFocused(): void {
    this.getFocusedEntry()?.tabs.toggleDevTools()
  }

  private buildState(tabs: TabManager): BrowserState {
    return {
      tabs: tabs.getTabStates(),
      activeTabId: tabs.getActiveTabId(),
      chromeVisible: tabs.isChromeVisible(),
      chromePanel: tabs.getChromePanel()
    }
  }

  private broadcastState(windowId: number): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    const state = this.buildState(entry.tabs)
    entry.chromeView.webContents.send(IPC.STATE_CHANGED, state)
  }

  private getEntryFromEvent(event: IpcMainInvokeEvent): BrowserWindowEntry | null {
    const win = BrowserWindow.fromWebContents(event.sender)
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
      const url = resolveNavigationInput(input)
      await entry.tabs.navigate(url)
      entry.tabs.hideChrome()
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
      const resolved = url ? resolveNavigationInput(url) : 'browsy://home'
      await entry.tabs.createTab(resolved)
    })

    ipcMain.handle(IPC.CLOSE_TAB, (event, tabId?: string) => {
      const entry = this.getEntryFromEvent(event)
      if (!entry) return
      const id = tabId ?? entry.tabs.getActiveTabId()
      if (id) entry.tabs.closeTab(id)
    })

    ipcMain.handle(IPC.SWITCH_TAB, (event, tabId: string) => {
      this.getEntryFromEvent(event)?.tabs.switchTab(tabId)
    })

    ipcMain.handle(IPC.NEW_WINDOW, async () => {
      await this.createWindow()
    })

    ipcMain.handle(IPC.SHOW_CHROME, (event, panel: ChromePanel) => {
      const entry = this.getEntryFromEvent(event)
      entry?.tabs.showChrome(panel)
      if (entry) this.broadcastState(entry.window.id)
    })

    ipcMain.handle(IPC.HIDE_CHROME, (event) => {
      const entry = this.getEntryFromEvent(event)
      entry?.tabs.hideChrome()
      if (entry) this.broadcastState(entry.window.id)
    })

    ipcMain.handle(IPC.TOGGLE_DEVTOOLS, (event) => {
      this.getEntryFromEvent(event)?.tabs.toggleDevTools()
    })

    ipcMain.handle(IPC.GET_BOOKMARKS, () => getBookmarks())
    ipcMain.handle(IPC.ADD_BOOKMARK, (event, url?: string, title?: string) => {
      const entry = this.getEntryFromEvent(event)
      const active = entry?.tabs.getActiveTab()
      const wc = active?.view.webContents
      const bookmarkUrl = url ?? wc?.getURL() ?? ''
      const bookmarkTitle = title ?? wc?.getTitle() ?? bookmarkUrl
      if (bookmarkUrl && !bookmarkUrl.startsWith('browsy://')) {
        addBookmark({ id: generateId(), title: bookmarkTitle, url: bookmarkUrl, createdAt: Date.now() })
      }
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
