/// <reference lib="dom" />

import { ipcRenderer } from 'electron'
import {
  LINK_PREVIEW_CARD_HEIGHT,
  LINK_PREVIEW_CARD_WIDTH,
  LINK_PREVIEW_HOVER_MS,
  LINK_PREVIEW_IMAGE_HEIGHT,
  canonicalPreviewUrl,
  computeLinkPreviewPosition,
  displayHostname,
  isPreviewableUrl
} from '../shared/link-preview'

/** Keep channel names inlined so this preload stays a single sandboxed file. */
const LINK_HOVER = 'browser:link-hover'
const LINK_LEAVE = 'browser:link-leave'
const LINK_PREVIEW_READY = 'browser:link-preview-ready'
const GET_SETTINGS = 'browser:get-settings'
const SETTINGS_CHANGED = 'browser:settings-changed'

interface PreviewPayload {
  url: string
  title: string
  hostname: string
  favicon: string | null
  dataUrl: string | null
  theme: 'light' | 'dark'
  failed?: boolean
}

const HOST_ATTR = 'data-browsy-link-preview'

export function startLinkPreviewHover(): void {
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let currentAnchor: Element | null = null
  let currentUrl: string | null = null
  let host: HTMLElement | null = null
  let shadow: ShadowRoot | null = null
  let enabled = true

  const setEnabled = (next: boolean): void => {
    enabled = next
    if (!enabled) hide()
  }

  void ipcRenderer
    .invoke(GET_SETTINGS)
    .then((settings: unknown) => setEnabled(previewsEnabled(settings)))
    .catch(() => undefined)

  ipcRenderer.on(SETTINGS_CHANGED, (_event, settings: unknown) => {
    setEnabled(previewsEnabled(settings))
  })

  const hide = (): void => {
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }
    if (currentUrl) {
      ipcRenderer.send(LINK_LEAVE)
    }
    currentAnchor = null
    currentUrl = null
    if (host?.isConnected) host.remove()
    host = null
    shadow = null
  }

  const reposition = (): void => {
    if (!host || !currentAnchor) return
    const rect = currentAnchor.getBoundingClientRect()
    if (rect.bottom < 8 || rect.top > window.innerHeight - 8 || rect.right < 8 || rect.left > window.innerWidth - 8) {
      hide()
      return
    }
    const pos = computeLinkPreviewPosition(
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight }
    )
    host.style.left = `${Math.round(pos.x)}px`
    host.style.top = `${Math.round(pos.y)}px`
  }

  const ensureCard = (url: string, title: string, theme: 'light' | 'dark'): ShadowRoot => {
    if (host?.isConnected && shadow) {
      const card = shadow.querySelector('.card')
      card?.setAttribute('data-theme', theme)
      return shadow
    }

    host = document.createElement('div')
    host.setAttribute(HOST_ATTR, '')
    host.setAttribute('role', 'tooltip')
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = [
      'all:initial',
      'position:fixed',
      'z-index:2147483646',
      'pointer-events:none',
      `width:${LINK_PREVIEW_CARD_WIDTH}px`,
      `height:${LINK_PREVIEW_CARD_HEIGHT}px`,
      'display:block'
    ].join(';')

    shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = cardMarkup()
    const card = shadow.querySelector('.card')
    card?.setAttribute('data-theme', theme)
    document.documentElement.appendChild(host)
    applyMeta(shadow, url, title, null)
    reposition()
    return shadow
  }

  const applyMeta = (root: ShadowRoot, url: string, title: string, favicon: string | null): void => {
    const titleEl = root.querySelector('.title')
    const hostEl = root.querySelector('.hostname')
    const glyph = root.querySelector('.glyph-letter')
    const icon = root.querySelector<HTMLImageElement>('.favicon')
    if (titleEl) titleEl.textContent = title || displayHostname(url)
    if (hostEl) hostEl.textContent = displayHostname(url)
    if (glyph) glyph.textContent = (displayHostname(url)[0] ?? '?').toUpperCase()
    if (icon) {
      icon.onerror = () => {
        icon.hidden = true
        icon.removeAttribute('src')
      }
      const src = previewFavicon(url, favicon)
      if (src) {
        icon.hidden = false
        icon.src = src
      } else {
        icon.removeAttribute('src')
        icon.hidden = true
      }
    }
  }

  const applyPreview = (payload: PreviewPayload): void => {
    if (!currentUrl || canonicalPreviewUrl(payload.url) !== canonicalPreviewUrl(currentUrl) || !shadow) return
    const root = shadow
    const card = root.querySelector('.card')
    card?.setAttribute('data-theme', payload.theme)
    applyMeta(root, payload.url, payload.title, payload.favicon)

    const img = root.querySelector<HTMLImageElement>('.shot')
    const ph = root.querySelector('.placeholder')
    if (payload.dataUrl && isSafePreviewImage(payload.dataUrl) && img) {
      img.onload = () => {
        img.classList.add('visible')
        ph?.classList.add('hidden')
      }
      img.src = payload.dataUrl
    } else if (payload.failed) {
      ph?.classList.add('failed')
    }
  }

  const showFor = (anchor: Element, url: string, title: string): void => {
    if (!enabled) return
    const urlChanged = currentUrl !== url
    currentAnchor = anchor
    currentUrl = url
    const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const root = ensureCard(url, title, theme)
    if (urlChanged) {
      const img = root.querySelector<HTMLImageElement>('.shot')
      const ph = root.querySelector('.placeholder')
      if (img) {
        img.removeAttribute('src')
        img.classList.remove('visible')
      }
      ph?.classList.remove('hidden', 'failed')
      applyMeta(root, url, title, null)
    }
    reposition()
    ipcRenderer.send(LINK_HOVER, { url, title })
  }

  const onOver = (event: Event): void => {
    if (!enabled) return
    const found = linkFromEvent(event)
    if (!found) return
    if (found.element === currentAnchor && found.url === currentUrl) return
    if (hoverTimer) clearTimeout(hoverTimer)
    const { element, url, title } = found
    const delay = currentUrl ? 70 : LINK_PREVIEW_HOVER_MS
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (!element.isConnected) return
      const rect = element.getBoundingClientRect()
      if (rect.width < 2 && rect.height < 2) return
      showFor(element, url, title)
    }, delay)
  }

  const onOut = (event: MouseEvent): void => {
    const found = linkFromEvent(event)
    if (found && nodeInside(found.element, event.relatedTarget)) return
    if (linkFromNode(event.relatedTarget)) return
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }
    hide()
  }

  ipcRenderer.on(LINK_PREVIEW_READY, (_event, payload: PreviewPayload) => {
    if (!payload || typeof payload.url !== 'string') return
    applyPreview(payload)
  })

  window.addEventListener('mouseover', onOver, true)
  window.addEventListener('mouseout', onOut, true)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
  window.addEventListener('keydown', hide, true)
  window.addEventListener('mousedown', hide, true)
  window.addEventListener('blur', hide)
  window.addEventListener('pagehide', hide)
  window.addEventListener('beforeunload', hide)
  document.addEventListener('mouseover', onOver, true)
  document.addEventListener('mouseout', onOut, true)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hide()
  })
}

