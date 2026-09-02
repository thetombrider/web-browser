import { copyFile, readdir, readFile, mkdtemp, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, dirname } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { isAllowedNavigationUrl } from '../../shared/utils'
import type { BookmarkImportResult, BookmarkImportSource } from '../../shared/types'

const execFileAsync = promisify(execFile)

export type { BookmarkImportSource, BookmarkImportResult }

export interface ImportedBookmarkCandidate {
  title: string
  url: string
  createdAt: number
}

interface ChromeBookmarkNode {
  name?: string
  type?: string
  url?: string
  date_added?: string
  children?: ChromeBookmarkNode[]
}

interface ChromeBookmarksFile {
  roots?: Record<string, ChromeBookmarkNode | undefined>
}

const CHROME_EPOCH_OFFSET_MS = Date.UTC(1601, 0, 1)

/** Chrome `date_added` is µs since 1601-01-01. */
function chromeDateToMs(value: string | undefined): number {
  if (!value) return Date.now()
  const micros = Number(value)
  if (!Number.isFinite(micros) || micros <= 0) return Date.now()
  return Math.floor(CHROME_EPOCH_OFFSET_MS + micros / 1000)
}

/** Firefox `dateAdded` is µs since Unix epoch; HTML ADD_DATE is seconds. */
function firefoxDateToMs(value: string | number | undefined, unit: 'us' | 's' = 'us'): number {
  if (value === undefined || value === null || value === '') return Date.now()
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return Date.now()
  return unit === 's' ? Math.floor(n * 1000) : Math.floor(n / 1000)
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function pushCandidate(
  out: ImportedBookmarkCandidate[],
  title: string,
  url: string,
  createdAt: number
): void {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return
  const trimmedTitle = title.trim() || trimmedUrl
  out.push({ title: trimmedTitle.slice(0, 500), url: trimmedUrl, createdAt })
}

function walkChromeNode(node: ChromeBookmarkNode | undefined, out: ImportedBookmarkCandidate[]): void {
  if (!node) return
  if (node.type === 'url' && typeof node.url === 'string') {
    pushCandidate(out, node.name ?? '', node.url, chromeDateToMs(node.date_added))
    return
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walkChromeNode(child, out)
  }
}

export function parseChromeBookmarksJson(raw: string): ImportedBookmarkCandidate[] {
  let parsed: ChromeBookmarksFile
  try {
    parsed = JSON.parse(raw) as ChromeBookmarksFile
  } catch {
    return []
  }
  const out: ImportedBookmarkCandidate[] = []
  const roots = parsed.roots ?? {}
  for (const key of Object.keys(roots)) {
    walkChromeNode(roots[key], out)
  }
  return out
}

/**
 * Netscape Bookmark File Format (Chrome / Firefox HTML export).
 * Folders are ignored structurally; all links are collected flat for domain grouping.
 */
export function parseNetscapeBookmarksHtml(raw: string): ImportedBookmarkCandidate[] {
  const out: ImportedBookmarkCandidate[] = []
  const linkRe =
    /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(raw)) !== null) {
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
    if (!hrefMatch) continue
    const href = decodeHtmlEntities(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '')
    const title = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '').trim())
    const addMatch = /\badd_date\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
    const addRaw = addMatch?.[1] ?? addMatch?.[2] ?? addMatch?.[3]
    pushCandidate(out, title, href, firefoxDateToMs(addRaw, 's'))
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
  if (
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    /NETSCAPE-Bookmark-file/i.test(trimmed) ||
    /<a\b[^>]*\bhref\s*=/i.test(trimmed)
  ) {
    return parseNetscapeBookmarksHtml(trimmed)
  }
  // Last resort: try both
  const asChrome = parseChromeBookmarksJson(trimmed)
  if (asChrome.length > 0) return asChrome
  return parseNetscapeBookmarksHtml(trimmed)
}

function chromeUserDataCandidates(): string[] {
  const home = homedir()
  if (process.platform === 'darwin') {
    return [
      join(home, 'Library/Application Support/Google Chrome'),
      join(home, 'Library/Application Support/Chromium'),
      join(home, 'Library/Application Support/BraveSoftware/Brave-Browser'),
      join(home, 'Library/Application Support/Microsoft Edge')
    ]
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData/Local')
    return [
      join(local, 'Google/Chrome/User Data'),
      join(local, 'Chromium/User Data'),
      join(local, 'BraveSoftware/Brave-Browser/User Data'),
      join(local, 'Microsoft/Edge/User Data')
    ]
  }
  // linux
  const config = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  return [
    join(config, 'google-chrome'),
    join(config, 'chromium'),
    join(config, 'BraveSoftware/Brave-Browser'),
    join(config, 'microsoft-edge')
  ]
}

