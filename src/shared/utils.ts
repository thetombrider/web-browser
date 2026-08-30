import { URL } from 'url'
import { SEARCH_ENGINE_URLS, type SearchEngine } from './types'

export function resolveNavigationInput(input: string, searchEngine: SearchEngine = 'google'): string {
  const trimmed = input.trim()
  if (!trimmed) return 'browsy://home'

  if (/^browsy:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`
  }

  const searchBase = SEARCH_ENGINE_URLS[searchEngine] ?? SEARCH_ENGINE_URLS.google

  if (/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/i.test(trimmed) || trimmed.includes('.')) {
    try {
      const withProtocol = `https://${trimmed}`
      // eslint-disable-next-line no-new
      new URL(withProtocol)
      return withProtocol
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
  if (pageFavicon) return pageFavicon
  if (!pageUrl || pageUrl.startsWith('browsy://')) return null
  try {
    const host = new URL(pageUrl).hostname
    if (!host) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return null
  }
}
