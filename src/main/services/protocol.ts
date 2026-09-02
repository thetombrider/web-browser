import { protocol } from 'electron'
import { clearSessionCache } from './cache'
import { localFontFaceCss, serveLocalFont } from './fonts'
import { getBookmarks, getPinnedBookmarks, getRecentSites, getSettings, setSettings } from './store'
import { applyBookmarksPageQuery, renderBookmarksPage } from './bookmarks-page'
import { renderShortcutsPage } from './shortcuts-page'
import { getShortcutsPageShortcut } from '../../shared/shortcuts'
import { faviconUrlForPage, isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import { AI_ASSISTANT_HOME_URLS } from '../../shared/ai-assistant'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT,
  BROWSY_API_PORT,
  BROWSY_CDP_PORT,
  HOME_PAGE_TOP_PADDING,
  RECENT_SITES_COUNT,
  SEARCH_ENGINE_URLS,
  type AiAssistant,
  type RestoreSession,
  type SearchEngine,
  type Settings,
  type ThemeMode
} from '../../shared/types'

/** Max items per stacked panel when bookmarks + shortcuts share the right column. */
const HOME_PANEL_COUNT_MAX = 4
const HOME_TIP_SHORTCUTS = [
  ['Ctrl/Cmd + L', 'Address bar'],
  ['Ctrl/Cmd + T', 'New tab'],
  ['Ctrl/Cmd + D', 'Bookmark page'],
  ['Ctrl/Cmd + Shift + P', 'Pin page'],
  ['Ctrl/Cmd + B', 'Bookmarks'],
  [getShortcutsPageShortcut(process.platform).label, 'All shortcuts']
] as const

function lightThemeStart(theme: ThemeMode): string {
  if (theme === 'light') return ''
  if (theme === 'dark') return '@media not all {'
  return '@media (prefers-color-scheme: light) {'
}

function lightThemeEnd(theme: ThemeMode): string {
  return theme === 'light' ? '' : '}'
}

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
    return `<span class="glyph" aria-hidden="true">${letter}</span>`
  }
  return `<span class="glyph" aria-hidden="true">
    <span class="glyph-letter">${letter}</span>
    <img class="favicon" src="${escapeHtml(favicon)}" alt="" width="16" height="16" loading="lazy" decoding="async" onerror="this.remove()" />
  </span>`
}

