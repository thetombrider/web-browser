import type { Bookmark, HistoryEntry, TabState } from '@shared/types'

export type SuggestionKind = 'tab' | 'bookmark' | 'history'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  title: string
  url: string
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

export function letterForUrl(url: string): string {
  if (url.startsWith('browsy://')) return 'B'
  const host = hostnameOf(url)
  return (host[0] ?? '?').toUpperCase()
}

export function buildSuggestions(
  query: string,
  tabs: TabState[],
  bookmarks: Bookmark[],
  history: HistoryEntry[],
  limit = 6
): Suggestion[] {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const results: Suggestion[] = []

  const push = (item: Suggestion) => {
    if (seen.has(item.url) || item.url.startsWith('browsy://')) return
    seen.add(item.url)
    results.push(item)
  }

  const matches = (title: string, url: string) => {
    if (!q) return true
    return title.toLowerCase().includes(q) || url.toLowerCase().includes(q)
  }

  for (const tab of tabs) {
    if (results.length >= limit) break
    if (matches(tab.title, tab.url)) {
      push({ id: `tab-${tab.id}`, kind: 'tab', title: tab.title, url: tab.url })
    }
  }

  for (const bookmark of bookmarks) {
    if (results.length >= limit) break
    if (matches(bookmark.title, bookmark.url)) {
      push({
        id: `bookmark-${bookmark.id}`,
        kind: 'bookmark',
        title: bookmark.title,
        url: bookmark.url
      })
    }
  }

  for (const entry of history) {
    if (results.length >= limit) break
    if (matches(entry.title, entry.url)) {
      push({
        id: `history-${entry.url}-${entry.visitedAt}`,
        kind: 'history',
        title: entry.title || hostnameOf(entry.url),
        url: entry.url
      })
    }
  }

  return results
}

export function kindLabel(kind: SuggestionKind): string {
  switch (kind) {
    case 'tab':
      return 'Tab'
    case 'bookmark':
      return 'Bookmark'
    case 'history':
      return 'History'
  }
}
