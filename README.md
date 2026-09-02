# Browsy

A minimal, keyboard-first Electron browser built for learning and portfolio use.

## Features

- Full-page browsing with hidden chrome by default
- Spotlight-style launcher (`Ctrl/Cmd+L`) — search, URL, commands, and open-tabs inventory
- Fullscreen tab carousel for switching tabs (`Cmd+←/→`)
- Omnibox suggestions and command palette (`/` shortcuts)
- Multiple windows and tabs
- Custom homepage with recent sites and pinned bookmarks
- Finder-style bookmarks page (folders by domain) with pin and delete
- Custom error pages
- DevTools docked right, one per tab (`F12`)
- Session restore on launch
- Right-click page menu: open in new tab or window, screenshot, and Ask AI on selected text (ChatGPT, Claude, or Gemini in Settings)
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

## Build an installable DMG

On macOS, run:

```bash
npm run dmg
```

The DMG is written to `release/` and can be opened to drag Browsy into Applications. The build targets the current Mac architecture. Override it with `BROWSY_ARCH=arm64` or `BROWSY_ARCH=x64` when needed. Local builds are unsigned, so macOS may require opening the app manually in System Settings.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+L` | Spotlight launcher (search, URL, tabs, commands) |
| `Ctrl/Cmd+T` | New tab |
| `Ctrl/Cmd+W` | Close tab |
| `Cmd+Right Arrow` | Tab switcher (carousel) |
| `Cmd+Left Arrow` | Tab switcher (carousel) |
| `Ctrl/Cmd+D` | Bookmark page |
| `Ctrl/Cmd+Shift+P` | Bookmark (if needed) and pin the current page, or pin the selected bookmark |
| `Ctrl/Cmd+N` | New window |
| `Ctrl/Cmd+R` | Reload |
| `Ctrl/Cmd+[` | Back |
| `Ctrl/Cmd+]` | Forward |
| `Ctrl/Cmd+B` | Bookmarks page (`browsy://bookmarks`) |
| `Ctrl/Cmd+,` | Settings |
| `Ctrl/Cmd+S` | Shortcut list |
| `F12` / `Ctrl/Cmd+Shift+I` | DevTools |
| `Esc` | Dismiss launcher or tab switcher |

## Security notes

By default Browsy keeps local control surfaces **off**:

- **CDP** is disabled unless `BROWSY_ENABLE_CDP=1` or `BROWSY_CDP_PORT` is set.
- **Local HTTP API** is disabled unless `BROWSY_ENABLE_API=1` or `BROWSY_API_TOKEN` is set.
- When the API is enabled, every request requires `Authorization: Bearer <token>` (or `X-Browsy-Token`).
- Navigation is limited to `http:`, `https:`, and `browsy:` (blocks `javascript:`, `file:`, `data:`, etc.).
- Tab content runs sandboxed with most permissions and invalid TLS certificates denied by default.
- Sanitized clipboard writes are allowed so in-page copy buttons work; clipboard read stays denied.
- Microphone and camera access are prompted per site (decision remembered); other powerful permissions stay denied.
- For local getUserMedia testing without real devices, set `BROWSY_FAKE_MEDIA=1` (Chromium fake capture devices).

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
- **Chrome view** — React + Chakra UI overlay (Spotlight launcher + tab carousel)
- **Tab views** — full-bleed `WebContentsView` per tab underneath chrome

## License

MIT