function cardMarkup(): string {
  return `
    <style>
      :host { all: initial; }
      .card {
        width: ${LINK_PREVIEW_CARD_WIDTH}px;
        border-radius: 12px;
        border: 2px solid var(--border);
        background: var(--card);
        box-shadow: 0 18px 55px rgba(0, 0, 0, 0.42);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: var(--text);
        opacity: 1;
        transform: translateY(6px) scale(0.98);
        animation: pop 0.16s ease-out forwards;
      }
      .card[data-theme="dark"] {
        --card: #17171c;
        --preview: #27272a;
        --preview-2: #111114;
        --text: #ffffff;
        --muted: rgba(255, 255, 255, 0.7);
        --border: #3b82f6;
        --glyph: rgba(255, 255, 255, 0.12);
        --glyph-text: #a1a1aa;
        --shimmer: rgba(255, 255, 255, 0.1);
      }
      .card[data-theme="light"] {
        --card: #ffffff;
        --preview: #f4f4f5;
        --preview-2: #d4d4d8;
        --text: #18181b;
        --muted: #71717a;
        --border: #2563eb;
        --glyph: rgba(0, 0, 0, 0.08);
        --glyph-text: #52525b;
        --shimmer: rgba(255, 255, 255, 0.65);
      }
      .shot-wrap {
        position: relative;
        height: ${LINK_PREVIEW_IMAGE_HEIGHT}px;
        background: var(--preview);
        overflow: hidden;
        flex-shrink: 0;
      }
      .placeholder {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom right, var(--preview), var(--preview-2));
      }
      .placeholder:not(.failed)::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, var(--shimmer), transparent);
        animation: shimmer 1.15s ease-in-out infinite;
      }
      .placeholder.hidden { opacity: 0; transition: opacity 0.18s ease-out; }
      .shot {
        position: relative;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        display: block;
      }
      .shot.visible { opacity: 1; transition: opacity 0.18s ease-out; }
      .footer {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 4px;
        padding: 12px 16px 14px;
        min-width: 0;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        max-width: 100%;
      }
      .glyph {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        background: var(--glyph);
        color: var(--glyph-text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        font-size: 11px;
        font-weight: 600;
        position: relative;
      }
      .favicon {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .title {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .hostname {
        font-size: 12px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      @keyframes pop {
        to { transform: translateY(0) scale(1); }
      }
      @keyframes shimmer {
        from { transform: translateX(-60%); }
        to { transform: translateX(60%); }
      }
      @media (prefers-reduced-motion: reduce) {
        .card { animation: none; transform: none; }
        .placeholder::after { animation: none; }
      }
    </style>
    <div class="card" data-theme="dark">
      <div class="shot-wrap">
        <div class="placeholder"></div>
        <img class="shot" alt="" />
      </div>
      <div class="footer">
        <div class="row">
          <span class="glyph" aria-hidden="true">
            <span class="glyph-letter">?</span>
            <img class="favicon" alt="" hidden />
          </span>
          <span class="title"></span>
        </div>
        <span class="hostname"></span>
      </div>
    </div>
  `
}

