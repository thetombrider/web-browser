/** Carousel focused card is 360×225; hover preview is ~17% larger. */
export const LINK_PREVIEW_CARD_WIDTH = 420
export const LINK_PREVIEW_IMAGE_HEIGHT = 262
export const LINK_PREVIEW_FOOTER_HEIGHT = 72
export const LINK_PREVIEW_CARD_HEIGHT = LINK_PREVIEW_IMAGE_HEIGHT + LINK_PREVIEW_FOOTER_HEIGHT
export const LINK_PREVIEW_HOVER_MS = 420
export const LINK_PREVIEW_CACHE_LIMIT = 24
/** Max time to wait for a destination page before giving up on a live preview. */
export const LINK_PREVIEW_LOAD_TIMEOUT_MS = 4500
/** Settle delay after load before capturePage. */
export const LINK_PREVIEW_SETTLE_MS = 200
/** Offscreen capture viewport — smaller than a full window to cut compositor cost. */
export const LINK_PREVIEW_VIEWPORT_WIDTH = 800
export const LINK_PREVIEW_VIEWPORT_HEIGHT = 500

export interface LinkRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export function canonicalPreviewUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.toString()
  } catch {
    return url
  }
}

export function displayHostname(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '')
    return host || url
  } catch {
    return url
  }
}

export function isPreviewableUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
    return true
  } catch {
    return false
  }
}

export function computeLinkPreviewPosition(
  link: LinkRect,
  viewport: ViewportSize,
  card = { width: LINK_PREVIEW_CARD_WIDTH, height: LINK_PREVIEW_CARD_HEIGHT }
): { x: number; y: number } {
  const gap = 14
  const margin = 16
  const maxX = Math.max(margin, viewport.width - card.width - margin)
  const maxY = Math.max(margin, viewport.height - card.height - margin)
  const clampX = (x: number) => Math.min(Math.max(margin, x), maxX)
  const clampY = (y: number) => Math.min(Math.max(margin, y), maxY)
  const centeredX = clampX(link.x + link.width / 2 - card.width / 2)

  const above = link.y - gap - card.height
  if (above >= margin) return { x: centeredX, y: above }

  const below = link.y + link.height + gap
  if (below + card.height <= viewport.height - margin) return { x: centeredX, y: below }

  const right = link.x + link.width + gap
  if (right + card.width <= viewport.width - margin) {
    return { x: right, y: clampY(link.y + link.height / 2 - card.height / 2) }
  }

  const left = link.x - gap - card.width
  if (left >= margin) {
    return { x: left, y: clampY(link.y + link.height / 2 - card.height / 2) }
  }

  return { x: centeredX, y: clampY(below) }
}