async function listProfileBookmarksFiles(userDataRoot: string): Promise<string[]> {
  if (!existsSync(userDataRoot)) return []
  const found: string[] = []
  const direct = join(userDataRoot, 'Bookmarks')
  if (existsSync(direct)) found.push(direct)

  let entries: string[] = []
  try {
    entries = await readdir(userDataRoot)
  } catch {
    return found
  }

  for (const name of entries) {
    if (name === 'System Profile' || name === 'Guest Profile') continue
    const bookmarksPath = join(userDataRoot, name, 'Bookmarks')
    if (existsSync(bookmarksPath)) found.push(bookmarksPath)
  }
  return found
}

export async function discoverChromeBookmarkFiles(): Promise<string[]> {
  const files: string[] = []
  for (const root of chromeUserDataCandidates()) {
    const found = await listProfileBookmarksFiles(root)
    files.push(...found)
  }
  return [...new Set(files)]
}

export async function loadChromeBookmarksFromProfiles(): Promise<ImportedBookmarkCandidate[]> {
  const files = await discoverChromeBookmarkFiles()
  const all: ImportedBookmarkCandidate[] = []
  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      all.push(...parseChromeBookmarksJson(raw))
    } catch {
      // Skip unreadable profiles
    }
  }
  return all
}

function firefoxProfilesRoots(): string[] {
  const home = homedir()
  if (process.platform === 'darwin') {
    return [join(home, 'Library/Application Support/Firefox/Profiles')]
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData/Roaming')
    return [join(appData, 'Mozilla/Firefox/Profiles')]
  }
  return [
    join(home, '.mozilla/firefox'),
    join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'firefox')
  ]
}

export async function discoverFirefoxPlacesFiles(): Promise<string[]> {
  const found: string[] = []
  for (const root of firefoxProfilesRoots()) {
    if (!existsSync(root)) continue
    let entries: string[] = []
    try {
      entries = await readdir(root)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name === 'Crash Reports' || name === 'Pending Pings') continue
      const places = join(root, name, 'places.sqlite')
      if (existsSync(places)) found.push(places)
    }
  }
  return found
}

