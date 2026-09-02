/**
 * Lightweight smoke checks for bookmark import parsers (no Electron).
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

const chromeRaw = readFileSync('/tmp/bookmark-import-fixtures/chrome-bookmarks.json', 'utf8')
const chrome = parseChromeBookmarksJson(chromeRaw)
assert(chrome.length === 3, `expected 3 chrome bookmarks, got ${chrome.length}`)
assert(
  chrome.some((b) => b.url === 'https://nested.example.org/path'),
  'nested chrome folder url missing'
)

const htmlRaw = readFileSync('/tmp/bookmark-import-fixtures/firefox-bookmarks.html', 'utf8')
const html = parseNetscapeBookmarksHtml(htmlRaw)
assert(html.length === 4, `expected 4 html links (incl ftp), got ${html.length}`)

const deduped = dedupeCandidates([
  ...chrome,
  ...html,
  { title: 'Dup', url: 'https://example.com/', createdAt: 1 }
])
// ftp filtered; example.com appears in both chrome + html → one; github, nested, mozilla, mdn
assert(
  deduped.every((b) => b.url.startsWith('http')),
  'dedupe should drop non-http(s)'
)
assert(
  deduped.filter((b) => b.url === 'https://example.com/' || b.url === 'https://example.com').length <= 1,
  'example.com should be unique'
)

console.log('smoke-bookmark-import: ok', {
  chrome: chrome.length,
  html: html.length,
  deduped: deduped.length
})
