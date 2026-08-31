import {
  BrowserWindow,
  WebContentsView,
  dialog,
  type DownloadItem,
  type Event,
  type HandlerDetails
} from 'electron'
import { generateId, isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import { showsNavigationChrome } from '../../shared/internal-pages'
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
export type PopupClosedCallback = (id: string) => void
export type ShortcutCallback = (action: string) => void

interface PendingPopup {
  url: string
  popup: BrowserWindow | null
  ready: boolean
  decision: boolean | null
}
export type LayoutCallback = () => void
export type CarouselOpenCallback = () => boolean

export class TabManager {
  private tabs: Tab[] = []
  private activeTabId: string | null = null
  private chromeVisible = false
  private chromePanel: ChromePanel = null
  private chromeFocusToken = 0
  private pendingPopups = new Map<string, PendingPopup>()
  private destroying = false

  constructor(
    private window: BrowserWindow,
    private onUpdate: TabUpdateCallback,
    private onPopup: PopupCallback,
    private onPopupClosed: PopupClosedCallback,
    private onShortcut: ShortcutCallback,
    private onLayout: LayoutCallback,
    private isCarouselOpen: CarouselOpenCallback
  ) {
    this.window.on('resize', () => this.onLayout())
  }

  getTabs(): Tab[] {
    this.pruneDestroyedTabs()
    return this.tabs
  }

  getActiveTab(): Tab | null {
    this.pruneDestroyedTabs()
    return this.tabs.find((t) => t?.id === this.activeTabId) ?? null
  }

  getActiveTabId(): string | null {
    this.pruneDestroyedTabs()
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
    const activeWc = this.getActiveTab()?.view?.webContents
    if (activeWc && !activeWc.isDestroyed()) {
      activeWc.focus()
    }
  }

  /** Tab still on the default new-tab page (not navigated away). */
  private isNewTabPage(tab: Tab): boolean {
    const wc = tab?.view?.webContents
    if (!wc || wc.isDestroyed()) return false
    const url = wc.getURL()
    return !url || url === 'browsy://home' || url.startsWith('browsy://home')
  }

  findNewTab(): Tab | undefined {
    return this.tabs.find((tab) => this.isNewTabPage(tab))
  }

  /** Focus an existing new-tab page, or create one if none is open. */
  async openNewTab(url = 'browsy://home', forceNew = false): Promise<Tab> {
    const safeUrl = sanitizeNavigationUrl(url) ?? 'browsy://home'
    if (!forceNew && (safeUrl === 'browsy://home' || safeUrl.startsWith('browsy://home'))) {
      const existing = this.findNewTab()
      if (existing) {
        this.switchTab(existing.id)
        this.showChrome('navigation')
        return existing
      }
    }
    return await this.createTab(safeUrl)
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

    if (activate && showsNavigationChrome(safeUrl)) {
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
    else {
      const wc = tab?.view?.webContents
      if (wc && !wc.isDestroyed()) wc.focus()
    }
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
    const wc = active.view?.webContents
    return wc && !wc.isDestroyed() ? wc.loadURL(safeUrl) : Promise.resolve()
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
    this.pruneDestroyedTabs()
    return this.tabs.flatMap((tab) => {
      const state = this.toTabState(tab)
      return state ? [state] : []
    })
  }

  async captureThumbnail(tabId: string): Promise<string | null> {
    const tab = this.tabs.find((candidate) => candidate.id === tabId)
    const wc = tab?.view.webContents
    if (!wc || wc.isDestroyed()) return null

    try {
      const image = await wc.capturePage()
      if (image.isEmpty()) return null
      const resized = image.resize({ width: 320 })
      return `data:image/jpeg;base64,${resized.toJPEG(72).toString('base64')}`
    } catch {
      return null
    }
  }

  hasTab(tabId: string): boolean {
    return this.tabs.some((tab) => tab.id === tabId)
  }

  getSessionTabs(): { url: string; active: boolean }[] {
    this.pruneDestroyedTabs()
    return this.tabs.flatMap((tab) => {
      const wc = tab?.view?.webContents
      if (!wc || wc.isDestroyed()) return []
      return [
        {
          url: sanitizeNavigationUrl(wc.getURL()) ?? 'browsy://home',
          active: tab.id === this.activeTabId
        }
      ]
    })
  }

  respondToPopup(id: string, allow: boolean): void {
    const pending = this.pendingPopups.get(id)
    if (!pending) return

    pending.decision = allow
    if (!allow) {
      this.pendingPopups.delete(id)
      this.onPopupClosed(id)
      if (pending.popup && !pending.popup.isDestroyed()) pending.popup.close()
      return
    }
    this.maybeShowPopup(id, pending)
  }

  private maybeShowPopup(id: string, pending: PendingPopup): void {
    if (!pending.ready || pending.decision !== true || !pending.popup) return
    if (pending.popup.isDestroyed()) {
      this.pendingPopups.delete(id)
      return
    }
    pending.popup.show()
    pending.popup.focus()
  }

  /** Page layer sits below the chrome strip; overlay chrome still paints on top for suggestions. */
  layoutTabViews(topInset = 0): void {
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
          y: topInset,
          width: bounds.width,
          height: Math.max(0, bounds.height - topInset)
        })
      } else if (contentView.children.includes(tab.view)) {
        contentView.removeChildView(tab.view)
      }
    }
  }

  destroy(): void {
    this.destroying = true
    for (const pending of this.pendingPopups.values()) {
      if (pending.popup && !pending.popup.isDestroyed()) pending.popup.close()
    }
    this.pendingPopups.clear()
    for (const tab of this.tabs) {
      this.detachTabView(tab)
    }
    this.tabs = []
    this.activeTabId = null
  }

  private removeDestroyedTab(tab: Tab): void {
    const index = this.tabs.indexOf(tab)
    if (index === -1) return

    this.tabs.splice(index, 1)
    if (this.activeTabId === tab.id) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)]
      this.activeTabId = next?.id ?? null
      if (next) this.switchTab(next.id)
      else if (!this.destroying) void this.createTab()
    }
    if (!this.destroying) this.onUpdate()
  }

  private detachTabView(tab: Tab): void {
    const wc = tab?.view?.webContents
    if (!wc) return
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
    // Spotlight chrome is ephemeral (Cmd+L / new tab). Native pages no longer
    // pin a persistent navigation strip, so URL changes do not force chrome.
  }

  private pruneDestroyedTabs(): void {
    const destroyed = this.tabs.filter((tab) => {
      const wc = tab?.view?.webContents
      return !wc || wc.isDestroyed()
    })
    if (destroyed.length === 0) return

    this.tabs = this.tabs.filter((tab) => !destroyed.includes(tab))
    if (this.activeTabId && !this.tabs.some((tab) => tab.id === this.activeTabId)) {
      this.activeTabId = this.tabs[0]?.id ?? null
    }
  }

  private toTabState(tab: Tab | undefined): TabState | null {
    const wc = tab?.view?.webContents
    if (!tab || !wc || wc.isDestroyed()) return null

    return {
      id: tab.id,
      title: wc.getTitle() || 'New Tab',
      url: wc.getURL() || 'browsy://home',
      favicon: tab.favicon,
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward()
    }
  }

  private attachWebContentsHandlers(tab: Tab): void {
    const wc = tab.view.webContents

    wc.on('destroyed', () => {
      this.removeDestroyedTab(tab)
    })

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
      this.pendingPopups.set(id, { url: target, popup: null, ready: false, decision: null })
      this.onPopup(id, target)

      const bounds = this.window.getBounds()
      const width = Math.min(900, Math.max(480, bounds.width - 120))
      const height = Math.min(760, Math.max(560, bounds.height - 80))
      const popupX = bounds.x + Math.round((bounds.width - width) / 2)
      const popupY = bounds.y + Math.round((bounds.height - height) / 2)
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          width,
          height,
          x: popupX,
          y: popupY,
          title: 'Browsy'
        }
      }
    })

    wc.on('did-create-window', (popup, details) => {
      const pendingId = [...this.pendingPopups.entries()].find(([, pending]) => pending.popup === null && pending.url === details.url)?.[0]
      if (!pendingId) {
        popup.close()
        return
      }

      const pending = this.pendingPopups.get(pendingId)
      if (!pending) {
        popup.close()
        return
      }
      pending.popup = popup
      popup.once('ready-to-show', () => {
        pending.ready = true
        this.maybeShowPopup(pendingId, pending)
      })
      popup.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedNavigationUrl(url)) event.preventDefault()
      })
      popup.on('closed', () => {
        const current = this.pendingPopups.get(pendingId)
        if (current?.popup !== popup) return
        this.pendingPopups.delete(pendingId)
        this.onPopupClosed(pendingId)
        if (this.destroying || this.window.isDestroyed()) return
        setImmediate(() => {
          if (this.destroying || this.window.isDestroyed()) return
          this.window.show()
          this.window.moveTop()
          this.onLayout()
          const activeWc = this.getActiveTab()?.view?.webContents
          if (activeWc && !activeWc.isDestroyed()) {
            activeWc.focus()
          }
          this.window.focus()
          this.onUpdate()
        })
      })
      if (pending.decision === false) {
        popup.close()
      } else if (pending.decision === true) {
        popup.show()
        popup.focus()
      }
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

      if (this.isCarouselOpen() && input.key === 'Escape') {
        event.preventDefault()
        this.onShortcut('dismiss-carousel')
        return
      }

      if (this.isCarouselOpen() && input.key === 'Enter') {
        event.preventDefault()
        this.onShortcut('commit-carousel')
        return
      }

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
      else if (input.meta && (key === 'arrowright' || code === 'ArrowRight')) action = 'next-tab'
      else if (input.meta && (key === 'arrowleft' || code === 'ArrowLeft')) action = 'prev-tab'

      if (action) {
        event.preventDefault()
        this.onShortcut(action)
      }
    })
  }
}
