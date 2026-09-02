import { getBookmarks, getSettings, removeBookmark, setBookmarkPinned } from './store'
import { faviconUrlForPage, isAllowedNavigationUrl } from '../../shared/utils'
import { isPinnableUrl } from '../../shared/pinned-sites'
import type { Bookmark } from '../../shared/types'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT,
  HOME_PAGE_TOP_PADDING,
  PINNED_SITES_MAX,
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

function bookmarksActionUrl(folder: string, action: 'pin' | 'unpin' | 'delete', id: string): string {
  const search = new URLSearchParams()
  search.set('folder', folder)
  search.set(action, id)
  return `browsy://bookmarks?${search.toString()}`
}

export function applyBookmarksPageQuery(url: URL): {
  changed: boolean
  notice: string | null
  folder: string | null
} {
  const folder = url.searchParams.get('folder')
  const deleteId = url.searchParams.get('delete')
  if (deleteId) {
    const existed = getBookmarks().some((bookmark) => bookmark.id === deleteId)
    if (existed) removeBookmark(deleteId)
    return { changed: existed, notice: null, folder }
  }

  const unpinId = url.searchParams.get('unpin')
  if (unpinId) {
    const result = setBookmarkPinned(unpinId, false)
    return { changed: result.updated, notice: null, folder }
  }

  const pinId = url.searchParams.get('pin')
  if (pinId) {
    const result = setBookmarkPinned(pinId, true)
    const notice = result.atLimit ? `You can pin up to ${PINNED_SITES_MAX} sites` : null
    return { changed: result.updated, notice, folder }
  }

  return { changed: false, notice: null, folder }
}

