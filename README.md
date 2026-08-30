# Browsy

A minimal, keyboard-first Electron browser built for learning and portfolio use.

## Features

- Full-page browsing with hidden chrome by default
- Compact floating navigation chrome over full-bleed pages (`WebContentsView`)
- Omnibox suggestions and command palette (`/` shortcuts)
- Multiple windows and tabs
- Custom homepage with recent sites
- Custom error pages
- DevTools docked right, one per tab (`F12`)
- Session restore on launch
- MCP bridge for agent control
- Chrome DevTools Protocol on port `9222`

## Requirements

- Node.js 18+
- macOS or Linux (developed for both; Linux CI/dev environment)

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production preview

```bash
npm run build
npm start
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+L` | Navigation chrome (tabs and omnibox) |
| `Ctrl/Cmd+T` | New tab |
| `Ctrl/Cmd+W` | Close tab |
| `Ctrl/Cmd+Tab` | Next tab |
| `Ctrl/Cmd+Shift+Tab` | Previous tab |
| `Ctrl/Cmd+D` | Bookmark page |
| `Ctrl/Cmd+N` | New window |
| `Ctrl/Cmd+R` | Reload |
| `Ctrl/Cmd+[` | Back |
| `Ctrl/Cmd+]` | Forward |
| `Ctrl/Cmd+B` | Bookmarks |
| `Ctrl/Cmd+,` | Settings |
| `?` | Shortcut list |
| `F12` / `Ctrl/Cmd+Shift+I` | DevTools |
| `Esc` | Hide chrome |

## Agent integration

### Local HTTP API

When Browsy is running, a control API is available at `http://127.0.0.1:9375`.

Endpoints:

- `GET /state` — browser state
- `POST /navigate` — `{ "input": "url or search" }`
- `POST /tabs` — new tab
- `DELETE /tabs` — close tab
- `POST /tabs/switch` — switch tab
- `POST /back`, `POST /forward`, `POST /reload`, `POST /stop`
- `POST /devtools` — toggle DevTools
- `POST /windows` — new window

### MCP bridge

Add to your Cursor MCP config (browser must be running):

```json
{
  "mcpServers": {
    "browsy": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/browsy"
    }
  }
}
```

Tools: `browse_url`, `list_tabs`, `new_tab`, `close_tab`, `switch_tab`, `go_back`, `go_forward`, `reload`, `toggle_devtools`, `new_window`.

### Chrome DevTools Protocol

CDP is exposed on port `9222` by default. Override with `BROWSY_CDP_PORT`.

```bash
BROWSY_CDP_PORT=9223 npm run dev
```

Connect with Playwright, Puppeteer, or any CDP client.

## Architecture

- **Main process** — windows, tabs, `WebContentsView` layout, downloads, pop-ups, API server
- **Preload** — typed `contextBridge` IPC
- **Chrome view** — React + Chakra UI overlay (`WebContentsView` on top)
- **Tab views** — full-bleed `WebContentsView` per tab underneath chrome

## License

MIT
