import {
  BrowserView,
  dialog,
  type BrowserWindow,
  type DownloadItem,
  type Event,
  type HandlerDetails
} from 'electron'
import { generateId } from '../../shared/utils'
import type { ChromePanel, TabState } from '../../shared/types'
import { addHistoryEntry } from '../services/store'

export interface Tab {
  id: string
  view: BrowserView
  devToolsOpen: boolean
}

export type TabUpdateCallback = () => void
export type PopupCallback = (id: string, url: string) => void
export type ShortcutCallback = (action: string) => void

export class TabManager {
  private tabs: Tab[] = []
  private activeTabId: string | null = null
  private chromeVisible = false
  private chromePanel: ChromePanel = null
  private chromeFocusToken = 0
  private pendingPopups = new Map<string, (allow: boolean) => void>()

  constructor(
    private window: BrowserWindow,
    private onUpdate: TabUpdateCallback,
    private onPopup: PopupCallback,
    private onShortcut: ShortcutCallback
  ) {
    this.setupWindowResize()
  }

  getTabs(): Tab[] {
    return this.tabs
  }

  getActiveTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeTabId) ?? null
  }

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  isChromeVisible(): boolean {
    return this.chromeVisible
  }

  getChromePanel(): ChromePanel {
    return this.chromePanel
  }

  getChromeFocusToken(): number {
    return this.chromeFocusToken
  }

  showChrome(panel: ChromePanel): void {
    this.chromeVisible = true
    this.chromePanel = panel
    if (panel === 'navigation') {
      this.chromeFocusToken += 1
    }
    this.layoutViews()
    this.onUpdate()
  }

  hideChrome(): void {
    this.chromeVisible = false
    this.chromePanel = null
    this.layoutViews()
    this.onUpdate()
    const active = this.getActiveTab()
    if (active) {
      active.view.webContents.focus()
    }
  }

  async createTab(url = 'browsy://home', activate = true): Promise<Tab> {
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    const tab: Tab = {
      id: generateId(),
      view,
      devToolsOpen: false
    }

    this.tabs.push(tab)
    this.window.addBrowserView(view)
    this.layoutViews()

    this.attachWebContentsHandlers(tab)

    if (activate) {
      this.switchTab(tab.id)
    }

    if (activate && url === 'browsy://home') {
      this.showChrome('navigation')
    }

    await tab.view.webContents.loadURL(url)
    return tab
  }

  switchTab(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return

    this.activeTabId = tabId
    for (const t of this.tabs) {
      if (t.id === tabId) {
        this.window.setTopBrowserView(t.view)
        t.view.setAutoResize({ width: true, height: true })
      }
    }
    this.layoutViews()
    this.syncChromeWithActiveTab()
    this.onUpdate()
  }

  closeTab(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return

    const [tab] = this.tabs.splice(index, 1)
    if (tab.devToolsOpen) {
      tab.view.webContents.closeDevTools()
    }
    this.window.removeBrowserView(tab.view)
    ;(tab.view.webContents as unknown as { destroy?: () => void }).destroy?.()

    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)]
      this.activeTabId = next?.id ?? null
      if (next) this.switchTab(next.id)
    }

    if (this.tabs.length === 0) {
      void this.createTab()
    } else {
      this.onUpdate()
    }
  }

  navigate(input: string): Promise<void> {
    const active = this.getActiveTab()
    if (!active) return Promise.resolve()
    return active.view.webContents.loadURL(input)
  }

  goBack(): void {
    const active = this.getActiveTab()
    const wc = active?.view.webContents
    if (wc?.canGoBack()) wc.goBack()
  }

  goForward(): void {
    const active = this.getActiveTab()
    const wc = active?.view.webContents
    if (wc?.canGoForward()) wc.goForward()
  }

  reload(): void {
    this.getActiveTab()?.view.webContents.reload()
  }

  stop(): void {
    this.getActiveTab()?.view.webContents.stop()
  }

  toggleDevTools(): void {
    const active = this.getActiveTab()
    if (!active) return

    if (active.devToolsOpen) {
      active.view.webContents.closeDevTools()
      active.devToolsOpen = false
    } else {
      active.view.webContents.openDevTools({ mode: 'right' })
      active.devToolsOpen = true
    }
    this.layoutViews()
  }

  getTabStates(): TabState[] {
    return this.tabs.map((tab) => this.toTabState(tab))
  }

  getSessionTabs(): { url: string; active: boolean }[] {
    return this.tabs.map((tab) => ({
      url: tab.view.webContents.getURL() || 'browsy://home',
      active: tab.id === this.activeTabId
    }))
  }

  respondToPopup(id: string, allow: boolean): void {
    const resolver = this.pendingPopups.get(id)
    if (resolver) {
      resolver(allow)
      this.pendingPopups.delete(id)
    }
  }

  layoutViews(): void {
    const bounds = this.window.getContentBounds()
    const dragHeight = process.platform === 'linux' ? 28 : 0
    const top = this.chromeVisible ? this.getChromeHeight() : dragHeight

    for (const tab of this.tabs) {
      tab.view.setBounds({
        x: 0,
        y: top,
        width: bounds.width,
        height: Math.max(0, bounds.height - top)
      })
    }
  }

  private getChromeHeight(): number {
    switch (this.chromePanel) {
      case 'navigation':
        return 212
      case 'bookmarks':
        return 220
      case 'settings':
        return 200
      default:
        return 100
    }
  }

  private syncChromeWithActiveTab(): void {
    const active = this.getActiveTab()
    if (!active) return

    const isHome = active.view.webContents.getURL().startsWith('browsy://home')
    if (isHome && (!this.chromeVisible || this.chromePanel !== 'navigation')) {
      this.showChrome('navigation')
    } else if (!isHome && this.chromePanel === 'navigation' && this.chromeVisible) {
      this.hideChrome()
    }
  }

  destroy(): void {
    for (const tab of this.tabs) {
      if (tab.devToolsOpen) tab.view.webContents.closeDevTools()
      this.window.removeBrowserView(tab.view)
    }
    this.tabs = []
    this.activeTabId = null
  }

  private setupWindowResize(): void {
    this.window.on('resize', () => this.layoutViews())
  }

  private toTabState(tab: Tab): TabState {
    const wc = tab.view.webContents
    return {
      id: tab.id,
      title: wc.getTitle() || 'New Tab',
      url: wc.getURL() || 'browsy://home',
      isLoading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward()
    }
  }

  private attachWebContentsHandlers(tab: Tab): void {
    const wc = tab.view.webContents

    wc.setWindowOpenHandler((details: HandlerDetails) => {
      const id = generateId()
      this.onPopup(id, details.url)
      this.pendingPopups.set(id, (allow) => {
        if (allow) {
          void this.createTab(details.url, true)
        }
      })
      return { action: 'deny' }
    })

    wc.on('did-start-loading', () => this.onUpdate())
    wc.on('did-stop-loading', () => this.onUpdate())
    wc.on('page-title-updated', () => this.onUpdate())
    wc.on('did-navigate', () => {
      if (tab.id === this.activeTabId) {
        this.syncChromeWithActiveTab()
      }
      this.onUpdate()
    })
    wc.on('did-navigate-in-page', () => this.onUpdate())

    wc.on('did-finish-load', () => {
      const url = wc.getURL()
      const title = wc.getTitle()
      if (url && !url.startsWith('browsy://error')) {
        addHistoryEntry(url, title)
      }
      if (tab.id === this.activeTabId) {
        this.syncChromeWithActiveTab()
      }
      this.onUpdate()
    })

    wc.on(
      'did-fail-load',
      (_event: Event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
        if (!isMainFrame || errorCode === -3) return // aborted
        const errorUrl = `browsy://error?url=${encodeURIComponent(validatedURL)}&code=${errorCode}&desc=${encodeURIComponent(errorDescription)}`
        void wc.loadURL(errorUrl)
      }
    )

    wc.session.on('will-download', (_event: Event, item: DownloadItem) => {
      const filename = item.getFilename()
      const savePath = dialog.showSaveDialogSync(this.window, {
        defaultPath: filename
      })
      if (savePath) {
        item.setSavePath(savePath)
      } else {
        item.cancel()
      }
    })

    wc.on('before-input-event', (_event, input) => {
      if (input.key === 'Escape') {
        this.onShortcut('hide-chrome')
        return
      }

      if (input.key === 'F12') {
        this.onShortcut('toggle-devtools')
        return
      }

      const mod = input.control || input.meta
      if (!mod) return

      const key = input.key.toLowerCase()
      if (key === 'l') this.onShortcut('navigation')
      else if (key === 't' && !input.shift) this.onShortcut('new-tab')
      else if (key === 'w') this.onShortcut('close-tab')
      else if (key === 'r') this.onShortcut('reload')
      else if (key === '[') this.onShortcut('back')
      else if (key === ']') this.onShortcut('forward')
      else if (key === 'b') this.onShortcut('bookmarks')
      else if (key === ',') this.onShortcut('settings')
      else if (key === 'i' && input.shift) this.onShortcut('toggle-devtools')
      else if (key === 'n') this.onShortcut('new-window')
    })
  }
}
