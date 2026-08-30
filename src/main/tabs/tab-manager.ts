import {
  WebContentsView,
  dialog,
  type BrowserWindow,
  type DownloadItem,
  type Event,
  type HandlerDetails
} from 'electron'
import { generateId, isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import type { ChromePanel, TabState } from '../../shared/types'
import { APP_SURFACE_DARK } from '../../shared/types'
import { addHistoryEntry } from '../services/store'

export interface Tab {
  id: string
  view: WebContentsView
  favicon: string | null
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
    const safeUrl = sanitizeNavigationUrl(url) ?? 'browsy://home'

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false
      }
    })
    view.setBackgroundColor(APP_SURFACE_DARK)

    const tab: Tab = {
      id: generateId(),
      view,
      favicon: null,
      devToolsOpen: false
    }

    this.tabs.push(tab)
    this.attachWebContentsHandlers(tab)

    if (activate) {
      this.switchTab(tab.id)
    } else {
      this.onLayout()
    }

    if (activate && safeUrl === 'browsy://home') {
      this.showChrome('navigation')
    }

    await tab.view.webContents.loadURL(safeUrl)
    return tab
  }

  switchTab(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return

    this.activeTabId = tabId
    this.onLayout()
    // Keep the user's current chrome state when moving between tabs.
    if (this.chromeVisible) this.chromeFocusToken += 1
    this.onUpdate()
  }

  nextTab(): void {
    if (this.tabs.length < 2 || !this.activeTabId) return
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId)
    if (index === -1) return
    const next = this.tabs[(index + 1) % this.tabs.length]
    this.switchTab(next.id)
  }

  prevTab(): void {
    if (this.tabs.length < 2 || !this.activeTabId) return
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId)
    if (index === -1) return
    const prev = this.tabs[(index - 1 + this.tabs.length) % this.tabs.length]
    this.switchTab(prev.id)
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
    const safeUrl = sanitizeNavigationUrl(input)
    if (!safeUrl) return Promise.resolve()
    return active.view.webContents.loadURL(safeUrl)
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
      url: sanitizeNavigationUrl(tab.view.webContents.getURL()) ?? 'browsy://home',
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
      favicon: tab.favicon,
      isLoading: !wc.isDestroyed() && wc.isLoading(),
      canGoBack: !wc.isDestroyed() && wc.navigationHistory.canGoBack(),
      canGoForward: !wc.isDestroyed() && wc.navigationHistory.canGoForward()
    }
  }

  private attachWebContentsHandlers(tab: Tab): void {
    const wc = tab.view.webContents

    // Deny powerful permissions for untrusted web content.
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false)
    })
    wc.session.setPermissionCheckHandler(() => false)

    wc.setWindowOpenHandler((details: HandlerDetails) => {
      const target = sanitizeNavigationUrl(details.url)
      if (!target) {
        return { action: 'deny' }
      }
      // User-clicked target=_blank links, such as the YouTube logo in an
      // embedded player, should behave like normal links instead of popups.
      if (details.disposition === 'foreground-tab') {
        void this.createTab(target, true)
        return { action: 'deny' }
      }
      const id = generateId()
      this.onPopup(id, target)
      this.pendingPopups.set(id, (allow) => {
        if (allow) {
          void this.createTab(target, true)
        }
      })
      return { action: 'deny' }
    })

    wc.on('will-navigate', (event, url) => {
      if (!isAllowedNavigationUrl(url)) event.preventDefault()
    })

    wc.on('will-redirect', (event, url) => {
      if (!isAllowedNavigationUrl(url)) event.preventDefault()
    })

    wc.on('certificate-error', (event, _url, _error, _certificate, callback) => {
      // Never silently trust invalid TLS certificates.
      event.preventDefault()
      callback(false)
    })

    wc.on('did-start-loading', () => this.onUpdate())
    wc.on('did-stop-loading', () => this.onUpdate())
    wc.on('page-title-updated', () => this.onUpdate())
    wc.on('page-favicon-updated', (_event, favicons: string[]) => {
      const next = favicons.find((icon) => icon.startsWith('data:image/') || isAllowedNavigationUrl(icon))
      tab.favicon = next ?? null
      this.onUpdate()
    })
    wc.on('did-navigate', () => {
      tab.favicon = null
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
      if (url && !url.startsWith('browsy://error') && isAllowedNavigationUrl(url)) {
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
        const safeFailed = sanitizeNavigationUrl(validatedURL) ?? ''
        const errorUrl = `browsy://error?url=${encodeURIComponent(safeFailed)}&code=${errorCode}&desc=${encodeURIComponent(errorDescription)}`
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
      if (input.type !== 'keyDown') return

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
      const code = input.code
      let action: string | null = null
      if (key === 'l') action = 'navigation'
      else if (key === 't' && !input.shift) action = 'new-tab'
      else if (key === 'w') action = 'close-tab'
      else if (key === 'r') action = 'reload'
      else if (key === '[') action = 'back'
      else if (key === ']') action = 'forward'
      else if (key === 'b') action = 'bookmarks'
      else if (key === 'd') action = 'bookmark-page'
      else if (key === ',') action = 'settings'
      else if (key === '/' || key === '?' || code === 'Slash') action = 'shortcuts'
      else if (key === 'i' && input.shift) action = 'toggle-devtools'
      else if (key === 'n') action = 'new-window'
      else if (input.meta && key === 'arrowright') action = 'next-tab'
      else if (input.meta && key === 'arrowleft') action = 'prev-tab'

      if (action) {
        event.preventDefault()
        this.onShortcut(action)
      }
    })
  }
}
