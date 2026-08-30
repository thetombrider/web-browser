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
- Optional Chrome DevTools Protocol (off by default)

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
| `Cmd+Right Arrow` | Next tab |
| `Cmd+Left Arrow` | Previous tab |
| `Ctrl/Cmd+D` | Bookmark page |
| `Ctrl/Cmd+N` | New window |
| `Ctrl/Cmd+R` | Reload |
| `Ctrl/Cmd+[` | Back |
| `Ctrl/Cmd+]` | Forward |
| `Ctrl/Cmd+B` | Bookmarks |
| `Ctrl/Cmd+,` | Settings |
| `Ctrl/Cmd+/` | Shortcut list |
| `F12` / `Ctrl/Cmd+Shift+I` | DevTools |
| `Esc` | Hide chrome |

## Security notes

By default Browsy keeps local control surfaces **off**:

- **CDP** is disabled unless `BROWSY_ENABLE_CDP=1` or `BROWSY_CDP_PORT` is set.
- **Local HTTP API** is disabled unless `BROWSY_ENABLE_API=1` or `BROWSY_API_TOKEN` is set.
- When the API is enabled, every request requires `Authorization: Bearer <token>` (or `X-Browsy-Token`).
- Navigation is limited to `http:`, `https:`, and `browsy:` (blocks `javascript:`, `file:`, `data:`, etc.).
- Tab content runs sandboxed with permissions and invalid TLS certificates denied by default.

## Agent integration

### Local HTTP API

Disabled by default. Start with a token:

```bash
BROWSY_API_TOKEN=dev-secret npm run dev
# or
BROWSY_ENABLE_API=1 npm run dev   # prints a generated token
```

API base: `http://127.0.0.1:9375`

Auth header (required):

```bash
curl -H "Authorization: Bearer dev-secret" http://127.0.0.1:9375/state
```

Endpoints:

- `GET /state` — browser state
- `POST /navigate` — `{ "input": "url or search" }`
- `POST /tabs` — new tab
- `DELETE /tabs` — close tab
- `POST /tabs/switch` — switch tab
- `POST /back`, `POST /forward`, `POST /reload`, `POST /stop`
- `POST /devtools` — toggle DevTools
- `POST /windows` — new window

There is no CORS; the API is loopback-only and intended for local tooling.

### MCP bridge

Browser must be running with the API enabled, and the bridge must receive the same token:

```json
{
  "mcpServers": {
    "browsy": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/browsy",
      "env": {
        "BROWSY_API_TOKEN": "dev-secret"
      }
    }
  }
}
```

Tools: `browse_url`, `list_tabs`, `new_tab`, `close_tab`, `switch_tab`, `go_back`, `go_forward`, `reload`, `toggle_devtools`, `new_window`.

### Chrome DevTools Protocol

Disabled by default. Enable explicitly:

```bash
BROWSY_ENABLE_CDP=1 npm run dev
# or
BROWSY_CDP_PORT=9223 npm run dev
```

Connect with Playwright, Puppeteer, or any CDP client. Treat CDP as full browser control — only enable on trusted machines.

## Architecture

- **Main process** — windows, tabs, `WebContentsView` layout, downloads, pop-ups, API server
- **Preload** — typed `contextBridge` IPC
- **Chrome view** — React + Chakra UI overlay (`WebContentsView` on top)
- **Tab views** — full-bleed `WebContentsView` per tab underneath chrome

## License

MIT
