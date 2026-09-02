/**
 * Smoke checks for bookmark import parsers (no Electron).
 * Run: npx tsx scripts/smoke-bookmark-import.ts
 */
import { readFileSync } from 'fs'
import {
  parseChromeBookmarksJson,
  parseNetscapeBookmarksHtml,
  dedupeCandidates
} from '../src/main/services/bookmark-import'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

const chrome = parseChromeBookmarksJson(
  readFileSync('/tmp/bookmark-import-fixtures/chrome-bookmarks.json', 'utf8')
)
assert(chrome.length === 3, `expected 3 chrome bookmarks, got ${chrome.length}`)

const html = parseNetscapeBookmarksHtml(
  readFileSync('/tmp/bookmark-import-fixtures/firefox-bookmarks.html', 'utf8')
)
assert(html.length === 4, `expected 4 html links, got ${html.length}`)

const deduped = dedupeCandidates([...chrome, ...html])
assert(deduped.every((b) => b.url.startsWith('http')), 'non-http should be dropped')
assert(deduped.length === 5, `expected 5 unique http bookmarks, got ${deduped.length}`)

console.log('smoke-bookmark-import: ok', { chrome: chrome.length, html: html.length, deduped: deduped.length })
