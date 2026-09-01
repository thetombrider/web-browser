import { BrowserWindow, nativeTheme, type DownloadItem, type Event, type NativeImage, type WebContents } from 'electron'
import type { LinkPreviewPayload } from '../../shared/types'
import { LINK_PREVIEW_CACHE_LIMIT, canonicalPreviewUrl, displayHostname, isPreviewableUrl } from '../../shared/link-preview'
import { faviconUrlForPage, isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import { getSettings } from './store'

const PREVIEW_LOAD_TIMEOUT_MS = 7000
const PREVIEW_SETTLE_MS = 450

export function resolvePreviewTheme(): 'light' | 'dark' {
  const theme = getSettings().theme
  if (theme === 'light' || theme === 'dark') return theme
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function encodePreviewImage(image: NativeImage): string | null {
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  if (width < 2 || height < 2) return null
  try {
    const resized = image.resize({ width: Math.min(width, 720) })
    return `data:image/jpeg;base64,${resized.toJPEG(80).toString('base64')}`
  } catch {
    return null
  }
}

export function makeLinkPreviewPayload(options: {
  url: string
  title?: string
  favicon?: string | null
  dataUrl?: string | null
  failed?: boolean
}): LinkPreviewPayload {
  const url = options.url
  const title = (options.title ?? '').trim() || displayHostname(url)
  return {
    url,
    title,
    hostname: displayHostname(url),
    favicon: faviconUrlForPage(url, options.favicon),
    dataUrl: options.dataUrl ?? null,
    theme: resolvePreviewTheme(),
    failed: options.failed
  }
}

export class LinkPreviewCapturer {
  private window: BrowserWindow | null = null
  private cache = new Map<string, LinkPreviewPayload>()
  private generation = 0
  private downloadHandler: ((event: Event, item: DownloadItem, contents: WebContents) => void) | null = null

  constructor(private parent: BrowserWindow) {}

  owns(wc: WebContents): boolean {
    const preview = this.window?.webContents
    return Boolean(preview && !preview.isDestroyed() && preview.id === wc.id)
  }

  getCached(url: string): LinkPreviewPayload | null {
    return this.cache.get(canonicalPreviewUrl(url)) ?? null
  }

  remember(payload: LinkPreviewPayload): void {
    if (!payload.dataUrl) return
    const key = canonicalPreviewUrl(payload.url)
    if (this.cache.has(key)) this.cache.delete(key)
    this.cache.set(key, payload)
    while (this.cache.size > LINK_PREVIEW_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (!oldest) break
      this.cache.delete(oldest)
    }
  }

  cancel(): void {
    this.generation += 1
    const wc = this.window?.webContents
    if (wc && !wc.isDestroyed() && wc.isLoading()) {
      wc.stop()
    }
  }

  dispose(): void {
    this.generation += 1
    this.cache.clear()
    if (this.window && !this.window.isDestroyed()) {
      if (this.downloadHandler) {
        this.window.webContents.session.removeListener('will-download', this.downloadHandler)
      }
      this.window.destroy()
    }
    this.downloadHandler = null
    this.window = null
  }

  async capture(url: string): Promise<LinkPreviewPayload | null> {
    const safeUrl = sanitizeNavigationUrl(url)
    if (!safeUrl || !isPreviewableUrl(safeUrl)) return null

    const cached = this.getCached(safeUrl)
    if (cached?.dataUrl) return cached

    const gen = ++this.generation
    const wc = this.ensureWindow()
    if (!wc) return null

    let favicon: string | null = null
    const onFavicon = (_event: unknown, favicons: string[]): void => {
      const next = favicons.find((icon) => icon.startsWith('data:image/') || isAllowedNavigationUrl(icon))
      if (next) favicon = next
    }
    wc.on('page-favicon-updated', onFavicon)

    try {
      await this.loadPreview(wc, safeUrl)
      if (gen !== this.generation || wc.isDestroyed()) return null
      await this.waitForPaint(wc)
      if (gen !== this.generation || wc.isDestroyed()) return null
      await sleep(PREVIEW_SETTLE_MS)
      if (gen !== this.generation || wc.isDestroyed()) return null

      let dataUrl: string | null = null
      try {
        const image = await wc.capturePage(undefined, { stayHidden: true, stayAwake: true })
        dataUrl = encodePreviewImage(image)
      } catch {
        dataUrl = null
      }

      if (gen !== this.generation) return null

      const payload = makeLinkPreviewPayload({
        url: safeUrl,
        title: wc.isDestroyed() ? '' : wc.getTitle(),
        favicon,
        dataUrl,
        failed: !dataUrl
      })
      this.remember(payload)
      return payload
    } finally {
      if (!wc.isDestroyed()) {
        wc.removeListener('page-favicon-updated', onFavicon)
      }
    }
  }

  private ensureWindow(): WebContents | null {
    if (this.parent.isDestroyed()) return null
    if (this.window && !this.window.isDestroyed()) {
      const wc = this.window.webContents
      return wc.isDestroyed() ? null : wc
    }

    const win = new BrowserWindow({
      parent: this.parent,
      show: false,
      width: 1280,
      height: 800,
      skipTaskbar: true,
      frame: false,
      focusable: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: true,
        images: true,
        webSecurity: true,
        backgroundThrottling: false,
        autoplayPolicy: 'user-gesture-required'
      }
    })
    win.setMenuBarVisibility(false)
    win.webContents.setAudioMuted(true)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, nextUrl) => {
      if (!isAllowedNavigationUrl(nextUrl)) event.preventDefault()
    })
    win.webContents.on('will-redirect', (event, nextUrl) => {
      if (!isAllowedNavigationUrl(nextUrl)) event.preventDefault()
    })
    this.downloadHandler = (_event, item, contents) => {
      if (contents.id === win.webContents.id) item.cancel()
    }
    win.webContents.session.on('will-download', this.downloadHandler)
    this.window = win
    return win.webContents
  }

  private async loadPreview(wc: WebContents, url: string): Promise<void> {
    await new Promise<void>((resolve) => {
      const finish = (): void => {
        wc.removeListener('did-finish-load', finish)
        wc.removeListener('did-fail-load', onFail)
        clearTimeout(timer)
        resolve()
      }
      const onFail = (
        _event: unknown,
        errorCode: number,
        _description: string,
        _validatedURL: string,
        isMainFrame: boolean
      ): void => {
        if (!isMainFrame || errorCode === -3) return
        finish()
      }
      const timer = setTimeout(finish, PREVIEW_LOAD_TIMEOUT_MS)
      wc.once('did-finish-load', finish)
      wc.on('did-fail-load', onFail)
      void wc.loadURL(url).catch(() => finish())
    })
  }

  private async waitForPaint(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return
    await new Promise<void>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        wc.removeListener('paint', onPaint)
        resolve()
      }
      const onPaint = (): void => done()
      const timer = setTimeout(done, 1500)
      wc.once('paint', onPaint)
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
