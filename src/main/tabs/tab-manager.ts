import {
  BrowserWindow,
  WebContentsView,
  app,
  dialog,
  nativeTheme,
  type ContextMenuParams,
  type Event,
  type HandlerDetails,
  type MediaAccessPermissionRequest,
  type NativeImage,
  type PermissionCheckHandlerHandlerDetails,
  type WebContents
} from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { generateId, isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import { buildAiChatUrl, buildExplainPrompt } from '../../shared/ai-assistant'
import { canonicalPreviewUrl } from '../../shared/link-preview'
import { encodePreviewImage } from '../services/link-preview'
import { popupPageContextMenu } from '../services/page-context-menu'
import { addHistoryEntry, getSettings } from '../services/store'
import { showsNavigationChrome } from '../../shared/internal-pages'
import type { ChromePanel, MediaKind, TabState } from '../../shared/types'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_LIGHT,
  MAX_WARM_BACKGROUND_TABS,
  TAB_HIBERNATE_IDLE_MS,
  TAB_HIBERNATE_POLL_MS
} from '../../shared/types'
import {
  ensureOsMediaAccess,
  getStoredDecisions,
  mediaKindFromCheckType,
  mediaKindsFromTypes,
  normalizeOrigin,
  rememberMediaDecision
} from '../services/media-permissions'

function tabViewBackground(): string {
  const theme = getSettings().theme
  if (theme === 'light') return APP_SURFACE_LIGHT
  if (theme === 'dark') return APP_SURFACE_DARK
  return nativeTheme.shouldUseDarkColors ? APP_SURFACE_DARK : APP_SURFACE_LIGHT
}

export interface Tab {
  id: string
  /** Null while hibernated — metadata below is the source of truth. */
  view: WebContentsView | null
  url: string
  title: string
  favicon: string | null
  devToolsOpen: boolean
  thumbnail: string | null
  /** Restored / woken tabs stay muted until this WebContents receives a user gesture. */
  audioLockedUntilGesture: boolean
  hibernated: boolean
  lastActiveAt: number
  canGoBack: boolean
  canGoForward: boolean
}

export type TabUpdateCallback = () => void
export type PopupCallback = (id: string, url: string) => void
export type PopupClosedCallback = (id: string) => void
export type MediaPermissionCallback = (id: string, origin: string, kinds: MediaKind[]) => void
export type ShortcutCallback = (action: string) => void

interface PendingPopup {
  url: string
  popup: BrowserWindow | null
  ready: boolean
  decision: boolean | null
}

interface PendingMediaPermission {
  origin: string
  kinds: MediaKind[]
  callback: (granted: boolean) => void
}

export type LayoutCallback = () => void
export type CarouselOpenCallback = () => boolean
export type OpenInNewWindowCallback = (url: string) => void

