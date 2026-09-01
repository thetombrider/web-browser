import Store from 'electron-store'
import { PINNED_SITES_MAX, type Bookmark } from '../../shared/types'
import type { HistoryEntry, SessionWindow, Settings, SiteMediaPermissions } from '../../shared/types'
import { selectPinnedBookmarks } from '../../shared/pinned-sites'

interface StoreSchema {
  bookmarks: Bookmark[]
  history: HistoryEntry[]
  session: SessionWindow[]
  settings: Settings
  /** Per-origin mic/camera decisions for video calls and getUserMedia. */
  siteMediaPermissions: Record<string, SiteMediaPermissions>
}

const defaults: StoreSchema = {
  bookmarks: [],
  history: [],
  session: [],
  settings: {
    homepage: 'recent',
    searchEngine: 'google',
    restoreSession: 'always',
    theme: 'system',
    hasSeenShortcutTip: false
  },
  siteMediaPermissions: {}
}

export const store = new Store<StoreSchema>({
  name: 'browsy-data',
  defaults
})

export function getBookmarks(): Bookmark[] {
  return store.get('bookmarks')
}

export function addBookmark(bookmark: Bookmark): { added: boolean; alreadyExists: boolean } {
  const bookmarks = getBookmarks()
  if (bookmarks.some((b) => b.url === bookmark.url)) {
    return { added: false, alreadyExists: true }
  }
  store.set('bookmarks', [
    { id: bookmark.id, title: bookmark.title, url: bookmark.url, createdAt: bookmark.createdAt, pinned: false },
    ...bookmarks
  ])
  return { added: true, alreadyExists: false }
}

export function removeBookmark(id: string): void {
  store.set(
    'bookmarks',
    getBookmarks().filter((b) => b.id !== id)
  )
}

export function getPinnedBookmarks(): Bookmark[] {
  return selectPinnedBookmarks(getBookmarks())
}

export function setBookmarkPinned(
  id: string,
  pinned: boolean
): { updated: boolean; atLimit: boolean } {
  const bookmarks = getBookmarks()
  const target = bookmarks.find((bookmark) => bookmark.id === id)
  if (!target) return { updated: false, atLimit: false }
  if (Boolean(target.pinned) === pinned) return { updated: false, atLimit: false }
  if (pinned && bookmarks.filter((bookmark) => bookmark.pinned).length >= PINNED_SITES_MAX) {
    return { updated: false, atLimit: true }
  }

  store.set(
    'bookmarks',
    bookmarks.map((bookmark) => {
      if (bookmark.id !== id) return bookmark
      if (pinned) return { ...bookmark, pinned: true, pinnedAt: Date.now() }
      return { ...bookmark, pinned: false, pinnedAt: undefined }
    })
  )
  return { updated: true, atLimit: false }
}

export function pinBookmarkByUrl(url: string): {
  pinned: boolean
  alreadyPinned: boolean
  atLimit: boolean
} {
  const target = getBookmarks().find((bookmark) => bookmark.url === url)
  if (!target) return { pinned: false, alreadyPinned: false, atLimit: false }
  if (target.pinned) return { pinned: false, alreadyPinned: true, atLimit: false }
  const result = setBookmarkPinned(target.id, true)
  return { pinned: result.updated, alreadyPinned: false, atLimit: result.atLimit }
}

export function addHistoryEntry(url: string, title: string): void {
  if (url.startsWith('browsy://')) return
  const entry: HistoryEntry = { url, title, visitedAt: Date.now() }
  const history = store.get('history').filter((h) => h.url !== url)
  store.set('history', [entry, ...history].slice(0, 5000))
}

export function getHistory(): HistoryEntry[] {
  return store.get('history')
}

export function getRecentSites(limit = 12): HistoryEntry[] {
  const seen = new Set<string>()
  const recent: HistoryEntry[] = []
  for (const entry of getHistory()) {
    if (seen.has(entry.url)) continue
    seen.add(entry.url)
    recent.push(entry)
    if (recent.length >= limit) break
  }
  return recent
}

export function getSession(): SessionWindow[] {
  return store.get('session')
}

export function saveSession(session: SessionWindow[]): void {
  store.set('session', session)
}

export function getSettings(): Settings {
  const stored = store.get('settings')
  return { ...defaults.settings, ...stored }
}

export function setSettings(settings: Partial<Settings>): Settings {
  const current = getSettings()
  const next = { ...current, ...settings }
  store.set('settings', next)
  return next
}

export function getSiteMediaPermissions(): Record<string, SiteMediaPermissions> {
  return store.get('siteMediaPermissions') ?? {}
}

export function setSiteMediaPermissions(
  origin: string,
  permissions: SiteMediaPermissions
): SiteMediaPermissions {
  const all = { ...getSiteMediaPermissions(), [origin]: permissions }
  store.set('siteMediaPermissions', all)
  return permissions
}
