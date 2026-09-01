import { URL } from 'url'
import { SEARCH_ENGINE_URLS, type SearchEngine } from './types'

/** Schemes permitted for tab navigation, bookmarks, session restore, and pop-ups. */
export const ALLOWED_NAVIGATION_PROTOCOLS = new Set(['http:', 'https:', 'browsy:'])

/**
 * Web permissions granted to tab content. Default-deny everything else.
 * `clipboard-sanitized-write` is required for page copy buttons
 * (`navigator.clipboard.writeText`); clipboard-read stays denied.
 */
export const ALLOWED_WEB_PERMISSIONS = new Set(['clipboard-sanitized-write'])

export function isAllowedWebPermission(permission: string): boolean {
  return ALLOWED_WEB_PERMISSIONS.has(permission)
}

export function isAllowedNavigationUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url.trim())
    if (!ALLOWED_NAVIGATION_PROTOCOLS.has(parsed.protocol)) return false
    // Reject embedded credentials in http(s) URLs.
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && (parsed.username || parsed.password)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Returns the URL if allowed, otherwise null. */
export function sanitizeNavigationUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  return isAllowedNavigationUrl(trimmed) ? trimmed : null
}

export function resolveNavigationInput(input: string, searchEngine: SearchEngine = 'google'): string {
  const trimmed = input.trim()
  if (!trimmed) return 'browsy://home'

  if (/^browsy:\/\//i.test(trimmed)) {
    return isAllowedNavigationUrl(trimmed) ? trimmed : 'browsy://home'
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return isAllowedNavigationUrl(trimmed) ? trimmed : 'browsy://home'
  }

  // Block other schemes (javascript:, data:, file:, etc.).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return 'browsy://home'
  }

  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/i.test(trimmed)) {
    const local = `http://${trimmed}`
    return isAllowedNavigationUrl(local) ? local : 'browsy://home'
  }

  const searchBase = SEARCH_ENGINE_URLS[searchEngine] ?? SEARCH_ENGINE_URLS.google

  if (/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/i.test(trimmed) || trimmed.includes('.')) {
    try {
      const withProtocol = `https://${trimmed}`
      // eslint-disable-next-line no-new
      new URL(withProtocol)
      return isAllowedNavigationUrl(withProtocol) ? withProtocol : `${searchBase}${encodeURIComponent(trimmed)}`
    } catch {
      return `${searchBase}${encodeURIComponent(trimmed)}`
    }
  }

  return `${searchBase}${encodeURIComponent(trimmed)}`
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
export function faviconUrlForPage(pageUrl: string, pageFavicon?: string | null): string | null {
  if (pageFavicon) {
    if (pageFavicon.startsWith('data:image/')) return pageFavicon
    return isAllowedNavigationUrl(pageFavicon) ? pageFavicon : null
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
