import Store from 'electron-store'
import type { Bookmark, HistoryEntry, SessionWindow, Settings } from '../../shared/types'

interface StoreSchema {
  bookmarks: Bookmark[]
  history: HistoryEntry[]
  session: SessionWindow[]
  settings: Settings
}

const defaults: StoreSchema = {
  bookmarks: [],
  history: [],
  session: [],
  settings: {
    homepage: 'recent',
    searchEngine: 'google'
  }
}

export const store = new Store<StoreSchema>({
  name: 'browsy-data',
  defaults
})

export function getBookmarks(): Bookmark[] {
  return store.get('bookmarks')
}

export function addBookmark(bookmark: Bookmark): void {
  const bookmarks = getBookmarks()
  if (bookmarks.some((b) => b.url === bookmark.url)) return
  store.set('bookmarks', [bookmark, ...bookmarks])
}

export function removeBookmark(id: string): void {
  store.set(
    'bookmarks',
    getBookmarks().filter((b) => b.id !== id)
  )
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
  return store.get('settings')
}

export function setSettings(settings: Partial<Settings>): Settings {
  const current = getSettings()
  const next = { ...current, ...settings }
  store.set('settings', next)
  return next
}