export class TabManager {
  private tabs: Tab[] = []
  private activeTabId: string | null = null
  private chromeVisible = false
  private chromePanel: ChromePanel = null
  private chromeFocusToken = 0
  private pendingPopups = new Map<string, PendingPopup>()
  private pendingMediaPermissions = new Map<string, PendingMediaPermission>()
  private destroying = false
  /** Tab currently being snapshotted so layout does not hide it mid-capture. */
  private thumbnailCaptureTabId: string | null = null
  /** Keep the outgoing tab painted on top until the incoming tab has a frame. */
  private coverTabId: string | null = null
  /** True while the carousel overlay is waiting for the destination tab to paint. */
  private carouselCommitting = false
  private wakePromises = new Map<string, Promise<void>>()
  private hibernateTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private window: BrowserWindow,
    private onUpdate: TabUpdateCallback,
    private onPopup: PopupCallback,
    private onPopupClosed: PopupClosedCallback,
    private onMediaPermission: MediaPermissionCallback,
    private onMediaPermissionClosed: PopupClosedCallback,
    private onShortcut: ShortcutCallback,
    private onLayout: LayoutCallback,
    private isCarouselOpen: CarouselOpenCallback,
    private onOpenInNewWindow: OpenInNewWindowCallback
  ) {
    this.hibernateTimer = setInterval(() => this.hibernateExcessTabs(), TAB_HIBERNATE_POLL_MS)
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

  setCarouselCommitting(value: boolean): void {
    this.carouselCommitting = value
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

  private getTabUrl(tab: Tab): string {
    const wc = tab.view?.webContents
    if (wc && !wc.isDestroyed()) {
      try {
        return wc.getURL() || tab.url
      } catch {
        return tab.url
      }
    }
    return tab.url
  }

  /** Tab still on the default new-tab page (not navigated away). */
  private isNewTabPage(tab: Tab): boolean {
    const url = this.getTabUrl(tab)
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
        await this.switchTab(existing.id)
        this.showChrome('navigation')
        return existing
      }
    }
    return await this.createTab(safeUrl)
  }

  private createWebContentsView(): WebContentsView {
    const preloadPath = join(__dirname, '../preload/tab.js')
    if (!existsSync(preloadPath)) {
      console.error('[Browsy] Tab preload missing', preloadPath)
    }

    const view = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        // Throttle background tabs; temporarily disable only while capturing.
        backgroundThrottling: true,
        autoplayPolicy: 'user-gesture-required'
      }
    })
    view.setBackgroundColor(tabViewBackground())
    return view
  }

  async createTab(
    url = 'browsy://home',
    activate = true,
    showNavigationChrome = true,
    lockAudioUntilGesture = false
  ): Promise<Tab> {
    const safeUrl = sanitizeNavigationUrl(url) ?? 'browsy://home'
    const view = this.createWebContentsView()

    const tab: Tab = {
      id: generateId(),
      view,
      url: safeUrl,
      title: 'New Tab',
      favicon: null,
      devToolsOpen: false,
      thumbnail: null,
      audioLockedUntilGesture: false,
      hibernated: false,
      lastActiveAt: Date.now(),
      canGoBack: false,
      canGoForward: false
    }

    this.tabs.push(tab)
    this.attachWebContentsHandlers(tab)
    if (lockAudioUntilGesture) {
      this.lockAudioUntilGesture(tab)
    }

    if (activate) {
      await this.switchTab(tab.id)
    } else {
      this.onLayout()
    }

    if (activate && showNavigationChrome && showsNavigationChrome(safeUrl)) {
      this.showChrome('navigation')
    }

    await view.webContents.loadURL(safeUrl)
    this.syncTabMetadata(tab)
    if (!activate) this.hibernateExcessTabs()
    return tab
  }

  /**
   * Session-restore helper: store URL/title without allocating a WebContents.
   * The tab wakes on first activation.
   */
  createHibernatedTab(url: string, title = 'New Tab'): Tab {
    const safeUrl = sanitizeNavigationUrl(url) ?? 'browsy://home'
    const tab: Tab = {
      id: generateId(),
      view: null,
      url: safeUrl,
      title: title || 'New Tab',
      favicon: null,
      devToolsOpen: false,
      thumbnail: null,
      audioLockedUntilGesture: true,
      hibernated: true,
      lastActiveAt: 0,
      canGoBack: false,
      canGoForward: false
    }
    this.tabs.push(tab)
    return tab
  }

  async switchTab(tabId: string): Promise<void> {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return

    const previous = this.getActiveTab()
    if (previous && previous.id !== tabId) {
      previous.lastActiveAt = Date.now()
      this.cacheActiveThumbnail(previous)
    }

    const previousId = this.activeTabId
    this.activeTabId = tabId
    tab.lastActiveAt = Date.now()
    // Carousel overlay already covers the swap; keep the previous page on top
    // only for un-covered switches so we never flash a blank WebContentsView.
    if (previousId && previousId !== tabId && !this.isCarouselOpen()) this.coverTabId = previousId

    try {
      await this.ensureAwake(tab)
      if (this.activeTabId !== tabId || this.destroying) return

      this.onLayout()
      const wc = tab.view?.webContents
      // New tabs call switchTab before loadURL. Waiting for rAF on an empty
      // WebContents never resolves and leaves the window black.
      if (previousId && previousId !== tabId && wc && !wc.isDestroyed() && this.isCarouselOpen()) {
        const url = (() => {
          try {
            return wc.getURL()
          } catch {
            return ''
          }
        })()
        if (url && url !== 'about:blank') {
          await this.waitForCompositorFrame(wc, 180)
        }
      }
    } finally {
      if (this.coverTabId === previousId) this.coverTabId = null
    }

    if (this.activeTabId !== tabId || this.destroying) return

    const wc = tab.view?.webContents
    this.onLayout()
    // Keep the user's current chrome state when moving between tabs.
    if (this.chromeVisible) this.chromeFocusToken += 1
    else if (wc && !wc.isDestroyed()) {
      wc.focus()
    }
    this.onUpdate()
    this.hibernateExcessTabs(false)
  }

  async nextTab(): Promise<void> {
    if (this.tabs.length < 2 || !this.activeTabId) return
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId)
    if (index === -1) return
    const next = this.tabs[(index + 1) % this.tabs.length]
    await this.switchTab(next.id)
  }

  async prevTab(): Promise<void> {
    if (this.tabs.length < 2 || !this.activeTabId) return
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId)
    if (index === -1) return
    const prev = this.tabs[(index - 1 + this.tabs.length) % this.tabs.length]
    await this.switchTab(prev.id)
  }

  closeTab(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return

    const [tab] = this.tabs.splice(index, 1)
    this.wakePromises.delete(tabId)
    this.detachTabView(tab)

    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)]
      this.activeTabId = next?.id ?? null
      if (next) {
        void this.switchTab(next.id)
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

    if (active.hibernated || !active.view) {
      active.url = safeUrl
      active.title = 'New Tab'
      active.favicon = null
      active.thumbnail = null
      active.canGoBack = false
      active.canGoForward = false
      return this.ensureAwake(active).then(() => {
        this.syncTabMetadata(active)
        this.onUpdate()
      })
    }

    const wc = active.view.webContents
    return wc && !wc.isDestroyed()
      ? wc.loadURL(safeUrl).then(() => {
          this.syncTabMetadata(active)
        })
      : Promise.resolve()
  }

  goBack(): void {
    const active = this.getActiveTab()
    const wc = active?.view?.webContents
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack()
    }
  }

  goForward(): void {
    const active = this.getActiveTab()
    const wc = active?.view?.webContents
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward()
    }
  }

  reload(): void {
    const active = this.getActiveTab()
    if (!active) return
    if (active.hibernated || !active.view) {
      void this.ensureAwake(active)
      return
    }
    const wc = active.view.webContents
    if (!wc.isDestroyed()) wc.reload()
  }

  reloadTabsMatching(predicate: (url: string) => boolean): void {
    for (const tab of this.getTabs()) {
      if (tab.hibernated || !tab.view) {
        // Hibernated tabs reload fresh content when woken; skip live reload.
        continue
      }
      const wc = tab.view.webContents
      if (!wc || wc.isDestroyed()) continue
      try {
        if (predicate(wc.getURL())) wc.reload()
      } catch {
        // Ignore tabs whose URL cannot be read.
      }
    }
  }

  stop(): void {
    const wc = this.getActiveTab()?.view?.webContents
    if (wc && !wc.isDestroyed()) wc.stop()
  }

  toggleDevTools(): void {
    const active = this.getActiveTab()
    if (!active?.view) return

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
    if (!tab) return null
    if (tab.thumbnail) return tab.thumbnail
    // Never wake a hibernated tab just for a carousel thumbnail.
    if (tab.hibernated || !tab.view) return null

    const captured = await this.snapshotTab(tab)
    if (captured) {
      tab.thumbnail = captured
      return captured
    }
    return null
  }

  hasTab(tabId: string): boolean {
    return this.tabs.some((tab) => tab.id === tabId)
  }

  findTabPreview(url: string): {
    title: string
    favicon: string | null
    thumbnail: string | null
    isActive: boolean
  } | null {
    this.pruneDestroyedTabs()
    const key = canonicalPreviewUrl(url)
    const tab = this.tabs.find((item) => canonicalPreviewUrl(this.getTabUrl(item)) === key)
    if (!tab) return null
    return {
      title: tab.title || '',
      favicon: tab.favicon,
      thumbnail: tab.thumbnail,
      isActive: tab.id === this.activeTabId
    }
  }

  async captureActivePreview(): Promise<string | null> {
    const tab = this.getActiveTab()
    const wc = tab?.view?.webContents
    if (!tab || !wc || wc.isDestroyed()) return null
    try {
      const image = await wc.capturePage(undefined, { stayHidden: false, stayAwake: true })
      return encodePreviewImage(image)
    } catch {
      return null
    }
  }

  private showPageContextMenu(tab: Tab, params: ContextMenuParams): void {
    const wc = tab.view?.webContents
    if (this.window.isDestroyed() || !wc || wc.isDestroyed()) return
    const pageUrl = sanitizeNavigationUrl(wc.getURL()) ?? wc.getURL() ?? ''
    const viewBounds = tab.view!.getBounds()
    popupPageContextMenu(this.window, wc, params, pageUrl, { x: viewBounds.x, y: viewBounds.y }, {
      openInNewTab: (url) => {
        void this.createTab(url, true, false)
      },
      openInNewWindow: (url) => this.onOpenInNewWindow(url),
      screenshotPage: () => {
        void this.screenshotTab(tab)
      },
      askAi: (selection, sourceUrl) => this.askAiAboutSelection(selection, sourceUrl)
    })
  }

  private askAiAboutSelection(selection: string, sourceUrl: string): void {
    const assistant = getSettings().aiAssistant ?? 'chatgpt'
    const prompt = buildExplainPrompt(selection, sourceUrl)
    const chatUrl = sanitizeNavigationUrl(buildAiChatUrl(assistant, prompt))
    if (!chatUrl) return
    void this.createTab(chatUrl, true, false)
  }

  private screenshotDefaultPath(): string {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const name = `browsy-${stamp}.png`
    try {
      return join(app.getPath('pictures'), name)
    } catch {
      return name
    }
  }

  private async screenshotTab(tab: Tab): Promise<void> {
    const wc = tab.view?.webContents
    if (this.window.isDestroyed() || !wc || wc.isDestroyed()) return

    let image: NativeImage
    try {
      image = await wc.capturePage(undefined, { stayHidden: false, stayAwake: true })
    } catch {
      return
    }
    if (image.isEmpty()) return

    const savePath = dialog.showSaveDialogSync(this.window, {
      title: 'Save screenshot',
      defaultPath: this.screenshotDefaultPath(),
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (!savePath) return

    try {
      await writeFile(savePath, image.toPNG())
    } catch (error) {
      console.error('[Browsy] Failed to save screenshot', error)
    }
  }

  getSessionTabs(): { url: string; active: boolean }[] {
    this.pruneDestroyedTabs()
    return this.tabs.map((tab) => ({
      url: sanitizeNavigationUrl(this.getTabUrl(tab)) ?? 'browsy://home',
      active: tab.id === this.activeTabId
    }))
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

  ownsWebContents(wc: WebContents): boolean {
    return this.tabs.some((tab) => {
      const tabWc = tab?.view?.webContents
      return Boolean(tabWc && !tabWc.isDestroyed() && tabWc.id === wc.id)
    })
  }

  /** Mute restored media until this tab's WebContents receives a user gesture. */
  lockAudioUntilGesture(tab: Tab): void {
    tab.audioLockedUntilGesture = true
    const wc = tab.view?.webContents
    if (wc && !wc.isDestroyed()) wc.setAudioMuted(true)
  }

  private unlockAudioFromGesture(tab: Tab): void {
    if (!tab.audioLockedUntilGesture) return
    tab.audioLockedUntilGesture = false
    const wc = tab.view?.webContents
    if (wc && !wc.isDestroyed()) wc.setAudioMuted(false)
  }

  checkMediaPermission(
    requestingOrigin: string,
    details: PermissionCheckHandlerHandlerDetails
  ): boolean {
    const origin =
      normalizeOrigin(details.securityOrigin) ??
      normalizeOrigin(requestingOrigin) ??
      normalizeOrigin(details.requestingUrl)
    if (!origin) return false

    const kinds = mediaKindFromCheckType(details.mediaType)
    const { anyDenied } = getStoredDecisions(origin, kinds)
    // Allow the check unless the origin was explicitly blocked so getUserMedia
    // can still reach the request handler and show a prompt when undecided.
    return !anyDenied
  }

  handleMediaPermissionRequest(
    wc: WebContents,
    details: MediaAccessPermissionRequest,
    callback: (granted: boolean) => void
  ): void {
    const origin =
      normalizeOrigin(details.securityOrigin) ??
      normalizeOrigin(details.requestingUrl) ??
      normalizeOrigin(wc.isDestroyed() ? '' : wc.getURL())
    if (!origin) {
      callback(false)
      return
    }

    const kinds = mediaKindsFromTypes(details.mediaTypes)
    const { allAllowed, anyDenied, needsPrompt } = getStoredDecisions(origin, kinds)

    if (anyDenied) {
      callback(false)
      return
    }

    if (allAllowed && !needsPrompt) {
      void ensureOsMediaAccess(kinds).then((ok) => callback(ok))
      return
    }

    const id = generateId()
    this.pendingMediaPermissions.set(id, { origin, kinds, callback })
    this.onMediaPermission(id, origin, kinds)
  }

  respondToMediaPermission(id: string, allow: boolean): void {
    const pending = this.pendingMediaPermissions.get(id)
    if (!pending) return
    this.pendingMediaPermissions.delete(id)
    this.onMediaPermissionClosed(id)

    if (!allow) {
      rememberMediaDecision(pending.origin, pending.kinds, 'deny')
      pending.callback(false)
      return
    }

    rememberMediaDecision(pending.origin, pending.kinds, 'allow')
    void ensureOsMediaAccess(pending.kinds).then((ok) => {
      if (!ok) {
        // OS denied device access — keep the site allow so we do not re-prompt
        // endlessly, but fail this request.
        pending.callback(false)
        return
      }
      pending.callback(true)
    })
  }

  /** Reject in-flight media prompts when the window/tab manager is torn down. */
  private rejectPendingMediaPermissions(): void {
    for (const [id, pending] of this.pendingMediaPermissions) {
      pending.callback(false)
      this.pendingMediaPermissions.delete(id)
      this.onMediaPermissionClosed(id)
    }
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
    const viewBounds = {
      x: 0,
      y: topInset,
      width: bounds.width,
      height: Math.max(0, bounds.height - topInset)
    }
    const activeTab = this.tabs.find((tab) => tab.id === this.activeTabId)

    // Only attach live views. Hibernated tabs have no WebContentsView.
    for (const tab of this.tabs) {
      if (!tab.view) continue
      if (!contentView.children.includes(tab.view)) {
        contentView.addChildView(tab.view)
      }
      tab.view.setBounds(viewBounds)
      tab.view.setVisible(
        tab.id === this.activeTabId ||
          tab.id === this.thumbnailCaptureTabId ||
          tab.id === this.coverTabId
      )
    }

    if (this.thumbnailCaptureTabId && !this.carouselCommitting) {
      const capturing = this.tabs.find((item) => item.id === this.thumbnailCaptureTabId)
      if (capturing?.view) this.raiseTabUnderChrome(capturing)
    } else if (this.coverTabId) {
      const cover = this.tabs.find((item) => item.id === this.coverTabId)
      if (cover?.view) this.raiseTabUnderChrome(cover)
    } else if (activeTab?.view && contentView.children.includes(activeTab.view)) {
      contentView.addChildView(activeTab.view)
    }
  }

  private encodeThumbnail(image: NativeImage): string | null {
    if (image.isEmpty()) return null
    const { width, height } = image.getSize()
    if (width < 2 || height < 2) return null
    try {
      const resized = image.resize({ width: 320 })
      return `data:image/jpeg;base64,${resized.toJPEG(72).toString('base64')}`
    } catch {
      return null
    }
  }

  private raiseTabUnderChrome(tab: Tab): void {
    if (!tab.view) return
    const contentView = this.window.contentView
    const isTabView = (child: unknown) => this.tabs.some((item) => item.view === child)
    if (contentView.children.includes(tab.view)) {
      contentView.removeChildView(tab.view)
    }
    const overlayIndex = contentView.children.findIndex((child) => !isTabView(child))
    const index = overlayIndex >= 0 ? overlayIndex : contentView.children.length
    contentView.addChildView(tab.view, index)
  }

  private async waitForCompositorFrame(wc: WebContents, timeoutMs = 250): Promise<void> {
    if (wc.isDestroyed()) return

    await new Promise<void>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        try {
          wc.endFrameSubscription()
        } catch {
          // Subscription may already have ended.
        }
        resolve()
      }
      const timer = setTimeout(done, timeoutMs)
      try {
        wc.beginFrameSubscription(false, () => {
          clearTimeout(timer)
          done()
        })
      } catch {
        clearTimeout(timer)
        done()
      }
    })
  }

  private async waitForPaint(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return

    if (wc.isLoadingMainFrame() || wc.isLoading()) {
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          wc.removeListener('did-stop-loading', finish)
          resolve()
        }
        wc.once('did-stop-loading', finish)
        setTimeout(finish, 5000)
      })
    }

    if (wc.isDestroyed()) return
    await this.waitForCompositorFrame(wc)

    if (wc.isDestroyed()) return
    try {
      await Promise.race([
        wc.executeJavaScript(
          'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 80))
      ])
    } catch {
      await new Promise<void>((resolve) => setTimeout(resolve, 32))
    }
  }

  private async snapshotTab(tab: Tab): Promise<string | null> {
    const wc = tab.view?.webContents
    if (this.window.isDestroyed() || !tab.view || !wc || wc.isDestroyed()) return null
    if (this.carouselCommitting && tab.id !== this.activeTabId) return null

    const bounds = this.window.getContentBounds()
    const viewBounds = {
      x: 0,
      y: 0,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height)
    }

    this.thumbnailCaptureTabId = tab.id
    const activeAtStart = this.activeTabId
    try {
      wc.setBackgroundThrottling(false)
    } catch {
      // Older Electron builds may not expose the setter.
    }
    tab.view.setVisible(true)
    tab.view.setBounds(viewBounds)
    this.raiseTabUnderChrome(tab)

    try {
      await this.waitForPaint(wc)
      if (wc.isDestroyed() || this.carouselCommitting || this.activeTabId !== activeAtStart) return null
      const image = await wc.capturePage(undefined, { stayHidden: false, stayAwake: true })
      return this.encodeThumbnail(image)
    } catch {
      return null
    } finally {
      try {
        if (!wc.isDestroyed()) wc.setBackgroundThrottling(true)
      } catch {
        // Ignore.
      }
      if (this.thumbnailCaptureTabId === tab.id) this.thumbnailCaptureTabId = null
      if (!this.destroying && !this.window.isDestroyed()) this.onLayout()
    }
  }

  private cacheActiveThumbnail(tab: Tab): void {
    const wc = tab.view?.webContents
    if (!wc || wc.isDestroyed()) return
    if (tab.id !== this.activeTabId && tab.id !== this.thumbnailCaptureTabId) {
      // Prefer snapshotting while still active / visible.
    }
    void wc
      .capturePage(undefined, { stayHidden: false, stayAwake: false })
      .then((image) => {
        const encoded = this.encodeThumbnail(image)
        if (encoded) tab.thumbnail = encoded
      })
      .catch(() => undefined)
  }

  private syncTabMetadata(tab: Tab): void {
    const wc = tab.view?.webContents
    if (!wc || wc.isDestroyed()) return
    try {
      tab.url = sanitizeNavigationUrl(wc.getURL()) ?? tab.url
      tab.title = wc.getTitle() || tab.title || 'New Tab'
      tab.canGoBack = wc.navigationHistory.canGoBack()
      tab.canGoForward = wc.navigationHistory.canGoForward()
    } catch {
      // Ignore destroyed races.
    }
  }

  private async ensureAwake(tab: Tab): Promise<void> {
    if (tab.view && !tab.hibernated) {
      const wc = tab.view.webContents
      if (wc && !wc.isDestroyed()) return
    }
    const existing = this.wakePromises.get(tab.id)
    if (existing) return existing
    const pending = this.wakeTab(tab).finally(() => {
      this.wakePromises.delete(tab.id)
    })
    this.wakePromises.set(tab.id, pending)
    return pending
  }

  private async wakeTab(tab: Tab): Promise<void> {
    if (this.destroying || this.window.isDestroyed()) return
    if (tab.view && !tab.hibernated) {
      const wc = tab.view.webContents
      if (wc && !wc.isDestroyed()) return
    }

    // Tear down a half-dead view before recreating.
    if (tab.view) this.detachTabView(tab)

    const view = this.createWebContentsView()
    tab.view = view
    tab.hibernated = false
    this.attachWebContentsHandlers(tab)
    if (tab.audioLockedUntilGesture) {
      this.lockAudioUntilGesture(tab)
    }

    this.onLayout()
    const target = sanitizeNavigationUrl(tab.url) ?? 'browsy://home'
    try {
      await view.webContents.loadURL(target)
    } catch {
      // Navigation can fail if the tab is closed mid-wake.
    }
    if (!tab.view || tab.view !== view) return
    this.syncTabMetadata(tab)
  }

  /**
   * Drop live WebContents for background tabs beyond the warm budget (or idle
   * long enough). Active and audible tabs stay warm.
   *
   * Cap eviction is skipped on tab switches so cycling a handful of tabs does
   * not reload the one you just left. The idle poll still applies the cap.
   */
  hibernateExcessTabs(applyCap = true): void {
    if (this.destroying) return
    this.pruneDestroyedTabs()

    const now = Date.now()
    const warmBackground = this.tabs.filter((tab) => {
      if (tab.id === this.activeTabId) return false
      if (tab.hibernated || !tab.view) return false
      if (tab.id === this.thumbnailCaptureTabId) return false
      const wc = tab.view.webContents
      if (!wc || wc.isDestroyed()) return false
      try {
        if (wc.isCurrentlyAudible()) return false
        if (wc.isLoadingMainFrame()) return false
      } catch {
        // Treat as hibernatable if audible/loading checks fail.
      }
      return true
    })

    warmBackground.sort((a, b) => a.lastActiveAt - b.lastActiveAt)

    let warmCount = warmBackground.length
    for (const tab of warmBackground) {
      const overCap = applyCap && warmCount > MAX_WARM_BACKGROUND_TABS
      const idle = now - tab.lastActiveAt >= TAB_HIBERNATE_IDLE_MS
      if (!overCap && !idle) continue
      this.hibernateTab(tab)
      warmCount -= 1
    }
  }

  private hibernateTab(tab: Tab): void {
    if (tab.id === this.activeTabId || tab.hibernated || !tab.view) return
    if (tab.id === this.thumbnailCaptureTabId) return

    // Metadata + thumbnail should already be current from switch/stop-loading.
    this.syncTabMetadata(tab)
    this.detachTabView(tab)
    tab.hibernated = true
    tab.devToolsOpen = false
    this.onUpdate()
  }

  destroy(): void {
    this.destroying = true
    if (this.hibernateTimer) {
      clearInterval(this.hibernateTimer)
      this.hibernateTimer = null
    }
    this.wakePromises.clear()
    this.rejectPendingMediaPermissions()
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
    // Hibernated tabs intentionally have no view — ignore.
    if (tab.hibernated || !tab.view) return
    const index = this.tabs.indexOf(tab)
    if (index === -1) return

    this.tabs.splice(index, 1)
    this.wakePromises.delete(tab.id)
    if (this.activeTabId === tab.id) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)]
      this.activeTabId = next?.id ?? null
      if (next) void this.switchTab(next.id)
      else if (!this.destroying) void this.createTab()
    }
    if (!this.destroying) this.onUpdate()
  }

  private detachTabView(tab: Tab): void {
    const view = tab.view
    if (!view) return
    const wc = view.webContents
    if (wc && !wc.isDestroyed() && tab.devToolsOpen) {
      wc.closeDevTools()
    }
    if (!this.window.isDestroyed()) {
      const { children } = this.window.contentView
      if (children.includes(view)) {
        this.window.contentView.removeChildView(view)
      }
    }
    if (wc && !wc.isDestroyed()) {
      wc.close()
    }
    tab.view = null
  }

  private pruneDestroyedTabs(): void {
    const destroyed = this.tabs.filter((tab) => {
      if (tab.hibernated || !tab.view) return false
      const wc = tab.view.webContents
      return !wc || wc.isDestroyed()
    })
    if (destroyed.length === 0) return

    this.tabs = this.tabs.filter((tab) => !destroyed.includes(tab))
    for (const tab of destroyed) this.wakePromises.delete(tab.id)
    if (this.activeTabId && !this.tabs.some((tab) => tab.id === this.activeTabId)) {
      this.activeTabId = this.tabs[0]?.id ?? null
    }
  }

  private toTabState(tab: Tab | undefined): TabState | null {
    if (!tab) return null
    if (tab.hibernated || !tab.view) {
      return {
        id: tab.id,
        title: tab.title || 'New Tab',
        url: tab.url || 'browsy://home',
        favicon: tab.favicon,
        isLoading: false,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        hibernated: true
      }
    }

    const wc = tab.view.webContents
    if (!wc || wc.isDestroyed()) return null

    return {
      id: tab.id,
      title: wc.getTitle() || tab.title || 'New Tab',
      url: wc.getURL() || tab.url || 'browsy://home',
      favicon: tab.favicon,
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      hibernated: false
    }
  }

  private attachWebContentsHandlers(tab: Tab): void {
    const view = tab.view
    if (!view) return
    const wc = view.webContents

    wc.on('destroyed', () => {
      this.removeDestroyedTab(tab)
    })

    wc.on('preload-error', (_event, preloadPath, error) => {
      console.error('[Browsy] Tab preload failed', preloadPath, error)
    })
    wc.on('console-message', (_event, _level, message) => {
      if (typeof message === 'string' && message.includes('[Browsy]')) {
        console.log(message)
      }
    })

    // Powerful permissions stay denied by default. Media (mic/camera) and
    // sanitized clipboard writes are handled once on the shared session from
    // WindowManager so multi-window routing stays correct.
    // Downloads are also registered once on the shared session (not per-tab).

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
      const pendingId = [...this.pendingPopups.entries()].find(
        ([, pending]) => pending.popup === null && pending.url === details.url
      )?.[0]
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
    wc.on('did-stop-loading', () => {
      this.syncTabMetadata(tab)
      this.onUpdate()
      if (tab.id === this.activeTabId) this.cacheActiveThumbnail(tab)
    })
    wc.on('page-title-updated', (_event, title) => {
      tab.title = title
      this.onUpdate()
    })
    wc.on('page-favicon-updated', (_event, favicons: string[]) => {
      const next = favicons.find((icon) => icon.startsWith('data:image/') || isAllowedNavigationUrl(icon))
      tab.favicon = next ?? null
      this.onUpdate()
    })
    wc.on('did-navigate', (_event, url) => {
      tab.url = sanitizeNavigationUrl(url) ?? tab.url
      tab.favicon = null
      tab.thumbnail = null
      this.syncTabMetadata(tab)
      this.onUpdate()
    })
    wc.on('did-navigate-in-page', () => {
      this.syncTabMetadata(tab)
      this.onUpdate()
    })

    wc.on('context-menu', (_event, params: ContextMenuParams) => {
      this.showPageContextMenu(tab, params)
    })

    wc.on('did-finish-load', () => {
      if (wc.isDestroyed()) return
      this.syncTabMetadata(tab)
      const url = wc.getURL()
      const title = wc.getTitle()
      if (url && !url.startsWith('browsy://error') && isAllowedNavigationUrl(url)) {
        addHistoryEntry(url, title)
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

    wc.on('input-event', (_event, inputEvent) => {
      if (
        inputEvent.type === 'mouseDown' ||
        inputEvent.type === 'keyDown' ||
        inputEvent.type === 'touchStart' ||
        inputEvent.type === 'gestureTap'
      ) {
        this.unlockAudioFromGesture(tab)
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
      else if (key === 'p' && input.shift) action = 'pin-page'
      else if (key === 'p') action = 'back'
      else if (key === 'n' && !input.shift) action = 'forward'
      else if (key === 'n' && input.shift) action = 'new-window'
      else if (key === 'b') action = 'bookmarks'
      else if (key === 'd') action = 'bookmark-page'
      else if (key === ',') action = 'settings'
      else if (key === '/' || key === '?' || code === 'Slash') action = 'shortcuts'
      else if (key === 'i' && input.shift) action = 'toggle-devtools'
      else if (input.meta && (key === 'arrowright' || code === 'ArrowRight')) action = 'next-tab'
      else if (input.meta && (key === 'arrowleft' || code === 'ArrowLeft')) action = 'prev-tab'

      if (action) {
        event.preventDefault()
        this.onShortcut(action)
      }
    })
  }
}
