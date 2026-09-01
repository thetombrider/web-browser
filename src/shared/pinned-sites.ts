import { PINNED_SITES_MAX, type Bookmark } from './types'
import { isAllowedNavigationUrl } from './utils'

export function isPinnableUrl(url: string): boolean {
  return Boolean(url) && isAllowedNavigationUrl(url) && !url.startsWith('browsy://')
}

/** Pinned bookmarks in pin order, capped at PINNED_SITES_MAX. */
export function selectPinnedBookmarks(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks
    .filter((bookmark) => bookmark.pinned && isPinnableUrl(bookmark.url))
    .sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0))
    .slice(0, PINNED_SITES_MAX)
}
