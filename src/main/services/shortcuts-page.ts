import {
  APP_SURFACE_DARK,
  APP_SURFACE_ELEVATED_DARK,
  APP_SURFACE_ELEVATED_LIGHT,
  APP_SURFACE_LIGHT
} from '../../shared/types'

const SHORTCUTS = [
  ['Ctrl/Cmd + L', 'Open address bar'],
  ['Ctrl/Cmd + T', 'New tab'],
  ['Ctrl/Cmd + W', 'Close tab'],
  ['Cmd + Right Arrow', 'Next tab, or move tab switcher'],
  ['Cmd + Left Arrow', 'Previous tab, or move tab switcher'],
  ['Ctrl/Cmd + D', 'Bookmark page'],
  ['Ctrl/Cmd + B', 'Bookmarks page'],
  ['Ctrl/Cmd + ,', 'Settings'],
  ['Ctrl/Cmd + R', 'Reload'],
  ['Ctrl/Cmd + [', 'Back'],
  ['Ctrl/Cmd + ]', 'Forward'],
  ['Ctrl/Cmd + N', 'New window'],
  ['Ctrl/Cmd + /', 'This shortcut list'],
  ['Enter', 'Select centered tab in switcher'],
  ['Esc', 'Dismiss switcher or hide chrome']
] as const

function pageStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: ${APP_SURFACE_DARK};
      color: #f4f4f5;
      min-height: 100vh;
      padding: 120px 32px 48px;
    }
    @media (prefers-color-scheme: light) {
      body { background: ${APP_SURFACE_LIGHT}; color: #18181b; }
      .muted { color: #71717a; }
      .shortcut:hover { background: ${APP_SURFACE_ELEVATED_LIGHT}; }
      kbd { background: rgba(0,0,0,0.06); }
    }
    .wrap { max-width: 620px; margin: 0 auto; }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin-bottom: 4px;
    }
    .muted { color: #a1a1aa; margin-bottom: 28px; font-size: 0.9rem; }
    .list { display: flex; flex-direction: column; gap: 2px; }
    .shortcut {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 10px 12px;
      border-radius: 8px;
      transition: background 0.12s ease;
    }
    .shortcut:hover { background: ${APP_SURFACE_ELEVATED_DARK}; }
    .label { font-size: 0.925rem; }
    kbd {
      background: rgba(255,255,255,0.08);
      border-radius: 6px;
      color: #a1a1aa;
      font-family: "IBM Plex Mono", Menlo, Consolas, monospace;
      font-size: 0.75rem;
      padding: 5px 8px;
      white-space: nowrap;
    }
    .footer-link {
      display: inline-block;
      margin-top: 24px;
      color: #71717a;
      font-size: 0.85rem;
      text-decoration: none;
    }
    .footer-link:hover { color: inherit; }
  `
}

export function renderShortcutsPage(): string {
  const rows = SHORTCUTS.map(
    ([keys, label]) => `
      <div class="shortcut">
        <span class="label">${label}</span>
        <kbd>${keys}</kbd>
      </div>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shortcuts — Browsy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${pageStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="brand">Shortcuts</div>
    <p class="muted">Keyboard reference</p>
    <div class="list">${rows}</div>
    <a class="footer-link" href="browsy://home">&lt;- Home</a>
  </main>
</body>
</html>`
}
