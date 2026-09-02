import { getBookmarks, getSettings } from './store'
import { faviconUrlForPage, isAllowedNavigationUrl } from '../../shared/utils'
import type { Bookmark, BookmarkImportResult } from '../../shared/types'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT,
  type ThemeMode
} from '../../shared/types'

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

export function domainForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '')
    return host || 'Other'
  } catch {
    return 'Other'
  }
}

function pathForUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    return path === '/' ? '' : path
  } catch {
    return url
  }
}

function letterForDomain(domain: string): string {
  return domain[0]?.toUpperCase() ?? '?'
}

function renderDomainGlyph(domain: string, sampleUrl: string): string {
  const letter = escapeHtml(letterForDomain(domain))
  const favicon = faviconUrlForPage(sampleUrl)
  if (!favicon) {
    return `<span class="glyph" aria-hidden="true">${letter}</span>`
  }
  return `<span class="glyph" aria-hidden="true">
            <span class="glyph-letter">${letter}</span>
            <img class="favicon" src="${escapeHtml(favicon)}" alt="" width="16" height="16" loading="lazy" decoding="async" onerror="this.remove()" />
          </span>`
}

function titleForBookmark(bookmark: Bookmark): string {
  const trimmed = bookmark.title.trim()
  if (trimmed && !/^https?:\/\//i.test(trimmed)) return trimmed
  return domainForUrl(bookmark.url)
}

export interface BookmarkGroup {
  domain: string
  bookmarks: Bookmark[]
}

export function groupBookmarksByDomain(bookmarks: Bookmark[]): BookmarkGroup[] {
  const map = new Map<string, Bookmark[]>()
  for (const bookmark of bookmarks) {
    if (!isAllowedNavigationUrl(bookmark.url)) continue
    const domain = domainForUrl(bookmark.url)
    const list = map.get(domain)
    if (list) list.push(bookmark)
    else map.set(domain, [bookmark])
  }

  const groups: BookmarkGroup[] = [...map.entries()].map(([domain, items]) => ({
    domain,
    bookmarks: [...items].sort((a, b) => b.createdAt - a.createdAt)
  }))

  groups.sort((a, b) => {
    if (b.bookmarks.length !== a.bookmarks.length) return b.bookmarks.length - a.bookmarks.length
    return a.domain.localeCompare(b.domain)
  })

  return groups
}

function pageStyles(theme: ThemeMode): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: ${APP_SURFACE_DARK};
      color: #f4f4f5;
      min-height: 100vh;
      padding: 48px 32px 64px;
    }
    .wrap { max-width: 640px; margin: 0 auto; }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin-bottom: 4px;
    }
    .muted { color: #a1a1aa; font-size: 0.9rem; margin-bottom: 20px; }
    .filter-wrap { margin-bottom: 20px; }
    .filter {
      width: 100%;
      height: 40px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: ${APP_SURFACE_ELEVATED_DARK};
      color: #f4f4f5;
      font: inherit;
      font-size: 0.925rem;
      outline: none;
    }
    .filter:focus { border-color: rgba(255,255,255,0.28); }
    .filter::placeholder { color: #71717a; }
    .hint {
      margin-top: 8px;
      font-size: 0.75rem;
      color: #71717a;
    }
    .groups { display: flex; flex-direction: column; gap: 6px; }
    .group { min-width: 0; }
    .group.hidden { display: none; }
    .domain-head {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      text-align: left;
    }
    .domain-head:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .glyph {
      position: relative;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #a1a1aa;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
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
    .domain-name {
      flex: 1;
      min-width: 0;
      font-weight: 560;
      font-size: 0.875rem;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .count {
      font-size: 0.75rem;
      color: #71717a;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .chevron {
      color: #71717a;
      font-size: 0.7rem;
      width: 12px;
      text-align: center;
      flex-shrink: 0;
      transition: transform 0.12s ease;
    }
    .group.collapsed .chevron { transform: rotate(-90deg); }
    .group.collapsed .rows { display: none; }
    .rows { display: flex; flex-direction: column; gap: 1px; padding: 0 0 4px 0; }
    .row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 7px 10px 7px 44px;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      min-width: 0;
    }
    .row:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .row.selected { background: ${APP_SURFACE_ELEVATED_DARK}; outline: 1px solid rgba(255,255,255,0.16); }
    .row.hidden { display: none; }
    .title {
      flex: 1;
      min-width: 0;
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .path {
      flex-shrink: 1;
      max-width: 46%;
      font-size: 0.75rem;
      color: #71717a;
      font-family: "IBM Plex Mono", Menlo, Consolas, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }
    .empty { color: #71717a; font-size: 0.9rem; line-height: 1.5; max-width: 420px; }
    .empty.hidden { display: none; }
    .import-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .import-btn {
      display: inline-flex;
      align-items: center;
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: ${APP_SURFACE_ELEVATED_DARK};
      color: inherit;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
    }
    .import-btn:hover { border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.06); }
    .import-hint {
      flex: 1 1 100%;
      font-size: 0.75rem;
      color: #71717a;
    }
    .notice {
      margin-bottom: 16px;
      padding: 10px 12px;
      border-radius: 8px;
      background: ${APP_SURFACE_ELEVATED_DARK};
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .footer-link {
      display: inline-block;
      margin-top: 24px;
      color: #71717a;
      font-size: 0.85rem;
      text-decoration: none;
    }
    .footer-link:hover { color: inherit; }
    ${lightThemeStart(theme)}
      body { background: ${APP_SURFACE_LIGHT}; color: #18181b; }
      .muted, .hint, .count, .path, .empty, .import-hint { color: #71717a; }
      .filter {
        background: ${APP_SURFACE_ELEVATED_LIGHT};
        border-color: rgba(0,0,0,0.08);
        color: #18181b;
      }
      .filter:focus { border-color: rgba(0,0,0,0.22); }
      .domain-head:hover, .row:hover, .row.selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .row.selected { outline: 1px solid rgba(0,0,0,0.08); }
      .glyph { background: rgba(0,0,0,0.06); color: #52525b; }
      .chevron { color: #a1a1aa; }
      .import-btn {
        background: ${APP_SURFACE_ELEVATED_LIGHT};
        border-color: rgba(0,0,0,0.1);
        color: #18181b;
      }
      .import-btn:hover { border-color: rgba(0,0,0,0.22); background: rgba(0,0,0,0.03); }
      .notice {
        background: ${APP_SURFACE_ELEVATED_LIGHT};
        border-color: rgba(0,0,0,0.08);
      }
    ${lightThemeEnd(theme)}
  `
}

function clientScript(): string {
  return `
    (function () {
      var dataEl = document.getElementById('bookmarks-data');
      if (!dataEl) return;
      var bookmarks = [];
      try { bookmarks = JSON.parse(dataEl.textContent || '[]'); } catch (e) { bookmarks = []; }

      var filter = document.getElementById('filter');
       var groupsRoot = document.getElementById('groups');
       var emptyFilter = document.getElementById('empty-filter');
       var emptyAll = document.getElementById('empty-all');
       var selectedIndex = -1;
       if (!filter || !groupsRoot) return;

       function normalize(value) {
         return String(value || '').toLowerCase();
       }

       function visibleRows() {
         return Array.from(groupsRoot.querySelectorAll('.row')).filter(function (row) {
           var group = row.closest('.group');
           return !row.classList.contains('hidden') && group && !group.classList.contains('hidden');
         });
       }

       function expandGroup(group) {
         if (!group || !group.classList.contains('collapsed')) return;
         group.classList.remove('collapsed');
         var button = group.querySelector('.domain-head');
         if (button) button.setAttribute('aria-expanded', 'true');
       }

       function setSelected(index) {
         var rows = visibleRows();
         rows.forEach(function (row) {
           row.classList.remove('selected');
           row.removeAttribute('aria-current');
         });
         if (!rows.length || index < 0) {
           selectedIndex = -1;
           return null;
         }
         selectedIndex = ((index % rows.length) + rows.length) % rows.length;
         var selected = rows[selectedIndex];
         expandGroup(selected.closest('.group'));
         selected.classList.add('selected');
         selected.setAttribute('aria-current', 'true');
         selected.scrollIntoView({ block: 'nearest' });
         return selected;
       }

       function applyFilter() {
         var q = normalize(filter.value).trim();
         var visibleRows = 0;
         setSelected(-1);

        groupsRoot.querySelectorAll('.group').forEach(function (group) {
          var domain = normalize(group.getAttribute('data-domain'));
          var rows = group.querySelectorAll('.row');
          var groupHits = 0;

          rows.forEach(function (row) {
            var hay = normalize(row.getAttribute('data-hay'));
            var match = !q || hay.indexOf(q) !== -1 || domain.indexOf(q) !== -1;
            row.classList.toggle('hidden', !match);
            if (match) groupHits += 1;
          });

          group.classList.toggle('hidden', groupHits === 0);
          if (q && groupHits > 0) group.classList.remove('collapsed');
          visibleRows += groupHits;
        });

        if (emptyFilter) {
          emptyFilter.classList.toggle('hidden', bookmarks.length === 0 || visibleRows > 0);
        }
        if (emptyAll) {
          emptyAll.classList.toggle('hidden', bookmarks.length > 0);
        }
      }

      groupsRoot.addEventListener('click', function (event) {
        var button = event.target.closest('.domain-head');
        if (!button) return;
        var group = button.closest('.group');
         if (!group) return;
         group.classList.toggle('collapsed');
         button.setAttribute('aria-expanded', group.classList.contains('collapsed') ? 'false' : 'true');
         setSelected(-1);
       });

       filter.addEventListener('input', applyFilter);
       document.addEventListener('keydown', function (event) {
         if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
           var rows = visibleRows();
           if (!rows.length) return;
           event.preventDefault();
           var next = event.key === 'ArrowDown'
             ? (selectedIndex + 1) % rows.length
             : (selectedIndex <= 0 ? rows.length - 1 : selectedIndex - 1);
           setSelected(next);
         } else if (event.key === 'Enter' || event.key === 'NumpadEnter') {
           if (selectedIndex < 0) return;
           var rows = visibleRows();
           var selected = rows[selectedIndex];
           if (!selected) return;
           event.preventDefault();
           selected.click();
         }
       });
       filter.focus();
      applyFilter();
    })();
  `
}

export function renderBookmarksPage(
  bookmarksOverride?: Bookmark[],
  importResult?: BookmarkImportResult | null
): string {
  const theme = getSettings().theme
  const bookmarks = (bookmarksOverride ?? getBookmarks()).filter((b) => isAllowedNavigationUrl(b.url))
  const groups = groupBookmarksByDomain(bookmarks)

  const groupsHtml =
    groups.length === 0
      ? ''
      : groups
          .map((group) => {
            const rows = group.bookmarks
              .map((bookmark) => {
                const title = titleForBookmark(bookmark)
                const path = pathForUrl(bookmark.url)
                const hay = `${title} ${bookmark.url} ${group.domain}`
                return `
            <a class="row" href="${escapeHtml(bookmark.url)}" data-hay="${escapeHtml(hay)}">
              <span class="title">${escapeHtml(title)}</span>
              ${path ? `<span class="path">${escapeHtml(path)}</span>` : ''}
            </a>`
              })
              .join('')

            const sampleUrl = group.bookmarks[0]?.url ?? `https://${group.domain}`
            return `
        <section class="group${group.bookmarks.length === 1 ? ' collapsed' : ''}" data-domain="${escapeHtml(group.domain)}">
          <button type="button" class="domain-head" aria-expanded="${group.bookmarks.length === 1 ? 'false' : 'true'}">
            ${renderDomainGlyph(group.domain, sampleUrl)}
            <span class="domain-name">${escapeHtml(group.domain)}</span>
            <span class="count">${group.bookmarks.length}</span>
            <span class="chevron" aria-hidden="true">▾</span>
          </button>
          <div class="rows">${rows}</div>
        </section>`
          })
          .join('')

  const payload = JSON.stringify(bookmarks).replace(/</g, '\\u003c')
  const subtitle =
    bookmarks.length === 0
      ? 'Save pages with Ctrl+D · or import from Chrome / Firefox'
      : `${bookmarks.length} saved · grouped by site`

  const noticeHtml = importResult
    ? `<p class="notice" role="status">${escapeHtml(importResult.message)}</p>`
    : ''

  const stripImportQueryScript = importResult
    ? `<script>
    (function () {
      try {
        if (/[?&]import=/.test(location.search)) {
          history.replaceState(null, '', 'browsy://bookmarks');
        }
      } catch (e) {}
    })();
  </script>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bookmarks — Browsy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
   <style>${pageStyles(theme)}</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Bookmarks</div>
    <p class="muted">${escapeHtml(subtitle)}</p>
    ${noticeHtml}
    <div class="import-bar" aria-label="Import bookmarks">
      <a class="import-btn" href="browsy://bookmarks?import=chrome">Import Chrome</a>
      <a class="import-btn" href="browsy://bookmarks?import=firefox">Import Firefox</a>
      <a class="import-btn" href="browsy://bookmarks?import=file">Import file…</a>
      <p class="import-hint">Duplicates are skipped · browser folders are flattened into site groups</p>
    </div>
    <div class="filter-wrap">
      <input id="filter" class="filter" type="search" placeholder="Filter by title, path, or site" autocomplete="off" spellcheck="false" />
      <p class="hint">Sites with one save start collapsed · arrows move across all bookmarks · enter opens · type to filter</p>
    </div>
    <p id="empty-all" class="empty${bookmarks.length === 0 ? '' : ' hidden'}">No bookmarks yet. Press Ctrl+D on any page, or import from Chrome or Firefox.</p>
    <p id="empty-filter" class="empty hidden">No matches.</p>
    <div id="groups" class="groups">${groupsHtml}</div>
    <a class="footer-link" href="browsy://home">← Home</a>
  </div>
  <script type="application/json" id="bookmarks-data">${payload}</script>
  <script>${clientScript()}</script>
  ${stripImportQueryScript}
</body>
</html>`
}