function previewFavicon(pageUrl: string, pageFavicon: string | null): string | null {
  if (pageFavicon) {
    if (pageFavicon.startsWith('data:image/')) return pageFavicon
    if (pageFavicon.startsWith('https://') || pageFavicon.startsWith('http://')) return pageFavicon
  }
  if (!pageUrl || pageUrl.startsWith('browsy://')) return null
  try {
    const host = new URL(pageUrl).hostname
    if (!host) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return null
  }
}

function isSafePreviewImage(value: string): boolean {
  return (
    value.startsWith('data:image/jpeg;base64,') ||
    value.startsWith('data:image/png;base64,') ||
    value.startsWith('data:image/webp;base64,')
  )
}

function linkFromEvent(event: Event): { element: Element; url: string; title: string } | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const node of path) {
    const parsed = parseLinkNode(node)
    if (parsed) return parsed
  }
  return linkFromNode(event.target)
}

function linkFromNode(node: EventTarget | null): { element: Element; url: string; title: string } | null {
  let current: Node | null = node instanceof Node ? node : null
  while (current) {
    const parsed = parseLinkNode(current)
    if (parsed) return parsed
    const parent = current.parentNode
    if (parent) {
      current = parent
      continue
    }
    current = current instanceof ShadowRoot ? current.host : null
  }
  return null
}

function parseLinkNode(node: EventTarget): { element: Element; url: string; title: string } | null {
  if (node instanceof HTMLAnchorElement) {
    const raw = (node.getAttribute('href') ?? '').trim()
    if (!raw || raw.startsWith('#') || node.hasAttribute('download')) return null
    const url = node.href
    if (!isPreviewableUrl(url)) return null
    const titleEl = node.querySelector('.card-title, .site-title, .site-name')
    const title = (titleEl?.textContent || node.getAttribute('title') || node.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
    return { element: node, url, title }
  }
  if (typeof SVGAElement !== 'undefined' && node instanceof SVGAElement) {
    const raw = (node.getAttribute('href') ?? node.href.baseVal ?? '').trim()
    if (!raw || raw.startsWith('#')) return null
    try {
      const url = new URL(raw, document.baseURI).href
      if (!isPreviewableUrl(url)) return null
      const title = (node.textContent || '').replace(/\s+/g, ' ').trim()
      return { element: node, url, title }
    } catch {
      return null
    }
  }
  return null
}

function nodeInside(container: Element, target: EventTarget | null): boolean {
  let current: Node | null = target instanceof Node ? target : null
  while (current) {
    if (current === container) return true
    const parent = current.parentNode
    if (parent) {
      current = parent
      continue
    }
    current = current instanceof ShadowRoot ? current.host : null
  }
  return false
}

function previewsEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || !('linkPreview' in settings)) return true
  return (settings as { linkPreview?: unknown }).linkPreview !== false
}
