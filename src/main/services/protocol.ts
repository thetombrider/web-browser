import { protocol } from 'electron'
import { getRecentSites, getSettings } from './store'
import { isAllowedNavigationUrl, sanitizeNavigationUrl } from '../../shared/utils'
import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT,
  HOME_PAGE_TOP_PADDING,
  RECENT_SITES_COUNT
} from '../../shared/types'

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
      .site:hover { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      .glyph { background: rgba(0,0,0,0.06); color: #52525b; }
      .btn { background: #2563eb; }
    }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin-bottom: 4px;
    }
    .muted { color: #a1a1aa; margin-bottom: 28px; font-size: 0.9rem; }
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 520px;
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
    .glyph {
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
    .empty { color: #71717a; font-size: 0.9rem; max-width: 420px; line-height: 1.5; }
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
  `
}

export function renderHomePage(): string {
  const settings = getSettings()
  const recent = (settings.homepage === 'blank' ? [] : getRecentSites(RECENT_SITES_COUNT)).filter((site) =>
    isAllowedNavigationUrl(site.url)
  )
  const sitesHtml =
    recent.length === 0
      ? '<p class="empty">Type a URL or search above to get started.</p>'
      : `<div class="list">${recent
          .map(
            (site) => `
        <a class="site" href="${escapeHtml(site.url)}">
          <div class="glyph">${escapeHtml(letterForUrl(site.url))}</div>
          <div class="site-meta">
            <div class="site-title">${escapeHtml(getSiteName(site.title, site.url))}</div>
            <div class="site-url">${escapeHtml(site.url)}</div>
          </div>
        </a>`
          )
          .join('')}</div>`

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
  <p class="muted">${recent.length === 0 ? 'A quieter place to browse' : 'Recent'}</p>
  ${sitesHtml}
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