function baseStyles(theme: ThemeMode): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: ${APP_SURFACE_DARK};
      color: #f4f4f5;
      min-height: 100vh;
      padding: ${HOME_PAGE_TOP_PADDING}px 32px 48px;
    }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin-bottom: 28px;
    }
    .greeting {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      text-align: center;
      margin: 8px 0 36px;
    }
    .greeting:has(+ .pinned-sites) { margin-bottom: 16px; }
    .pinned-sites {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      width: 100%;
      max-width: 920px;
      margin: 0 auto 28px;
    }
    .pinned-site {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      text-decoration: none;
      color: inherit;
      transition: background 0.12s ease;
    }
    .pinned-site:hover, .pinned-site.selected { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .pinned-site .glyph { width: 22px; height: 22px; font-size: 10px; }
    .muted { color: #a1a1aa; margin-bottom: 28px; font-size: 0.9rem; }
    .home-layout {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) minmax(240px, 1fr);
      gap: 48px 56px;
      align-items: start;
      max-width: 920px;
      margin: 0 auto;
    }
    @media (max-width: 820px) {
      .home-layout { grid-template-columns: 1fr; gap: 36px; }
    }
    .home-col {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .home-col > .list,
    .home-col > .home-cards,
    .home-col > .empty,
    .home-col > .right-stack,
    .home-col > .right-panel,
    .home-col > .col-label {
      width: 100%;
      max-width: 360px;
    }
    .col-label {
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 10px;
      text-align: left;
      padding: 0 12px;
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
    .home-card.selected, .home-card.kb-selected { background: ${APP_SURFACE_ELEVATED_DARK}; outline: 1px solid rgba(255,255,255,0.16); }
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
    .right-stack {
      display: flex;
      flex-direction: column;
      gap: 28px;
      min-width: 0;
      align-items: center;
    }
    .right-panel {
      min-width: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .right-panel > .list,
    .right-panel > .tip-list,
    .right-panel > .col-label {
      width: 100%;
    }
    .col-footer {
      display: inline-block;
      margin-top: 10px;
      padding: 0 12px;
      font-size: 0.8rem;
      color: #71717a;
      text-decoration: none;
      text-align: center;
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
    /* Stacked panels: show 3 by default, 4th when the viewport is tall enough. */
    .clip-list > .clip-item:nth-child(n+4) { display: none; }
    @media (min-height: 760px) {
      .clip-list > .clip-item:nth-child(4) { display: flex; }
    }
    .empty { color: #71717a; font-size: 0.9rem; max-width: 420px; line-height: 1.5; padding: 0 12px; text-align: center; }
    body.error-page { display: flex; align-items: center; justify-content: center; text-align: center; }
    .error-wrap { width: 100%; max-width: 520px; padding-top: 24px; }
    .error-title { font-size: 1.35rem; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 8px; }
    .error-msg { margin-bottom: 12px; line-height: 1.5; color: #a1a1aa; }
    .error-code { font-size: 0.75rem; color: #71717a; margin-bottom: 24px; font-family: "IBM Plex Mono", Menlo, Consolas, monospace; }
    .actions { display: flex; justify-content: center; gap: 10px; }
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
    .btn.selected, .btn-ghost.selected { outline: 1px solid rgba(255,255,255,0.5); outline-offset: 2px; opacity: 1; }
    .settings-section {
      width: 100%;
      max-width: 360px;
      margin-bottom: 28px;
    }
    .settings-section:last-child { margin-bottom: 0; }
    .settings-section .home-cards { margin-top: 0; }
    .settings-home {
      display: block;
      max-width: 920px;
      margin: 28px auto 0;
      padding: 6px 12px;
      text-align: left;
      box-sizing: border-box;
    }
    @media (max-width: 820px) {
      .settings-home { max-width: 360px; }
    }
    .options {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
    }
    .option {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      font-size: 0.925rem;
      transition: background 0.12s ease;
    }
    .option:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .option.selected {
      background: ${APP_SURFACE_ELEVATED_DARK};
      font-weight: 500;
      outline: 1px solid rgba(255,255,255,0.16);
    }
    .option.kb-selected {
      background: ${APP_SURFACE_ELEVATED_DARK};
      outline: 1px solid rgba(255,255,255,0.16);
    }
    .option-check {
      margin-left: auto;
      color: #71717a;
      font-size: 0.8rem;
      font-weight: 500;
      flex-shrink: 0;
    }
    .option-label {
      min-width: 0;
    }
    ${lightThemeStart(theme)}
      .option:hover, .option.selected, .option.kb-selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .option.selected, .option.kb-selected { outline: 1px solid rgba(0,0,0,0.08); }
    ${lightThemeEnd(theme)}
    .dev-toggle {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.925rem;
      color: inherit;
      text-decoration: none;
      transition: background 0.12s ease;
    }
    .dev-toggle:hover, .dev-toggle.kb-selected { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .dev-toggle.kb-selected { outline: 1px solid rgba(255,255,255,0.16); }
    .dev-toggle-sub { margin-left: auto; font-size: 0.75rem; color: #71717a; }
    ${lightThemeStart(theme)}
      .dev-toggle:hover, .dev-toggle.kb-selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .dev-toggle.kb-selected { outline: 1px solid rgba(0,0,0,0.08); }
    ${lightThemeEnd(theme)}
    .dev-panel {
      margin-top: 8px;
      padding: 14px 16px;
      border-radius: 8px;
      background: ${APP_SURFACE_ELEVATED_DARK};
      font-size: 0.8rem;
      line-height: 1.65;
      color: #a1a1aa;
    }
    ${lightThemeStart(theme)}
      .dev-panel { background: ${APP_SURFACE_ELEVATED_LIGHT}; color: #52525b; }
    ${lightThemeEnd(theme)}
    .dev-panel p { margin-bottom: 4px; }
    .dev-panel p:last-child { margin-bottom: 0; }
    .footer-link {
      display: inline-block;
      margin-top: 8px;
      font-size: 0.85rem;
      color: #71717a;
      text-decoration: none;
      border-radius: 8px;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .footer-link:hover { color: inherit; }
    .footer-link.kb-selected {
      color: inherit;
      background: ${APP_SURFACE_ELEVATED_DARK};
      outline: 1px solid rgba(255,255,255,0.16);
    }
    ${lightThemeStart(theme)}
      .footer-link.kb-selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; outline: 1px solid rgba(0,0,0,0.08); }
    ${lightThemeEnd(theme)}
    ${lightThemeStart(theme)}
      body { background: ${APP_SURFACE_LIGHT}; color: #18181b; }
      .muted { color: #71717a; }
      .site:hover, .site.selected, .home-card:hover, .home-card.selected, .home-card.kb-selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .site.selected, .home-card.selected, .home-card.kb-selected { outline: 1px solid rgba(0,0,0,0.08); }
      .pinned-site:hover, .pinned-site.selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .glyph { background: rgba(0,0,0,0.06); color: #52525b; }
      .tip-row:hover { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .tip-row kbd { background: rgba(0,0,0,0.06); }
      .btn { background: #2563eb; }
    ${lightThemeEnd(theme)}
  `
}

function renderPinnedSitesBar(): string {
  const pinned = getPinnedBookmarks()
  if (pinned.length === 0) return ''
  const buttons = pinned
    .map((site) => {
      const title = escapeHtml(getSiteName(site.title, site.url))
      return `
        <a class="pinned-site" href="${escapeHtml(site.url)}" title="${title}" aria-label="${title}">
          ${renderSiteGlyph(site.url)}
        </a>`
    })
    .join('')
  return `<div class="pinned-sites" aria-label="Pinned sites">${buttons}</div>`
}

function renderHomeSiteRow(url: string, title: string, clip = false): string {
  const clipClass = clip ? ' clip-item' : ''
  return `
        <a class="site${clipClass}" href="${escapeHtml(url)}">
          ${renderSiteGlyph(url)}
          <div class="site-meta">
            <div class="site-title">${escapeHtml(getSiteName(title, url))}</div>
            <div class="site-url">${escapeHtml(url)}</div>
          </div>
        </a>`
}

function renderShortcutsPanel(count: number, clip: boolean): string {
  const tips = HOME_TIP_SHORTCUTS.slice(0, count)
    .map(
      ([keys, label]) => `
        <div class="tip-row${clip ? ' clip-item' : ''}">
          <span>${escapeHtml(label)}</span>
          <kbd>${escapeHtml(keys)}</kbd>
        </div>`
    )
    .join('')

  return `
      <div class="right-panel" aria-label="Shortcuts">
        <div class="col-label">Shortcuts</div>
        <div class="tip-list${clip ? ' clip-list' : ''}">${tips}</div>
        <a class="col-footer" href="browsy://shortcuts">View all shortcuts</a>
      </div>`
}

function renderBookmarksPanel(bookmarks: { url: string; title: string }[], clip: boolean): string {
  const rows = bookmarks.map((bookmark) => renderHomeSiteRow(bookmark.url, bookmark.title, clip)).join('')
  return `
      <div class="right-panel" aria-label="Bookmarks">
        <div class="col-label">Bookmarks</div>
        <div class="list${clip ? ' clip-list' : ''}">${rows}</div>
        <a class="col-footer" href="browsy://bookmarks">View all bookmarks</a>
      </div>`
}

function renderHomeRightColumn(): string {
  const bookmarks = getBookmarks()
    .filter((bookmark) => isAllowedNavigationUrl(bookmark.url))
    .slice(0, HOME_PANEL_COUNT_MAX)

  if (bookmarks.length === 0) {
    return `
    <section class="home-col">
      ${renderShortcutsPanel(HOME_TIP_SHORTCUTS.length, false)}
    </section>`
  }

  return `
    <section class="home-col">
      <div class="right-stack">
        ${renderBookmarksPanel(bookmarks, true)}
        ${renderShortcutsPanel(HOME_PANEL_COUNT_MAX, true)}
      </div>
    </section>`
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Good night'
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
  const greeting = greetingForHour(new Date().getHours())

  const navCards = `
  <div class="home-cards">
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
  <style>${localFontFaceCss()}</style>
   <style>${baseStyles(settings.theme)}</style>
</head>
<body>
  <div class="greeting" id="greeting" aria-live="polite">${escapeHtml(greeting)}</div>
  ${renderPinnedSitesBar()}
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
      var greetingEl = document.getElementById('greeting');
      function greetingForHour(hour) {
        if (hour >= 5 && hour < 12) return 'Good morning';
        if (hour >= 12 && hour < 17) return 'Good afternoon';
        if (hour >= 17 && hour < 21) return 'Good evening';
        return 'Good night';
      }
      function updateGreeting() {
        if (!greetingEl) return;
        greetingEl.textContent = greetingForHour(new Date().getHours());
      }
      updateGreeting();
      setInterval(updateGreeting, 60000);

      var rows = Array.from(document.querySelectorAll('.pinned-site, .site, .home-card'));
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
        } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selectedIndex >= 0) {
          var current = rows[selectedIndex];
          if (!current || !current.classList.contains('pinned-site')) return;
          event.preventDefault();
          var pins = rows.filter(function (row) { return row.classList.contains('pinned-site'); });
          var pinIndex = pins.indexOf(current);
          if (pinIndex < 0) return;
          var nextPin = event.key === 'ArrowRight'
            ? (pinIndex + 1) % pins.length
            : (pinIndex <= 0 ? pins.length - 1 : pinIndex - 1);
          setSelected(rows.indexOf(pins[nextPin]));
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
  showDev: boolean,
  iconUrl?: string
): string {
  const selected = current === value
  const check = selected ? '<span class="option-check" aria-hidden="true">✓</span>' : ''
  const glyph = iconUrl ? renderSiteGlyph(iconUrl) : ''
  const content = `${glyph}<span class="option-label">${escapeHtml(label)}</span>${check}`
  if (selected) {
    return `<span class="option selected" aria-current="true">${content}</span>`
  }
  const href = escapeHtml(settingsPageUrl({ [param]: value }, showDev))
  return `<a class="option" href="${href}">${content}</a>`
}

function renderSettingsSection(label: string, optionsHtml: string): string {
  return `
      <div class="settings-section">
        <div class="col-label">${escapeHtml(label)}</div>
        <div class="options">${optionsHtml}</div>
      </div>`
}

function settingsClientScript(replaceUrl?: string): string {
  const replaceHistory = replaceUrl
    ? `try { history.replaceState(null, '', ${JSON.stringify(replaceUrl)}); } catch (e) {}`
    : ''
  return `
    (function () {
      ${replaceHistory}
      var rows = Array.from(document.querySelectorAll('a.option, a.dev-toggle, a.home-card, a.footer-link'));
      if (!rows.length) return;
      var selectedIndex = -1;

      function setSelected(index) {
        rows.forEach(function (row) {
          row.classList.remove('kb-selected');
          row.removeAttribute('aria-current');
        });
        if (index < 0) {
          selectedIndex = -1;
          return null;
        }
        selectedIndex = index;
        var selected = rows[selectedIndex];
        selected.classList.add('kb-selected');
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

function applySettingsFromQuery(url: URL): boolean {
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
  const theme = url.searchParams.get('theme')
  if (theme === 'light' || theme === 'dark' || theme === 'system') patch.theme = theme
  const linkPreview = url.searchParams.get('linkPreview')
  if (linkPreview === 'on') patch.linkPreview = true
  if (linkPreview === 'off') patch.linkPreview = false
  const aiAssistant = url.searchParams.get('aiAssistant')
  if (aiAssistant === 'chatgpt' || aiAssistant === 'claude' || aiAssistant === 'gemini') {
    patch.aiAssistant = aiAssistant as AiAssistant
  }
  if (Object.keys(patch).length === 0) return false
  setSettings(patch)
  return true
}

export function renderSettingsPage(showDev = false, cacheCleared = false): string {
  const settings = getSettings()
  const devToggleHref = escapeHtml(settingsPageUrl({}, !showDev))
  const devToggleLabel = showDev ? 'Hide developer' : 'Developer'
  const devToggleSub = showDev ? 'Visible' : 'Hidden'
  const clearCacheHref = escapeHtml(settingsPageUrl({ clearCache: '1' }, showDev))

  const newTabOptions = [
    renderOption('homepage', 'recent', 'Recent sites', settings.homepage, showDev),
    renderOption('homepage', 'blank', 'Blank', settings.homepage, showDev)
  ].join('')

  const searchOptions = [
    renderOption('searchEngine', 'google', 'Google', settings.searchEngine, showDev, SEARCH_ENGINE_URLS.google),
    renderOption(
      'searchEngine',
      'duckduckgo',
      'DuckDuckGo',
      settings.searchEngine,
      showDev,
      SEARCH_ENGINE_URLS.duckduckgo
    ),
    renderOption('searchEngine', 'bing', 'Bing', settings.searchEngine, showDev, SEARCH_ENGINE_URLS.bing)
  ].join('')

  const startupOptions = [
    renderOption('restoreSession', 'always', 'Restore previous tabs', settings.restoreSession, showDev),
    renderOption('restoreSession', 'never', 'Start fresh', settings.restoreSession, showDev)
  ].join('')

  const themeOptions = [
    renderOption('theme', 'light', 'Light', settings.theme, showDev),
    renderOption('theme', 'dark', 'Dark', settings.theme, showDev),
    renderOption('theme', 'system', 'System', settings.theme, showDev)
  ].join('')

  const linkPreviewOptions = [
    renderOption('linkPreview', 'on', 'On hover', settings.linkPreview ? 'on' : 'off', showDev),
    renderOption('linkPreview', 'off', 'Off', settings.linkPreview ? 'on' : 'off', showDev)
  ].join('')

  const askAiOptions = [
    renderOption(
      'aiAssistant',
      'chatgpt',
      'ChatGPT',
      settings.aiAssistant ?? 'chatgpt',
      showDev,
      AI_ASSISTANT_HOME_URLS.chatgpt
    ),
    renderOption(
      'aiAssistant',
      'claude',
      'Claude',
      settings.aiAssistant ?? 'chatgpt',
      showDev,
      AI_ASSISTANT_HOME_URLS.claude
    ),
    renderOption(
      'aiAssistant',
      'gemini',
      'Gemini',
      settings.aiAssistant ?? 'chatgpt',
      showDev,
      AI_ASSISTANT_HOME_URLS.gemini
    )
  ].join('')

  const moreCards = `
      <div class="settings-section">
        <div class="col-label">More</div>
        <div class="home-cards">
          <a class="home-card" href="browsy://bookmarks" data-nav>
            <div class="card-glyph">★</div>
            <div class="card-meta">
              <div class="card-title">Bookmarks</div>
              <div class="card-sub">Saved pages and pins</div>
            </div>
          </a>
          <a class="home-card" href="browsy://shortcuts" data-nav>
            <div class="card-glyph">⌘</div>
            <div class="card-meta">
              <div class="card-title">Shortcuts</div>
              <div class="card-sub">Keyboard reference</div>
            </div>
          </a>
          <a class="home-card" href="${clearCacheHref}">
            <div class="card-glyph">×</div>
            <div class="card-meta">
              <div class="card-title">Clear cache</div>
              <div class="card-sub"${cacheCleared ? ' aria-live="polite"' : ''}>${
                cacheCleared ? 'Cache cleared' : 'Cached files and pages'
              }</div>
            </div>
          </a>
        </div>
      </div>`

  const developerSection = `
      <div class="settings-section">
        <div class="col-label">Developer</div>
        <a class="dev-toggle" href="${devToggleHref}">
          <span>${devToggleLabel}</span>
          <span class="dev-toggle-sub">${devToggleSub}</span>
        </a>
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
      </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Settings — Browsy</title>
  <style>${localFontFaceCss()}</style>
   <style>${baseStyles(settings.theme)}</style>
</head>
<body>
  <div class="greeting">Settings</div>
  <div class="home-layout">
    <section class="home-col" aria-label="Browsing">
      ${renderSettingsSection('Theme', themeOptions)}
      ${renderSettingsSection('New tab', newTabOptions)}
      ${renderSettingsSection('Search engine', searchOptions)}
      ${renderSettingsSection('Link preview', linkPreviewOptions)}
      ${renderSettingsSection('Ask AI', askAiOptions)}
    </section>
    <section class="home-col" aria-label="Session">
      ${renderSettingsSection('On startup', startupOptions)}
      ${moreCards}
      ${developerSection}
    </section>
  </div>
  <a class="footer-link settings-home" href="browsy://home">← Home</a>
  <script>${settingsClientScript(cacheCleared ? settingsPageUrl({}, showDev) : undefined)}</script>
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
  <style>${localFontFaceCss()}</style>
   <style>${baseStyles(getSettings().theme)}</style>
</head>
<body class="error-page">
  <div class="error-wrap">
    <div class="error-title">Can't reach this page</div>
    <p class="error-msg">${escapeHtml(errorDescription)}</p>
    <p class="error-code">${errorCode || 'Error'} · ${escapeHtml(url)}</p>
    <div class="actions">
      <a class="btn" href="${retryHref}">Try again</a>
      <a class="btn-ghost" href="browsy://home">Home</a>
    </div>
  </div>
  <script>
    (function () {
      var actions = Array.from(document.querySelectorAll('.actions a'));
      var selectedIndex = -1;

      function setSelected(index) {
        actions.forEach(function (action) {
          action.classList.remove('selected');
          action.removeAttribute('aria-current');
        });
        selectedIndex = index;
        var selected = actions[selectedIndex];
        if (!selected) return;
        selected.classList.add('selected');
        selected.setAttribute('aria-current', 'true');
      }

      document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          var forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
          var next = forward
            ? (selectedIndex + 1) % actions.length
            : (selectedIndex <= 0 ? actions.length - 1 : selectedIndex - 1);
          setSelected(next);
        } else if (event.key === 'Enter' || event.key === 'NumpadEnter') {
          if (selectedIndex < 0) return;
          var selected = actions[selectedIndex];
          if (!selected) return;
          event.preventDefault();
          selected.click();
        }
      });
    })();
  </script>
</body>
</html>`
}

function renderNotFoundPage(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Browsy</title>
  <style>${localFontFaceCss()}</style>
  <style>
     ${baseStyles(getSettings().theme)}
    .not-found-wrap { width: 100%; max-width: 560px; padding: 24px; }
    .not-found-code { color: #3b82f6; font-family: "IBM Plex Mono", Menlo, Consolas, monospace; font-size: 5rem; font-weight: 500; letter-spacing: -0.08em; line-height: 1; margin-bottom: 20px; }
    .not-found-title { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.03em; margin-bottom: 8px; }
    .not-found-message { color: #a1a1aa; line-height: 1.5; margin-bottom: 8px; }
    .not-found-url { color: #71717a; font-family: "IBM Plex Mono", Menlo, Consolas, monospace; font-size: 0.75rem; margin-bottom: 28px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body class="error-page">
  <div class="not-found-wrap">
    <div class="not-found-code" aria-hidden="true">404</div>
    <div class="not-found-title">This page isn't here</div>
    <p class="not-found-message">Sure you are looking in the right place?</p>
    <p class="not-found-url">${escapeHtml(url)}</p>
    <div class="actions">
      <a class="btn" href="browsy://home">Home</a>
      <a class="btn-ghost" href="browsy://home" data-back>Go back</a>
    </div>
  </div>
  <script>
    (function () {
      var actions = Array.from(document.querySelectorAll('.actions a'));
      var selectedIndex = -1;
      var back = document.querySelector('[data-back]');

      if (back) {
        back.addEventListener('click', function (event) {
          if (window.history.length > 1) {
            event.preventDefault();
            window.history.back();
          }
        });
      }

      function setSelected(index) {
        actions.forEach(function (action) {
          action.classList.remove('selected');
          action.removeAttribute('aria-current');
        });
        selectedIndex = index;
        var selected = actions[selectedIndex];
        if (!selected) return;
        selected.classList.add('selected');
        selected.setAttribute('aria-current', 'true');
      }

      document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          var forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
          var next = forward
            ? (selectedIndex + 1) % actions.length
            : (selectedIndex <= 0 ? actions.length - 1 : selectedIndex - 1);
          setSelected(next);
        } else if (event.key === 'Enter' || event.key === 'NumpadEnter') {
          if (selectedIndex < 0) return;
          var selected = actions[selectedIndex];
          if (!selected) return;
          event.preventDefault();
          selected.click();
        }
      });
    })();
  </script>
</body>
</html>`
}

export function setupProtocolHandler(
  onSettingsChanged?: () => void,
  onPinsChanged?: (reloadBookmarks?: boolean) => void
): void {
  protocol.handle('browsy', async (request) => {
    const url = new URL(request.url)

    if (url.hostname === 'font') {
      const font = await serveLocalFont(url.pathname)
      if (font) return font
      return new Response('Not found', { status: 404 })
    }

    if (url.hostname === 'home' || url.pathname === '/home') {
      return new Response(renderHomePage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.hostname === 'bookmarks' || url.pathname === '/bookmarks') {
      const result = applyBookmarksPageQuery(url)
      if (result.changed) onPinsChanged?.(false)
      return new Response(renderBookmarksPage({ folder: result.folder, notice: result.notice }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (url.hostname === 'settings' || url.pathname === '/settings') {
      if (applySettingsFromQuery(url)) onSettingsChanged?.()
      const showDev = url.searchParams.get('dev') === '1'
      let cacheCleared = false
      if (url.searchParams.get('clearCache') === '1') {
        try {
          await clearSessionCache()
          cacheCleared = true
        } catch {
          cacheCleared = false
        }
      }
      return new Response(renderSettingsPage(showDev, cacheCleared), {
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