function pageStyles(theme: ThemeMode): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: ${APP_SURFACE_DARK};
      color: #f4f4f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: ${HOME_PAGE_TOP_PADDING}px 32px 32px;
    }
    .wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 980px;
      margin: 0 auto;
      min-height: 0;
    }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin-bottom: 4px;
    }
    .muted { color: #a1a1aa; font-size: 0.9rem; margin-bottom: 16px; }
    .notice {
      margin: -8px 0 16px;
      color: #a1a1aa;
      font-size: 0.85rem;
    }
    .filter-wrap { margin-bottom: 14px; flex-shrink: 0; }
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
    .finder {
      flex: 1;
      min-height: 320px;
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      overflow: hidden;
      background: ${APP_SURFACE_ELEVATED_DARK};
    }
    .finder.hidden { display: none; }
    .sidebar {
      overflow: auto;
      padding: 8px;
      border-right: 1px solid rgba(255,255,255,0.08);
    }
    .folder {
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
    .folder:hover { background: rgba(255,255,255,0.05); }
    .folder.active { background: ${APP_SURFACE_DARK}; }
    .folder.kb { outline: 1px solid rgba(255,255,255,0.16); }
    .folder.hidden { display: none; }
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
    .folder-name {
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
    .pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: ${APP_SURFACE_DARK};
      overflow: hidden;
    }
    .pane-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .pane-title {
      font-weight: 560;
      font-size: 0.875rem;
      letter-spacing: -0.01em;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .panels { flex: 1; overflow: auto; padding: 8px; }
    .panel.hidden { display: none; }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px 6px 10px;
      border-radius: 8px;
      min-width: 0;
    }
    .row:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .row.selected { background: ${APP_SURFACE_ELEVATED_DARK}; outline: 1px solid rgba(255,255,255,0.16); }
    .row.hidden { display: none; }
    .row-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }
    .title {
      flex: 1;
      min-width: 0;
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pin-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #a1a1aa;
      flex-shrink: 0;
      align-self: center;
    }
    .path {
      flex-shrink: 1;
      max-width: 42%;
      font-size: 0.75rem;
      color: #71717a;
      font-family: "IBM Plex Mono", Menlo, Consolas, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }
    .row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 26px;
      min-width: 58px;
      padding: 0 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
      color: #a1a1aa;
      text-decoration: none;
      background: transparent;
    }
    .action:hover { background: rgba(255,255,255,0.08); color: inherit; }
    .action.pin.is-pinned { color: inherit; }
    .action.delete { min-width: 58px; }
    .pane-empty {
      color: #71717a;
      font-size: 0.85rem;
      padding: 18px 12px;
      line-height: 1.5;
    }
    .pane-empty.hidden { display: none; }
    .empty { color: #71717a; font-size: 0.9rem; line-height: 1.5; max-width: 420px; }
    .empty.hidden { display: none; }
    .footer-link {
      display: inline-block;
      margin-top: 16px;
      color: #71717a;
      font-size: 0.85rem;
      text-decoration: none;
      flex-shrink: 0;
    }
    .footer-link:hover { color: inherit; }
    @media (max-width: 720px) {
      .finder { grid-template-columns: 1fr; min-height: 0; }
      .sidebar {
        border-right: none;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        max-height: 180px;
      }
    }
    ${lightThemeStart(theme)}
      body { background: ${APP_SURFACE_LIGHT}; color: #18181b; }
      .muted, .notice, .hint, .count, .path, .empty, .pane-empty { color: #71717a; }
      .filter {
        background: ${APP_SURFACE_ELEVATED_LIGHT};
        border-color: rgba(0,0,0,0.08);
        color: #18181b;
      }
      .filter:focus { border-color: rgba(0,0,0,0.22); }
      .finder { background: ${APP_SURFACE_ELEVATED_LIGHT}; border-color: rgba(0,0,0,0.08); }
      .sidebar { border-color: rgba(0,0,0,0.08); }
      .folder:hover { background: rgba(0,0,0,0.04); }
      .folder.active { background: ${APP_SURFACE_LIGHT}; }
      .folder.kb { outline: 1px solid rgba(0,0,0,0.08); }
      .pane { background: ${APP_SURFACE_LIGHT}; }
      .pane-head { border-color: rgba(0,0,0,0.08); }
      .row:hover, .row.selected { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .row.selected { outline: 1px solid rgba(0,0,0,0.08); }
      .glyph { background: rgba(0,0,0,0.06); color: #52525b; }
      .action { color: #71717a; }
      .action:hover { background: rgba(0,0,0,0.06); color: inherit; }
      @media (max-width: 720px) {
        .sidebar { border-color: rgba(0,0,0,0.08); }
      }
    ${lightThemeEnd(theme)}
  `
}

function clientScript(): string {
  return `
    (function () {
      var filter = document.getElementById('filter');
      var finder = document.getElementById('finder');
      var foldersRoot = document.getElementById('folders');
      var panelsRoot = document.getElementById('panels');
      var paneTitle = document.getElementById('pane-title');
      var paneCount = document.getElementById('pane-count');
      var paneEmpty = document.getElementById('pane-empty');
      var emptyFilter = document.getElementById('empty-filter');
      var emptyAll = document.getElementById('empty-all');
      var dataEl = document.getElementById('bookmarks-data');
      var bookmarkCount = 0;
      var paneFocus = 'folders';
      if (!filter || !foldersRoot || !panelsRoot) return;
      try { bookmarkCount = JSON.parse((dataEl && dataEl.textContent) || '[]').length; } catch (e) { bookmarkCount = 0; }

      function normalize(value) {
        return String(value || '').toLowerCase();
      }

      function isTypingTarget(el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      }

      function visibleFolders() {
        return Array.from(foldersRoot.querySelectorAll('.folder')).filter(function (folder) {
          return !folder.classList.contains('hidden');
        });
      }

      function activeFolder() {
        return foldersRoot.querySelector('.folder.active');
      }

      function activePanel() {
        var folder = activeFolder();
        if (!folder) return null;
        return panelsRoot.querySelector('.panel[data-domain="' + folder.getAttribute('data-domain') + '"]');
      }

      function visibleRows() {
        var panel = activePanel();
        if (!panel) return [];
        return Array.from(panel.querySelectorAll('.row')).filter(function (row) {
          return !row.classList.contains('hidden');
        });
      }

      function persistFolder(domain) {
        try {
          var next = new URL(window.location.href);
          next.searchParams.delete('pin');
          next.searchParams.delete('unpin');
          next.searchParams.delete('delete');
          if (domain) next.searchParams.set('folder', domain);
          else next.searchParams.delete('folder');
          history.replaceState(null, '', next.toString());
        } catch (e) {}
      }

      function setFolderKb(on) {
        foldersRoot.querySelectorAll('.folder').forEach(function (folder) {
          folder.classList.toggle('kb', on && folder.classList.contains('active'));
        });
      }

      function clearRowSelection() {
        panelsRoot.querySelectorAll('.row.selected').forEach(function (row) {
          row.classList.remove('selected');
          row.removeAttribute('aria-current');
        });
      }

      function updatePaneHead(domain, count) {
        if (paneTitle) paneTitle.textContent = domain || 'Bookmarks';
        if (paneCount) paneCount.textContent = count ? String(count) : '';
      }

      function updatePaneEmpty(count) {
        if (!paneEmpty) return;
        paneEmpty.classList.toggle('hidden', count > 0);
      }

      function selectFolder(domain, focus) {
        var folders = Array.from(foldersRoot.querySelectorAll('.folder'));
        var match = folders.find(function (folder) {
          return folder.getAttribute('data-domain') === domain && !folder.classList.contains('hidden');
        }) || visibleFolders()[0] || null;

        folders.forEach(function (folder) {
          folder.classList.remove('active');
          folder.removeAttribute('aria-current');
        });
        panelsRoot.querySelectorAll('.panel').forEach(function (panel) {
          panel.classList.add('hidden');
        });
        clearRowSelection();

        if (!match) {
          updatePaneHead('Bookmarks', 0);
          updatePaneEmpty(0);
          setFolderKb(false);
          return null;
        }

        var nextDomain = match.getAttribute('data-domain') || '';
        match.classList.add('active');
        match.setAttribute('aria-current', 'true');
        var panel = panelsRoot.querySelector('.panel[data-domain="' + nextDomain + '"]');
        if (panel) panel.classList.remove('hidden');
        var rows = visibleRows();
        updatePaneHead(nextDomain, rows.length);
        updatePaneEmpty(rows.length);
        paneFocus = focus || 'folders';
        setFolderKb(paneFocus === 'folders');
        persistFolder(nextDomain);
        match.scrollIntoView({ block: 'nearest' });
        return match;
      }

      function selectRow(row, focusRows) {
        clearRowSelection();
        if (!row) return null;
        row.classList.add('selected');
        row.setAttribute('aria-current', 'true');
        row.scrollIntoView({ block: 'nearest' });
        if (focusRows) {
          paneFocus = 'rows';
          setFolderKb(false);
        }
        return row;
      }

      function selectedRow() {
        var panel = activePanel();
        if (!panel) return null;
        return panel.querySelector('.row.selected:not(.hidden)');
      }

      function applyFilter() {
        var q = normalize(filter.value).trim();
        var totalVisible = 0;
        var active = activeFolder();
        var activeDomain = active ? active.getAttribute('data-domain') : '';

        foldersRoot.querySelectorAll('.folder').forEach(function (folder) {
          var domain = folder.getAttribute('data-domain') || '';
          var panel = panelsRoot.querySelector('.panel[data-domain="' + domain + '"]');
          var groupHits = 0;
          if (panel) {
            panel.querySelectorAll('.row').forEach(function (row) {
              var hay = normalize(row.getAttribute('data-hay'));
              var match = !q || hay.indexOf(q) !== -1 || normalize(domain).indexOf(q) !== -1;
              row.classList.toggle('hidden', !match);
              if (match) groupHits += 1;
            });
          }
          folder.classList.toggle('hidden', groupHits === 0);
          totalVisible += groupHits;
        });

        if (emptyFilter) {
          emptyFilter.classList.toggle('hidden', bookmarkCount === 0 || totalVisible > 0);
        }
        if (emptyAll) emptyAll.classList.toggle('hidden', bookmarkCount > 0);
        if (finder) finder.classList.toggle('hidden', totalVisible === 0);

        var nextDomain = activeDomain;
        var current = foldersRoot.querySelector('.folder.active');
        if (!current || current.classList.contains('hidden')) {
          var first = visibleFolders()[0];
          nextDomain = first ? first.getAttribute('data-domain') : '';
        }
        selectFolder(nextDomain, paneFocus);
        if (paneFocus === 'rows') {
          var rows = visibleRows();
          if (rows[0]) selectRow(rows[0], true);
        }
      }

      function move(delta) {
        if (paneFocus === 'folders') {
          var folders = visibleFolders();
          if (!folders.length) return;
          var current = activeFolder();
          var index = current ? folders.indexOf(current) : -1;
          var next = index < 0 ? 0 : (index + delta + folders.length) % folders.length;
          selectFolder(folders[next].getAttribute('data-domain'), 'folders');
          return;
        }
        var rows = visibleRows();
        if (!rows.length) return;
        var currentRow = selectedRow();
        var index = currentRow ? rows.indexOf(currentRow) : -1;
        var next = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : (index + delta + rows.length) % rows.length;
        selectRow(rows[next], true);
      }

      function togglePinSelected() {
        var row = selectedRow();
        if (!row) return false;
        var button = row.querySelector('.action.pin');
        if (!button) return false;
        button.click();
        return true;
      }

      function deleteSelected() {
        var row = selectedRow();
        if (!row) return false;
        var button = row.querySelector('.action.delete');
        if (!button) return false;
        button.click();
        return true;
      }

      try {
        var initial = new URL(window.location.href);
        if (initial.searchParams.has('pin') || initial.searchParams.has('unpin') || initial.searchParams.has('delete')) {
          initial.searchParams.delete('pin');
          initial.searchParams.delete('unpin');
          initial.searchParams.delete('delete');
          history.replaceState(null, '', initial.toString());
        }
      } catch (e) {}

      foldersRoot.addEventListener('click', function (event) {
        var button = event.target.closest('.folder');
        if (!button) return;
        selectFolder(button.getAttribute('data-domain'), 'folders');
      });

      panelsRoot.addEventListener('click', function (event) {
        if (event.target.closest('.action')) return;
        var row = event.target.closest('.row');
        if (!row) return;
        selectRow(row, true);
      });

      filter.addEventListener('input', function () {
        paneFocus = 'folders';
        applyFilter();
      });
      filter.addEventListener('focus', function () {
        paneFocus = 'folders';
        setFolderKb(true);
      });

      document.addEventListener('keydown', function (event) {
        var typing = isTypingTarget(event.target);
        var key = event.key;
        var mod = event.ctrlKey || event.metaKey;

        if ((key === 'p' || key === 'P') && event.shiftKey && mod && !event.altKey) {
          event.preventDefault();
          togglePinSelected();
          return;
        }

        if (key === 'ArrowDown' || key === 'ArrowUp') {
          event.preventDefault();
          if (typing) filter.blur();
          if (paneFocus !== 'folders' && paneFocus !== 'rows') paneFocus = 'folders';
          move(key === 'ArrowDown' ? 1 : -1);
          return;
        }

        if (key === 'ArrowRight') {
          if (typing) return;
          var rows = visibleRows();
          if (!rows.length) return;
          event.preventDefault();
          paneFocus = 'rows';
          setFolderKb(false);
          if (!selectedRow()) selectRow(rows[0], true);
          return;
        }

        if (key === 'ArrowLeft') {
          if (typing) return;
          event.preventDefault();
          paneFocus = 'folders';
          clearRowSelection();
          setFolderKb(true);
          var folder = activeFolder();
          if (folder) folder.scrollIntoView({ block: 'nearest' });
          return;
        }

        if (key === 'Enter' || key === 'NumpadEnter') {
          if (typing) return;
          if (paneFocus === 'rows') {
            var row = selectedRow();
            var link = row && row.querySelector('.row-main');
            if (!link) return;
            event.preventDefault();
            link.click();
          } else {
            var rows = visibleRows();
            if (!rows.length) return;
            event.preventDefault();
            paneFocus = 'rows';
            selectRow(rows[0], true);
          }
          return;
        }

        if (!typing && !mod && !event.altKey && !event.shiftKey && (key === 'p' || key === 'P')) {
          if (togglePinSelected()) event.preventDefault();
          return;
        }

        if (!typing && !mod && !event.altKey && (key === 'Delete' || key === 'Backspace')) {
          if (deleteSelected()) event.preventDefault();
        }
      });

      filter.focus();
      applyFilter();
    })();
  `
}

export function renderBookmarksPage(options?: {
  bookmarks?: Bookmark[]
  folder?: string | null
  notice?: string | null
  theme?: ThemeMode
}): string {
  const theme = options?.theme ?? getSettings().theme
  const bookmarks = (options?.bookmarks ?? getBookmarks()).filter((b) => isAllowedNavigationUrl(b.url))
  const groups = groupBookmarksByDomain(bookmarks)
  const pinnedCount = bookmarks.filter((bookmark) => bookmark.pinned && isPinnableUrl(bookmark.url)).length
  const requested = options?.folder
  const selectedFolder =
    (requested && groups.some((group) => group.domain === requested) ? requested : null) ?? groups[0]?.domain ?? null

  const foldersHtml = groups
    .map((group) => {
      const sampleUrl = group.bookmarks[0]?.url ?? `https://${group.domain}`
      const active = group.domain === selectedFolder
      return `
        <button type="button" class="folder${active ? ' active kb' : ''}" data-domain="${escapeHtml(group.domain)}"${active ? ' aria-current="true"' : ''}>
          ${renderDomainGlyph(group.domain, sampleUrl)}
          <span class="folder-name">${escapeHtml(group.domain)}</span>
          <span class="count">${group.bookmarks.length}</span>
        </button>`
    })
    .join('')

  const panelsHtml = groups
    .map((group) => {
      const hidden = group.domain !== selectedFolder
      const rows = group.bookmarks
        .map((bookmark) => {
          const title = titleForBookmark(bookmark)
          const path = pathForUrl(bookmark.url)
          const hay = `${title} ${bookmark.url} ${group.domain}`
          const pinned = Boolean(bookmark.pinned)
          const pinnable = isPinnableUrl(bookmark.url)
          const pinHref = bookmarksActionUrl(group.domain, pinned ? 'unpin' : 'pin', bookmark.id)
          const deleteHref = bookmarksActionUrl(group.domain, 'delete', bookmark.id)
          const pinButton = pinnable
            ? `<a class="action pin${pinned ? ' is-pinned' : ''}" href="${escapeHtml(pinHref)}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${escapeHtml(title)}">${pinned ? 'Unpin' : 'Pin'}</a>`
            : ''
          return `
            <div class="row" data-id="${escapeHtml(bookmark.id)}" data-hay="${escapeHtml(hay)}" data-pinned="${pinned ? 'true' : 'false'}">
              <a class="row-main" href="${escapeHtml(bookmark.url)}">
                ${pinned ? '<span class="pin-dot" title="Pinned" aria-hidden="true"></span>' : ''}
                <span class="title">${escapeHtml(title)}</span>
                ${path ? `<span class="path">${escapeHtml(path)}</span>` : ''}
              </a>
              <div class="row-actions">
                ${pinButton}
                <a class="action delete" href="${escapeHtml(deleteHref)}" aria-label="Delete ${escapeHtml(title)}">Delete</a>
              </div>
            </div>`
        })
        .join('')
      return `
        <div class="panel${hidden ? ' hidden' : ''}" data-domain="${escapeHtml(group.domain)}" role="list">
          ${rows}
        </div>`
    })
    .join('')

  const payload = JSON.stringify(bookmarks).replace(/</g, '\\u003c')
  const subtitle =
    bookmarks.length === 0
      ? 'Save pages with Ctrl+D'
      : `${bookmarks.length} saved · ${pinnedCount}/${PINNED_SITES_MAX} pinned · grouped by site`
  const selectedCount = groups.find((group) => group.domain === selectedFolder)?.bookmarks.length ?? 0

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
    ${options?.notice ? `<p class="notice">${escapeHtml(options.notice)}</p>` : ''}
    <div class="filter-wrap">
      <input id="filter" class="filter" type="search" placeholder="Filter by title, path, or site" autocomplete="off" spellcheck="false" />
      <p class="hint">← folders · → contents · enter opens · P or Ctrl/Cmd+Shift+P pins · delete removes · type to filter</p>
    </div>
    <p id="empty-all" class="empty${bookmarks.length === 0 ? '' : ' hidden'}">No bookmarks yet. Press Ctrl+D on any page to save it.</p>
    <p id="empty-filter" class="empty hidden">No matches.</p>
    <div id="finder" class="finder${bookmarks.length === 0 ? ' hidden' : ''}">
      <nav id="folders" class="sidebar" aria-label="Folders">${foldersHtml}</nav>
      <section class="pane" aria-label="Folder contents">
        <div class="pane-head">
          <span id="pane-title" class="pane-title">${escapeHtml(selectedFolder ?? 'Bookmarks')}</span>
          <span id="pane-count" class="count">${selectedCount || ''}</span>
        </div>
        <div id="panels" class="panels">${panelsHtml}</div>
        <p id="pane-empty" class="pane-empty${selectedCount ? ' hidden' : ''}">No bookmarks in this folder.</p>
      </section>
    </div>
    <a class="footer-link" href="browsy://home">← Home</a>
  </div>
  <script type="application/json" id="bookmarks-data">${payload}</script>
  <script>${clientScript()}</script>
</body>
</html>`
}
