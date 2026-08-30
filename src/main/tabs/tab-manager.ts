import {
  WebContentsView,
  dialog,
  type BrowserWindow,
  type DownloadItem,
  type Event,
  type HandlerDetails
} from 'electron'
import { generateId } from '../../shared/utils'
import type { ChromePanel, TabState } from '../../shared/types'
import { APP_SURFACE_DARK } from '../../shared/types'
import { addHistoryEntry } from '../services/store'

export interface Tab {
  id: string
  view: WebContentsView
  devToolsOpen: boolean
}

export type TabUpdateCallback = () => void
export type PopupCallback = (id: string, url: string) => void
export type ShortcutCallback = (action: string) => void
export type LayoutCallback = () => void

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
    private onShortcut: ShortcutCallback,
    private onLayout: LayoutCallback
  ) {
    this.window.on('resize', () => this.onLayout())
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
    this.onLayout()
    this.onUpdate()
  }

  hideChrome(): void {
    this.chromeVisible = false
    this.chromePanel = null
    this.onLayout()
    this.onUpdate()
    const active = this.getActiveTab()
    if (active && !active.view.webContents.isDestroyed()) {
      active.view.webContents.focus()
    }
  }

  async createTab(url = 'browsy://home', activate = true): Promise<Tab> {
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })
    view.setBackgroundColor(APP_SURFACE_DARK)

    const tab: Tab = {
      id: generateId(),
      view,
      devToolsOpen: false
    }

    this.tabs.push(tab)
    this.attachWebContentsHandlers(tab)

    if (activate) {
      this.switchTab(tab.id)
    } else {
      this.onLayout()
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
    this.onLayout()
    this.syncChromeWithActiveTab()
    this.onUpdate()
  }

  closeTab(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return

    const [tab] = this.tabs.splice(index, 1)
    this.detachTabView(tab)

    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)]
      this.activeTabId = next?.id ?? null
      if (next) {
        this.switchTab(next.id)
      } else {
        this.onLayout()
      }
    } else {
      this.onLayout()
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
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack()
    }
  }

  goForward(): void {
    const active = this.getActiveTab()
    const wc = active?.view.webContents
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward()
    }
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
    this.onLayout()
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

  /** Full-bleed page layer — chrome overlays on top via WindowManager. */
  layoutTabViews(): void {
    if (this.window.isDestroyed()) return
    const bounds = this.window.getContentBounds()
    const contentView = this.window.contentView

    for (const tab of this.tabs) {
      const isActive = tab.id === this.activeTabId
      if (isActive) {
        if (!contentView.children.includes(tab.view)) {
          contentView.addChildView(tab.view)
        }
        tab.view.setBounds({
          x: 0,
          y: 0,
          width: bounds.width,
          height: bounds.height
        })
      } else if (contentView.children.includes(tab.view)) {
        contentView.removeChildView(tab.view)
      }
    }
  }

  destroy(): void {
    for (const tab of this.tabs) {
      this.detachTabView(tab)
    }
    this.tabs = []
    this.activeTabId = null
  }

  private detachTabView(tab: Tab): void {
    const wc = tab.view.webContents
    if (!wc.isDestroyed() && tab.devToolsOpen) {
      wc.closeDevTools()
    }
    if (!this.window.isDestroyed()) {
      const { children } = this.window.contentView
      if (children.includes(tab.view)) {
        this.window.contentView.removeChildView(tab.view)
      }
    }
    if (!wc.isDestroyed()) {
      wc.close()
    }
  }

  private syncChromeWithActiveTab(): void {
    const active = this.getActiveTab()
    if (!active || active.view.webContents.isDestroyed()) return

    const isHome = active.view.webContents.getURL().startsWith('browsy://home')
    if (isHome && (!this.chromeVisible || this.chromePanel !== 'navigation')) {
      this.showChrome('navigation')
    } else if (!isHome && this.chromePanel === 'navigation' && this.chromeVisible) {
      this.hideChrome()
    }
  }

  private toTabState(tab: Tab): TabState {
    const wc = tab.view.webContents
    return {
      id: tab.id,
      title: wc.isDestroyed() ? 'New Tab' : wc.getTitle() || 'New Tab',
      url: wc.isDestroyed() ? 'browsy://home' : wc.getURL() || 'browsy://home',
      isLoading: !wc.isDestroyed() && wc.isLoading(),
      canGoBack: !wc.isDestroyed() && wc.navigationHistory.canGoBack(),
      canGoForward: !wc.isDestroyed() && wc.navigationHistory.canGoForward()
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
      if (wc.isDestroyed()) return
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
        if (!isMainFrame || errorCode === -3) return
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

    wc.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault()
        this.onShortcut('hide-chrome')
        return
      }

      if (input.key === 'F12') {
        event.preventDefault()
        this.onShortcut('toggle-devtools')
        return
      }

      const mod = input.control || input.meta
      if (!mod) return

      const key = input.key.toLowerCase()
      let action: string | null = null
      if (key === 'l') action = 'navigation'
      else if (key === 't' && !input.shift) action = 'new-tab'
      else if (key === 'w') action = 'close-tab'
      else if (key === 'r') action = 'reload'
      else if (key === '[') action = 'back'
      else if (key === ']') action = 'forward'
      else if (key === 'b') action = 'bookmarks'
      else if (key === ',') action = 'settings'
      else if (key === 'i' && input.shift) action = 'toggle-devtools'
      else if (key === 'n') action = 'new-window'

      if (action) {
        event.preventDefault()
        this.onShortcut(action)
      }
    })
  }
}
