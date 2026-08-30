import type { Bookmark, HistoryEntry, TabState } from '@shared/types'

export type SuggestionKind = 'tab' | 'bookmark' | 'history' | 'command'

export type CommandAction =
  | 'bookmarks'
  | 'settings'
  | 'new-tab'
  | 'new-window'
  | 'reload'
  | 'home'
  | 'close-tab'
  | 'devtools'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  title: string
  subtitle: string
  url?: string
  tabId?: string
  action?: CommandAction
  glyph: string
}

interface CommandDef {
  action: CommandAction
  title: string
  subtitle: string
  glyph: string
  keywords: string[]
  slashes: string[]
}

const COMMANDS: CommandDef[] = [
  {
    action: 'bookmarks',
    title: 'Bookmarks',
    subtitle: 'Open bookmarks',
    glyph: '★',
    keywords: ['bookmarks', 'bookmark', 'saved', 'favorites'],
    slashes: ['/bookmarks', '/b', '/bm']
  },
  {
    action: 'settings',
    title: 'Settings',
    subtitle: 'Open settings',
    glyph: '⚙',
    keywords: ['settings', 'preferences', 'options', 'config'],
    slashes: ['/settings', '/s', '/pref']
  },
  {
    action: 'new-tab',
    title: 'New tab',
    subtitle: 'Open a new tab',
    glyph: '+',
    keywords: ['new tab', 'newtab', 'tab'],
    slashes: ['/new', '/t', '/tab']
  },
  {
    action: 'new-window',
    title: 'New window',
    subtitle: 'Open a new window',
    glyph: '◻',
    keywords: ['new window', 'window'],
    slashes: ['/window', '/w']
  },
  {
    action: 'reload',
    title: 'Reload',
    subtitle: 'Reload this page',
    glyph: '↻',
    keywords: ['reload', 'refresh'],
    slashes: ['/reload', '/r']
  },
  {
    action: 'home',
    title: 'Home',
    subtitle: 'Go to browsy://home',
    glyph: 'B',
    keywords: ['home', 'start'],
    slashes: ['/home', '/h']
  },
  {
    action: 'close-tab',
    title: 'Close tab',
    subtitle: 'Close the current tab',
    glyph: '×',
    keywords: ['close tab', 'close', 'closetab'],
    slashes: ['/close', '/x']
  },
  {
    action: 'devtools',
    title: 'DevTools',
    subtitle: 'Toggle developer tools',
    glyph: '<>',
    keywords: ['devtools', 'developer tools', 'inspect', 'console'],
    slashes: ['/devtools', '/dev', '/i']
  }
]

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

function matchesQuery(query: string, ...fields: string[]): boolean {
  if (!query) return true
  return fields.some((field) => field.toLowerCase().includes(query))
}

/** True when query is a prefix/substring of a command keyword or title. */
function commandMatches(query: string, command: CommandDef): boolean {
  if (!query) return false
  if (query.startsWith('/')) {
    return command.slashes.some((slash) => slash.startsWith(query) || query.startsWith(slash))
  }
  const title = command.title.toLowerCase()
  if (title === query || title.startsWith(query) || title.includes(query)) return true
  return command.keywords.some(
    (keyword) =>
      keyword === query || keyword.startsWith(query) || (query.length >= 2 && keyword.includes(query))
  )
}

/** Prefer exact / prefix keyword hits so "home" ranks above fuzzy page noise. */
function commandRank(query: string, command: CommandDef): number {
  const title = command.title.toLowerCase()
  if (title === query) return 0
  if (command.keywords.some((k) => k === query)) return 1
  if (title.startsWith(query)) return 2
  if (command.keywords.some((k) => k.startsWith(query))) return 3
  return 4
}

function toCommandSuggestion(command: CommandDef): Suggestion {
  return {
    id: `command-${command.action}`,
    kind: 'command',
    title: command.title,
    subtitle: command.subtitle,
    action: command.action,
    glyph: command.glyph
  }
}

export function matchingCommands(query: string): Suggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return COMMANDS.filter((command) => commandMatches(q, command))
    .sort((a, b) => commandRank(q, a) - commandRank(q, b))
    .map(toCommandSuggestion)
}

/** True when typed text should run this command on Enter (keyword/title exact). */
export function commandForExactQuery(query: string): Suggestion | null {
  const q = query.trim().toLowerCase()
  if (!q || q.startsWith('/')) return null
  const hit = COMMANDS.find(
    (command) =>
      command.title.toLowerCase() === q || command.keywords.some((keyword) => keyword === q)
  )
  return hit ? toCommandSuggestion(hit) : null
}

export function buildSuggestions(
  query: string,
  tabs: TabState[],
  bookmarks: Bookmark[],
  history: HistoryEntry[],
  limit = 8
): Suggestion[] {
  const q = query.trim().toLowerCase()
  const seenUrls = new Set<string>()
  const results: Suggestion[] = []

  const pushPage = (item: Suggestion) => {
    if (!item.url || seenUrls.has(item.url) || item.url.startsWith('browsy://')) return
    seenUrls.add(item.url)
    results.push(item)
  }

  // Slash mode: commands only
  if (q.startsWith('/')) {
    for (const suggestion of matchingCommands(q)) {
      if (results.length >= limit) break
      results.push(suggestion)
    }
    return results
  }

  // Plain text: matching commands first so "home" / "settings" always surface
  if (q) {
    for (const suggestion of matchingCommands(q)) {
      if (results.length >= limit) break
      results.push(suggestion)
    }
  }

  for (const tab of tabs) {
    if (results.length >= limit) break
    if (matchesQuery(q, tab.title, tab.url)) {
      pushPage({
        id: `tab-${tab.id}`,
        kind: 'tab',
        title: tab.title === 'Browsy' || tab.url === 'browsy://home' ? 'Home' : tab.title,
        subtitle: tab.url,
        url: tab.url,
        tabId: tab.id,
        glyph: letterForUrl(tab.url)
      })
    }
  }

  for (const bookmark of bookmarks) {
    if (results.length >= limit) break
    if (matchesQuery(q, bookmark.title, bookmark.url)) {
      pushPage({
        id: `bookmark-${bookmark.id}`,
        kind: 'bookmark',
        title: bookmark.title,
        subtitle: bookmark.url,
        url: bookmark.url,
        glyph: letterForUrl(bookmark.url)
      })
    }
  }

  for (const entry of history) {
    if (results.length >= limit) break
    if (matchesQuery(q, entry.title, entry.url)) {
      pushPage({
        id: `history-${entry.url}-${entry.visitedAt}`,
        kind: 'history',
        title: entry.title || hostnameOf(entry.url),
        subtitle: entry.url,
        url: entry.url,
        glyph: letterForUrl(entry.url)
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
    case 'command':
      return 'Command'
  }
}
