import { protocol } from 'electron'
import { getRecentSites } from './store'
import { RECENT_SITES_COUNT } from '../../shared/types'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function baseStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f12;
      color: #e8e8ec;
      min-height: 100vh;
      padding: 48px 32px;
    }
    @media (prefers-color-scheme: light) {
      body { background: #f5f5f7; color: #1a1a1e; }
      .site { background: #fff; border-color: #ddd; }
      .site:hover { border-color: #888; }
      .muted { color: #666; }
    }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; }
    .muted { color: #999; margin-bottom: 32px; font-size: 0.9rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      max-width: 900px;
    }
    .site {
      display: block;
      padding: 16px;
      background: #1a1a22;
      border: 1px solid #2a2a35;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s;
    }
    .site:hover { border-color: #666; }
    .site-title { font-weight: 500; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .site-url { font-size: 0.8rem; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .empty { color: #888; font-size: 0.95rem; }
    .error-code { font-size: 3rem; font-weight: 700; color: #e55; margin-bottom: 8px; }
    .error-msg { margin-bottom: 24px; max-width: 600px; line-height: 1.5; }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      background: #3b82f6;
      color: #fff;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.9rem;
    }
  `
}

export function renderHomePage(): string {
  const recent = getRecentSites(RECENT_SITES_COUNT)
  const sitesHtml =
    recent.length === 0
      ? '<p class="empty">No recent sites yet. Press Ctrl+L to open the omnibox and start browsing.</p>'
      : `<div class="grid">${recent
          .map(
            (site) => `
        <a class="site" href="${escapeHtml(site.url)}">
          <div class="site-title">${escapeHtml(site.title || site.url)}</div>
          <div class="site-url">${escapeHtml(site.url)}</div>
        </a>`
          )
          .join('')}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Browsy</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <h1>Browsy</h1>
  <p class="muted">Recent sites</p>
  ${sitesHtml}
</body>
</html>`
}

export function renderErrorPage(url: string, errorCode: number, errorDescription: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page not available — Browsy</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="error-code">${errorCode || 'Error'}</div>
  <h1>Can't reach this page</h1>
  <p class="error-msg">${escapeHtml(errorDescription)}</p>
  <p class="muted" style="margin-bottom:24px">${escapeHtml(url)}</p>
  <a class="btn" href="browsy://home">Go home</a>
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
      const failedUrl = url.searchParams.get('url') ?? ''
      const code = Number(url.searchParams.get('code') ?? '0')
      const desc = url.searchParams.get('desc') ?? 'Unknown error'
      return new Response(renderErrorPage(failedUrl, code, desc), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    return new Response('Not found', { status: 404 })
  })
}