async function queryFirefoxPlaces(placesPath: string): Promise<ImportedBookmarkCandidate[]> {
  // Copy first — Firefox may hold a lock on the live DB.
  const tempDir = await mkdtemp(join(tmpdir(), 'browsy-ff-'))
  const tempDb = join(tempDir, 'places.sqlite')
  try {
    await copyFile(placesPath, tempDb)
    // WAL companions if present
    for (const suffix of ['-wal', '-shm']) {
      const side = `${placesPath}${suffix}`
      if (existsSync(side)) {
        try {
          await copyFile(side, `${tempDb}${suffix}`)
        } catch {
          // ignore
        }
      }
    }

    const sql =
      "SELECT COALESCE(b.title, ''), p.url, b.dateAdded FROM moz_bookmarks b " +
      'JOIN moz_places p ON b.fk = p.id ' +
      "WHERE b.type = 1 AND p.url IS NOT NULL AND p.url NOT LIKE 'place:%' " +
      "AND p.url NOT LIKE 'about:%' AND p.url NOT LIKE 'javascript:%';"

    const { stdout } = await execFileAsync(
      'sqlite3',
      ['-batch', '-noheader', '-separator', '\t', tempDb, sql],
      { maxBuffer: 32 * 1024 * 1024, timeout: 15000 }
    )

    const out: ImportedBookmarkCandidate[] = []
    for (const line of stdout.split(/\r?\n/)) {
      if (!line) continue
      const tab1 = line.indexOf('\t')
      if (tab1 < 0) continue
      const tab2 = line.indexOf('\t', tab1 + 1)
      if (tab2 < 0) continue
      const title = line.slice(0, tab1)
      const url = line.slice(tab1 + 1, tab2)
      const dateAdded = line.slice(tab2 + 1)
      pushCandidate(out, title, url, firefoxDateToMs(dateAdded, 'us'))
    }
    return out
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function loadFirefoxBookmarksFromProfiles(): Promise<{
  candidates: ImportedBookmarkCandidate[]
  usedSqlite: boolean
}> {
  const placesFiles = await discoverFirefoxPlacesFiles()
  if (placesFiles.length === 0) {
    return { candidates: [], usedSqlite: false }
  }

  // Prefer sqlite3 CLI when available (no native module dependency).
  let sqliteAvailable = false
  try {
    await execFileAsync('sqlite3', ['-version'], { timeout: 3000 })
    sqliteAvailable = true
  } catch {
    sqliteAvailable = false
  }

  if (!sqliteAvailable) {
    return { candidates: [], usedSqlite: false }
  }

  const all: ImportedBookmarkCandidate[] = []
  for (const places of placesFiles) {
    try {
      all.push(...(await queryFirefoxPlaces(places)))
    } catch {
      // Skip profiles we can't read
    }
  }
  return { candidates: all, usedSqlite: true }
}

export async function loadBookmarksFromFilePath(filePath: string): Promise<ImportedBookmarkCandidate[]> {
  const raw = await readFile(filePath, 'utf8')
  return parseBookmarkImportFile(raw, filePath)
}

/** Collapse duplicate URLs within a candidate list (keep earliest createdAt / first title). */
export function dedupeCandidates(candidates: ImportedBookmarkCandidate[]): ImportedBookmarkCandidate[] {
  const byUrl = new Map<string, ImportedBookmarkCandidate>()
  for (const candidate of candidates) {
    if (!isAllowedNavigationUrl(candidate.url)) continue
    const existing = byUrl.get(candidate.url)
    if (!existing) {
      byUrl.set(candidate.url, candidate)
      continue
    }
    if (candidate.createdAt < existing.createdAt) {
      byUrl.set(candidate.url, { ...existing, createdAt: candidate.createdAt })
    }
  }
  return [...byUrl.values()]
}

export function emptyImportResult(
  source: BookmarkImportSource,
  patch: Partial<BookmarkImportResult> & Pick<BookmarkImportResult, 'message'>
): BookmarkImportResult {
  return {
    source,
    added: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    ...patch
  }
}

function formatImportMessage(
  source: BookmarkImportSource,
  added: number,
  skippedDuplicates: number,
  skippedInvalid: number
): string {
  const label = source === 'chrome' ? 'Chrome' : source === 'firefox' ? 'Firefox' : 'file'
  if (added === 0 && skippedDuplicates === 0 && skippedInvalid === 0) {
    return `No bookmarks found to import from ${label}.`
  }
  const parts = [`Imported ${added} from ${label}`]
  if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} already saved`)
  if (skippedInvalid > 0) parts.push(`${skippedInvalid} skipped`)
  return parts.join(' · ')
}

export type BookmarkFilePicker = () => Promise<string | null>

/**
 * Resolve candidates for an import source. Uses installed browser profiles when
 * possible; falls back to a file picker for HTML/JSON exports.
 */
export async function collectImportCandidates(
  source: BookmarkImportSource,
  pickFile: BookmarkFilePicker
): Promise<{ candidates: ImportedBookmarkCandidate[]; cancelled?: boolean; notFound?: boolean; hint?: string }> {
  if (source === 'chrome') {
    const fromProfiles = await loadChromeBookmarksFromProfiles()
    if (fromProfiles.length > 0) {
      return { candidates: fromProfiles }
    }
    const filePath = await pickFile()
    if (!filePath) return { candidates: [], cancelled: true }
    try {
      return { candidates: await loadBookmarksFromFilePath(filePath) }
    } catch {
      return {
        candidates: [],
        notFound: true,
        hint: 'Could not read that bookmarks file.'
      }
    }
  }

  if (source === 'firefox') {
    const { candidates, usedSqlite } = await loadFirefoxBookmarksFromProfiles()
    if (candidates.length > 0 && usedSqlite) {
      return { candidates }
    }
    const filePath = await pickFile()
    if (!filePath) {
      if (!usedSqlite) {
        return {
          candidates: [],
          cancelled: true,
          hint: 'Export bookmarks as HTML from Firefox, or install sqlite3 for automatic import.'
        }
      }
      return { candidates: [], cancelled: true }
    }
    try {
      return { candidates: await loadBookmarksFromFilePath(filePath) }
    } catch {
      return {
        candidates: [],
        notFound: true,
        hint: 'Could not read that bookmarks file.'
      }
    }
  }

  // Generic file import (HTML or Chrome JSON)
  const filePath = await pickFile()
  if (!filePath) return { candidates: [], cancelled: true }
  try {
    return { candidates: await loadBookmarksFromFilePath(filePath) }
  } catch {
    return {
      candidates: [],
      notFound: true,
      hint: 'Could not read that bookmarks file.'
    }
  }
}

export function buildImportResult(
  source: BookmarkImportSource,
  summary: { added: number; skippedDuplicates: number; skippedInvalid: number },
  meta?: { cancelled?: boolean; notFound?: boolean; hint?: string }
): BookmarkImportResult {
  if (meta?.cancelled) {
    return emptyImportResult(source, {
      message: meta.hint ?? 'Import cancelled.',
      cancelled: true
    })
  }
  if (meta?.notFound) {
    return emptyImportResult(source, {
      message: meta.hint ?? 'No bookmarks found.',
      notFound: true
    })
  }
  if (summary.added === 0 && summary.skippedDuplicates === 0 && summary.skippedInvalid === 0 && meta?.hint) {
    return emptyImportResult(source, { message: meta.hint, notFound: true })
  }
  return {
    source,
    ...summary,
    message: formatImportMessage(source, summary.added, summary.skippedDuplicates, summary.skippedInvalid)
  }
}

/** Exported for tests / tooling — dirname of a places.sqlite path. */
export function firefoxProfileDirFromPlaces(placesPath: string): string {
  return dirname(placesPath)
}
