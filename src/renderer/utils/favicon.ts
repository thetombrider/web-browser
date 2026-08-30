import { letterForUrl } from './suggestions'

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

export { letterForUrl }
