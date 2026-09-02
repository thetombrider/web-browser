import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { isAllowedNavigationUrl } from '../../shared/utils'
import type { BookmarkImportResult, BookmarkImportSource } from '../../shared/types'

export type { BookmarkImportSource, BookmarkImportResult }

export interface ImportedBookmarkCandidate {
  title: string
  url: string
  createdAt: number
}

interface ChromeNode {
  name?: string
  type?: string
  url?: string
  date_added?: string
  children?: ChromeNode[]
}

const CHROME_EPOCH_MS = Date.UTC(1601, 0, 1)

function chromeDateMs(value?: string): number {
  const micros = Number(value)
  if (!Number.isFinite(micros) || micros <= 0) return Date.now()
  return Math.floor(CHROME_EPOCH_MS + micros / 1000)
}

function htmlDateMs(value?: string): number {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return Date.now()
  return Math.floor(seconds * 1000)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function push(out: ImportedBookmarkCandidate[], title: string, url: string, createdAt: number): void {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return
  out.push({
    title: (title.trim() || trimmedUrl).slice(0, 500),
    url: trimmedUrl,
    createdAt
  })
}

function walkChrome(node: ChromeNode | undefined, out: ImportedBookmarkCandidate[]): void {
  if (!node) return
  if (node.type === 'url' && node.url) {
    push(out, node.name ?? '', node.url, chromeDateMs(node.date_added))
    return
  }
  for (const child of node.children ?? []) walkChrome(child, out)
}

/** Chrome / Chromium Bookmarks JSON — folders ignored, links collected flat. */
export function parseChromeBookmarksJson(raw: string): ImportedBookmarkCandidate[] {
  try {
    const parsed = JSON.parse(raw) as { roots?: Record<string, ChromeNode | undefined> }
    const out: ImportedBookmarkCandidate[] = []
    for (const root of Object.values(parsed.roots ?? {})) walkChrome(root, out)
    return out
  } catch {
    return []
  }
}

/** Netscape HTML export (Chrome + Firefox). */
export function parseNetscapeBookmarksHtml(raw: string): ImportedBookmarkCandidate[] {
  const out: ImportedBookmarkCandidate[] = []
  const linkRe = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(raw)) !== null) {
    const attrs = match[1] ?? ''
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
    if (!hrefMatch) continue
    const href = decodeEntities(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '')
    const title = decodeEntities((match[2] ?? '').replace(/<[^>]+>/g, '').trim())
    const addMatch = /\badd_date\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
    push(out, title, href, htmlDateMs(addMatch?.[1] ?? addMatch?.[2] ?? addMatch?.[3]))
  }
  return out
}

export function parseBookmarkImportFile(raw: string, filePath: string): ImportedBookmarkCandidate[] {
  const lower = filePath.toLowerCase()
  const trimmed = raw.trim()
  if (lower.endsWith('.json') || trimmed.startsWith('{')) {
    const chrome = parseChromeBookmarksJson(trimmed)
    if (chrome.length > 0) return chrome
  }
  return parseNetscapeBookmarksHtml(trimmed)
}

function chromeUserDataRoots(): string[] {
  const home = homedir()
  if (process.platform === 'darwin') {
    return [
      join(home, 'Library/Application Support/Google Chrome'),
      join(home, 'Library/Application Support/Chromium'),
      join(home, 'Library/Application Support/BraveSoftware/Brave-Browser')
    ]
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData/Local')
    return [
      join(local, 'Google/Chrome/User Data'),
      join(local, 'Chromium/User Data'),
      join(local, 'BraveSoftware/Brave-Browser/User Data')
    ]
  }
  const config = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  return [join(config, 'google-chrome'), join(config, 'chromium'), join(config, 'BraveSoftware/Brave-Browser')]
}

export async function loadChromeBookmarksFromProfiles(): Promise<ImportedBookmarkCandidate[]> {
  const all: ImportedBookmarkCandidate[] = []
  for (const root of chromeUserDataRoots()) {
    if (!existsSync(root)) continue
    let names: string[] = []
    try {
      names = await readdir(root)
    } catch {
      continue
    }
    const profiles = names.includes('Bookmarks') ? ['.'] : names
    for (const name of profiles) {
      if (name === 'System Profile' || name === 'Guest Profile') continue
      const file = name === '.' ? join(root, 'Bookmarks') : join(root, name, 'Bookmarks')
      if (!existsSync(file)) continue
      try {
        all.push(...parseChromeBookmarksJson(await readFile(file, 'utf8')))
      } catch {
        // skip unreadable profile
      }
    }
  }
  return all
}

export async function loadBookmarksFromFilePath(filePath: string): Promise<ImportedBookmarkCandidate[]> {
  return parseBookmarkImportFile(await readFile(filePath, 'utf8'), filePath)
}

export function dedupeCandidates(candidates: ImportedBookmarkCandidate[]): ImportedBookmarkCandidate[] {
  const byUrl = new Map<string, ImportedBookmarkCandidate>()
  for (const candidate of candidates) {
    if (!isAllowedNavigationUrl(candidate.url)) continue
    const existing = byUrl.get(candidate.url)
    if (!existing || candidate.createdAt < existing.createdAt) byUrl.set(candidate.url, candidate)
  }
  return [...byUrl.values()]
}

export type BookmarkFilePicker = () => Promise<string | null>

export async function collectImportCandidates(
  source: BookmarkImportSource,
  pickFile: BookmarkFilePicker
): Promise<{ candidates: ImportedBookmarkCandidate[]; cancelled?: boolean; hint?: string }> {
  if (source === 'chrome') {
    const fromProfiles = await loadChromeBookmarksFromProfiles()
    if (fromProfiles.length > 0) return { candidates: fromProfiles }
  }

  // Firefox (and Chrome fallback / generic file): HTML or Chrome JSON via picker.
  const filePath = await pickFile()
  if (!filePath) {
    return {
      candidates: [],
      cancelled: true,
      hint:
        source === 'firefox'
          ? 'Export bookmarks as HTML from Firefox, then Import file…'
          : source === 'chrome'
            ? 'No Chrome profile found. Export Bookmarks HTML/JSON and try again.'
            : 'Import cancelled.'
    }
  }

  try {
    return { candidates: await loadBookmarksFromFilePath(filePath) }
  } catch {
    return { candidates: [], hint: 'Could not read that bookmarks file.' }
  }
}

export function buildImportResult(
  source: BookmarkImportSource,
  summary: { added: number; skippedDuplicates: number; skippedInvalid: number },
  meta?: { cancelled?: boolean; hint?: string }
): BookmarkImportResult {
  if (meta?.cancelled || meta?.hint) {
    return {
      source,
      added: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      cancelled: meta.cancelled,
      notFound: !meta.cancelled,
      message: meta.hint ?? 'Import cancelled.'
    }
  }

  const label = source === 'chrome' ? 'Chrome' : source === 'firefox' ? 'Firefox' : 'file'
  if (summary.added === 0 && summary.skippedDuplicates === 0 && summary.skippedInvalid === 0) {
    return {
      source,
      ...summary,
      notFound: true,
      message: `No bookmarks found to import from ${label}.`
    }
  }

  const parts = [`Imported ${summary.added} from ${label}`]
  if (summary.skippedDuplicates > 0) parts.push(`${summary.skippedDuplicates} already saved`)
  if (summary.skippedInvalid > 0) parts.push(`${summary.skippedInvalid} skipped`)
  return { source, ...summary, message: parts.join(' · ') }
}
