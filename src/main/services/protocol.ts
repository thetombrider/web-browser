import { protocol } from 'electron'
import { getBookmarks, getRecentSites, getSettings, setSettings } from './store'
import { renderBookmarksPage } from './bookmarks-page'
import { renderShortcutsPage } from './shortcuts-page'
import { faviconUrlForPage, isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT,
  BROWSY_API_PORT,
  BROWSY_CDP_PORT,
  HOME_PAGE_TOP_PADDING,
  RECENT_SITES_COUNT,
  type RestoreSession,
  type SearchEngine,
  type Settings
} from '../../shared/types'

const HOME_BOOKMARKS_COUNT = 8
const HOME_TIP_SHORTCUTS = [
  ['Ctrl/Cmd + L', 'Address bar'],
  ['Ctrl/Cmd + T', 'New tab'],
  ['Ctrl/Cmd + D', 'Bookmark page'],
  ['Ctrl/Cmd + B', 'Bookmarks'],
  ['Ctrl/Cmd + /', 'All shortcuts']
] as const

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getSiteName(title: string, url: string): string {
  const trimmedTitle = title.trim()
  if (trimmedTitle && !/^https?:\/\//i.test(trimmedTitle)) return trimmedTitle

  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

function letterForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')[0]?.toUpperCase() ?? '?'
  } catch {
    return '?'
  }
}

function renderSiteGlyph(url: string): string {
  const letter = escapeHtml(letterForUrl(url))
  const favicon = faviconUrlForPage(url)
  if (!favicon) {
    return `<div class="glyph" aria-hidden="true">${letter}</div>`
  }
  return `<div class="glyph" aria-hidden="true">
    <span class="glyph-letter">${letter}</span>
    <img class="favicon" src="${escapeHtml(favicon)}" alt="" width="16" height="16" loading="lazy" decoding="async" onerror="this.remove()" />
  </div>`
}

function baseStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: ${APP_SURFACE_DARK};
      color: #f4f4f5;
      min-height: 100vh;
      padding: ${HOME_PAGE_TOP_PADDING}px 32px 48px;
    }
    @media (prefers-color-scheme: light) {
      body { background: ${APP_SURFACE_LIGHT}; color: #18181b; }
      .muted { color: #71717a; }
      .site:hover, .site.selected, .home-card:hover, .home-card.selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .glyph { background: rgba(0,0,0,0.06); color: #52525b; }
      .tip-row:hover { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .tip-row kbd { background: rgba(0,0,0,0.06); }
      .btn { background: #2563eb; }
    }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin-bottom: 28px;
    }
    .muted { color: #a1a1aa; margin-bottom: 28px; font-size: 0.9rem; }
    .home-layout {
      display: grid;
      grid-template-columns: minmax(260px, 520px) minmax(240px, 380px);
      gap: 48px 56px;
      align-items: start;
      max-width: 1000px;
    }
    @media (max-width: 820px) {
      .home-layout { grid-template-columns: 1fr; gap: 36px; }
    }
    .home-col { min-width: 0; }
    .col-label {
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 10px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .site {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.12s ease;
    }
    .site:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .site.selected { background: ${APP_SURFACE_ELEVATED_DARK}; outline: 1px solid rgba(255,255,255,0.16); }
    .home-cards {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 24px;
    }
    .home-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.12s ease;
    }
    .home-card:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .home-card.selected { background: ${APP_SURFACE_ELEVATED_DARK}; outline: 1px solid rgba(255,255,255,0.16); }
    .card-glyph {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #a1a1aa;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .card-meta { min-width: 0; }
    .card-title { font-weight: 500; font-size: 0.925rem; }
    .card-sub { font-size: 0.75rem; color: #71717a; }
    .glyph {
      position: relative;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #a1a1aa;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
      overflow: hidden;
    }
    .glyph-letter { line-height: 1; }
    .favicon {
      position: absolute;
      inset: 0;
      margin: auto;
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    .site-meta { min-width: 0; }
    .site-title {
      font-weight: 500;
      font-size: 0.925rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .site-url {
      font-size: 0.75rem;
      color: #71717a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .col-footer {
      display: inline-block;
      margin-top: 12px;
      padding: 0 12px;
      font-size: 0.8rem;
      color: #71717a;
      text-decoration: none;
    }
    .col-footer:hover { color: inherit; }
    .tip-list { display: flex; flex-direction: column; gap: 2px; }
    .tip-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.875rem;
    }
    .tip-row:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .tip-row kbd {
      background: rgba(255,255,255,0.08);
      border-radius: 6px;
      color: #a1a1aa;
      font-family: "IBM Plex Mono", Menlo, Consolas, monospace;
      font-size: 0.72rem;
      padding: 4px 7px;
      white-space: nowrap;
    }
    .empty { color: #71717a; font-size: 0.9rem; max-width: 420px; line-height: 1.5; padding: 0 12px; }
    .error-wrap { max-width: 520px; padding-top: 24px; }
    .error-title { font-size: 1.35rem; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 8px; }
    .error-msg { margin-bottom: 12px; line-height: 1.5; color: #a1a1aa; }
    .error-code { font-size: 0.75rem; color: #71717a; margin-bottom: 24px; font-family: "IBM Plex Mono", Menlo, Consolas, monospace; }
    .actions { display: flex; gap: 10px; }
    .btn {
      display: inline-block;
      padding: 8px 14px;
      background: #3b82f6;
      color: #fff;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .btn-ghost {
      display: inline-block;
      padding: 8px 14px;
      color: inherit;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.85rem;
      opacity: 0.7;
    }
    .btn-ghost:hover { opacity: 1; }
    .settings-wrap { max-width: 520px; }
    .section { margin-bottom: 28px; }
    .section-label {
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 10px;
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .option {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      font-size: 0.875rem;
      transition: background 0.12s ease, opacity 0.12s ease;
      opacity: 0.75;
    }
    .option:hover { background: ${APP_SURFACE_ELEVATED_DARK}; opacity: 1; }
    .option.selected {
      background: ${APP_SURFACE_ELEVATED_DARK};
      font-weight: 500;
      opacity: 1;
    }
    @media (prefers-color-scheme: light) {
      .option:hover { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .option.selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
    }
    .dev-toggle {
      display: inline-block;
      margin-top: 8px;
      font-size: 0.8rem;
      color: #71717a;
      text-decoration: none;
    }
    .dev-toggle:hover { color: inherit; }
    .dev-panel {
      margin-top: 12px;
      padding: 14px 16px;
      border-radius: 8px;
      background: ${APP_SURFACE_ELEVATED_DARK};
      font-size: 0.8rem;
      line-height: 1.65;
      color: #a1a1aa;
    }
    @media (prefers-color-scheme: light) {
      .dev-panel { background: ${APP_SURFACE_ELEVATED_LIGHT}; color: #52525b; }
    }
    .dev-panel p { margin-bottom: 4px; }
    .dev-panel p:last-child { margin-bottom: 0; }
    .footer-link {
      display: inline-block;
      margin-top: 8px;
      font-size: 0.85rem;
      color: #71717a;
      text-decoration: none;
    }
    .footer-link:hover { color: inherit; }
  `
}

function renderHomeSiteRow(url: string, title: string): string {
  return `
        <a class="site" href="${escapeHtml(url)}">
          ${renderSiteGlyph(url)}
          <div class="site-meta">
            <div class="site-title">${escapeHtml(getSiteName(title, url))}</div>
            <div class="site-url">${escapeHtml(url)}</div>
          </div>
        </a>`
}

function renderHomeRightColumn(): string {
  const bookmarks = getBookmarks()
    .filter((bookmark) => isAllowedNavigationUrl(bookmark.url))
    .slice(0, HOME_BOOKMARKS_COUNT)

  if (bookmarks.length > 0) {
    const rows = bookmarks.map((bookmark) => renderHomeSiteRow(bookmark.url, bookmark.title)).join('')
    return `
    <section class="home-col" aria-label="Bookmarks">
      <div class="col-label">Bookmarks</div>
      <div class="list">${rows}</div>
      <a class="col-footer" href="browsy://bookmarks">View all bookmarks</a>
    </section>`
  }

  const tips = HOME_TIP_SHORTCUTS.map(
    ([keys, label]) => `
        <div class="tip-row">
          <span>${escapeHtml(label)}</span>
          <kbd>${escapeHtml(keys)}</kbd>
        </div>`
  ).join('')

  return `
    <section class="home-col" aria-label="Shortcuts">
      <div class="col-label">Shortcuts</div>
      <div class="tip-list">${tips}</div>
      <a class="col-footer" href="browsy://shortcuts">Full shortcut list</a>
    </section>`
}

export function renderHomePage(): string {
  const settings = getSettings()
  const recent = (settings.homepage === 'blank' ? [] : getRecentSites(RECENT_SITES_COUNT)).filter((site) =>
    isAllowedNavigationUrl(site.url)
  ).slice(0, 5)
  const sitesHtml =
    recent.length === 0
      ? '<p class="empty">Type a URL or search above to get started.</p>'
      : `<div class="list">${recent.map((site) => renderHomeSiteRow(site.url, site.title)).join('')}</div>`

  const navCards = `
  <div class="home-cards">
    <a class="home-card" href="browsy://shortcuts" data-nav>
      <div class="card-glyph">⌘</div>
      <div class="card-meta">
        <div class="card-title">Shortcuts</div>
        <div class="card-sub">Keyboard reference</div>
      </div>
    </a>
    <a class="home-card" href="browsy://bookmarks" data-nav>
      <div class="card-glyph">★</div>
      <div class="card-meta">
        <div class="card-title">Bookmarks</div>
        <div class="card-sub">Saved pages</div>
      </div>
    </a>
    <a class="home-card" href="browsy://settings" data-nav>
      <div class="card-glyph">⚙</div>
      <div class="card-meta">
        <div class="card-title">Settings</div>
        <div class="card-sub">Preferences</div>
      </div>
    </a>
  </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Browsy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="brand">Browsy</div>
  <div class="home-layout">
    <section class="home-col" aria-label="Recent">
      <div class="col-label">${recent.length === 0 ? 'Home' : 'Recent'}</div>
      ${sitesHtml}
      ${navCards}
    </section>
    ${renderHomeRightColumn()}
  </div>
  <script>${homeClientScript()}</script>
</body>
</html>`
}

function homeClientScript(): string {
  return `
    (function () {
      var rows = Array.from(document.querySelectorAll('.site, .home-card'));
      if (!rows.length) return;
      var selectedIndex = -1;

      function setSelected(index) {
        rows.forEach(function (row) {
          row.classList.remove('selected');
          row.removeAttribute('aria-current');
        });
        if (index < 0) {
          selectedIndex = -1;
          return null;
        }
        selectedIndex = index;
        var selected = rows[selectedIndex];
        selected.classList.add('selected');
        selected.setAttribute('aria-current', 'true');
        selected.scrollIntoView({ block: 'nearest' });
        return selected;
      }

      document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          var next = event.key === 'ArrowDown'
            ? (selectedIndex + 1) % rows.length
            : (selectedIndex <= 0 ? rows.length - 1 : selectedIndex - 1);
          setSelected(next);
        } else if (event.key === 'Enter' || event.key === 'NumpadEnter') {
          if (selectedIndex < 0) return;
          var selected = rows[selectedIndex];
          if (!selected) return;
          event.preventDefault();
          selected.click();
        }
      });
    })();
  `
}

function settingsPageUrl(params: Record<string, string>, showDev: boolean): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  if (showDev) search.set('dev', '1')
  const qs = search.toString()
  return `browsy://settings${qs ? `?${qs}` : ''}`
}

function renderOption(
  param: string,
  value: string,
  label: string,
  current: string,
  showDev: boolean
): string {
  const selected = current === value
  if (selected) {
    return `<span class="option selected">${escapeHtml(label)}</span>`
  }
  const href = escapeHtml(settingsPageUrl({ [param]: value }, showDev))
  return `<a class="option" href="${href}">${escapeHtml(label)}</a>`
}

function applySettingsFromQuery(url: URL): void {
  const patch: Partial<Settings> = {}
  const homepage = url.searchParams.get('homepage')
  if (homepage === 'recent' || homepage === 'blank') patch.homepage = homepage
  const searchEngine = url.searchParams.get('searchEngine')
  if (searchEngine === 'google' || searchEngine === 'duckduckgo' || searchEngine === 'bing') {
    patch.searchEngine = searchEngine as SearchEngine
  }
  const restoreSession = url.searchParams.get('restoreSession')
  if (restoreSession === 'always' || restoreSession === 'never') {
    patch.restoreSession = restoreSession as RestoreSession
  }
  if (Object.keys(patch).length > 0) setSettings(patch)
}

export function renderSettingsPage(showDev = false): string {
  const settings = getSettings()
  const devToggleHref = escapeHtml(settingsPageUrl({}, !showDev))
  const devToggleLabel = showDev ? 'Hide developer' : 'Developer'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Settings — Browsy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="settings-wrap">
    <div class="brand">Settings</div>
    <p class="muted">Preferences</p>

    <div class="section">
      <div class="section-label">New tab</div>
      <div class="options">
        ${renderOption('homepage', 'recent', 'Recent sites', settings.homepage, showDev)}
        ${renderOption('homepage', 'blank', 'Blank', settings.homepage, showDev)}
      </div>
    </div>

    <div class="section">
      <div class="section-label">Search engine</div>
      <div class="options">
        ${renderOption('searchEngine', 'google', 'Google', settings.searchEngine, showDev)}
        ${renderOption('searchEngine', 'duckduckgo', 'DuckDuckGo', settings.searchEngine, showDev)}
        ${renderOption('searchEngine', 'bing', 'Bing', settings.searchEngine, showDev)}
      </div>
    </div>

    <div class="section">
      <div class="section-label">On startup</div>
      <div class="options">
        ${renderOption('restoreSession', 'always', 'Restore previous tabs', settings.restoreSession, showDev)}
        ${renderOption('restoreSession', 'never', 'Start fresh', settings.restoreSession, showDev)}
      </div>
    </div>

    <div class="section">
      <a class="dev-toggle" href="${devToggleHref}">${devToggleLabel}</a>
      ${
        showDev
          ? `<div class="dev-panel">
        <p>Agent API · http://127.0.0.1:${BROWSY_API_PORT} (off by default; token required)</p>
        <p>Enable API · BROWSY_ENABLE_API=1 or BROWSY_API_TOKEN</p>
        <p>CDP · localhost:${BROWSY_CDP_PORT} (off by default)</p>
        <p>Enable CDP · BROWSY_ENABLE_CDP=1 or BROWSY_CDP_PORT</p>
        <p>MCP · BROWSY_API_TOKEN=… npm run mcp</p>
      </div>`
          : ''
      }
    </div>

    <a class="footer-link" href="browsy://home">← Home</a>
  </div>
</body>
</html>`
}

export function renderErrorPage(url: string, errorCode: number, errorDescription: string): string {
  const retryTarget = sanitizeNavigationUrl(url) ?? 'browsy://home'
  const retryHref = escapeHtml(retryTarget)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page not available — Browsy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="error-wrap">
    <div class="error-title">Can't reach this page</div>
    <p class="error-msg">${escapeHtml(errorDescription)}</p>
    <p class="error-code">${errorCode || 'Error'} · ${escapeHtml(url)}</p>
    <div class="actions">
      <a class="btn" href="${retryHref}">Try again</a>
      <a class="btn-ghost" href="browsy://home">Home</a>
    </div>
  </div>
</body>
</html>`
}

export function setupProtocolHandler(): void {
  protocol.handle('browsy', async (request) => {
    const url = new URL(request.url)

    if (url.hostname === 'home' || url.pathname === '/home') {
      return new Response(renderHomePage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.hostname === 'bookmarks' || url.pathname === '/bookmarks') {
      return new Response(renderBookmarksPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.hostname === 'settings' || url.pathname === '/settings') {
      applySettingsFromQuery(url)
      const showDev = url.searchParams.get('dev') === '1'
      return new Response(renderSettingsPage(showDev), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.hostname === 'shortcuts' || url.pathname === '/shortcuts') {
      return new Response(renderShortcutsPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.hostname === 'error') {
      const failedUrl = sanitizeNavigationUrl(url.searchParams.get('url') ?? '') ?? ''
      const code = Number(url.searchParams.get('code') ?? '0')
      const desc = url.searchParams.get('desc') ?? 'Unknown error'
      return new Response(renderErrorPage(failedUrl, code, desc), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    return new Response('Not found', { status: 404 })
  })
}
