# Browsy Performance Review

**Goal:** A browser that feels snappy and loads quickly even with many tabs open.

**Method:** Static audit of main/preload/renderer paths that dominate multi-tab cost (process model, tab lifecycle, IPC, chrome UI, session restore, caching). No live Chromium traces were taken in this pass; findings are grounded in code paths that scale linearly (or worse) with tab count.

**Verdict:** Browsy currently optimizes for *warm, always-ready tabs* (fast carousel snapshots, no background throttling). That feels fine with a handful of tabs and becomes the main failure mode at 20–50+. The highest-leverage work is a real **tab lifecycle** (hibernate / discard / lazy restore), then quieter IPC and cheaper chrome.

### Implementation status (in progress)

| Item | Status |
|------|--------|
| P0.1 Hibernate / discard inactive tabs | **Done** — warm budget `MAX_WARM_BACKGROUND_TABS=2`, idle hibernate, audible tabs stay warm |
| P0.2 Re-enable background throttling | **Done** — throttling on by default; briefly disabled only during thumbnail capture |
| P0.3 Lazy session restore | **Done** — background restored tabs are hibernated metadata until first focus |
| P0.4 Carousel neighbor-only thumbs | **Done** — capture ±2 around selection; never wake hibernated tabs for thumbs |
| P0.5 `will-download` session leak | **Done** — single shared session listener in `WindowManager` |
| P1 Coalesce `STATE_CHANGED` | **Done** (follow-up PR) — 32ms coalesce; immediate flush for chrome/carousel |
| P1 Omnibox history search | **Done** (follow-up PR) — `searchHistory` IPC; launcher prefetches 40 rows |
| P1 Link-preview cost controls | **Done** (follow-up PR) — no active-tab capturePage; smaller viewport; serialized captures |
| P2 Local fonts | **Done** (follow-up PR) — `@fontsource` + `browsy://font/*`; Google Fonts removed |
| P2 Startup parallelization | **Done** (follow-up PR) — chrome + first tab load in parallel; shell load non-blocking |
| Remaining P1+ | History disk batching, chrome bundle weight |

---

## Priority P0 — Fix first (many-tabs / memory / CPU)

These determine whether the app stays usable past ~15–20 tabs.

### 1. Every tab is a full live `WebContentsView` with no discard / hibernate

**Where:** `src/main/tabs/tab-manager.ts` (`createTab`, `layoutTabViews`)

**What happens today**
- Each tab allocates a Chromium renderer + compositor via `WebContentsView`.
- All tab views stay attached to `contentView`; inactive ones are only `setVisible(false)`.
- There is no discard after idle, no “sleep” that tears down `WebContents` while keeping URL/title/favicon, and no lazy materialization of session tabs.

**Why it hurts**
- Memory and GPU process count grow roughly **O(tabs)**.
- Hidden ≠ cheap in Chromium: JS timers, WebSockets, media, and layout can still run unless the process is throttled or discarded.
- Chrome/Arc/Safari all treat background tabs as discardable; Browsy does not.

**Improve**
1. Introduce tab states: `active` | `warm` | `hibernated` (URL + metadata only, no `WebContents`).
2. Hibernate after N minutes idle (or under memory pressure), keep title/favicon/thumbnail.
3. On switch: recreate `WebContentsView`, `loadURL`, restore scroll if cheap.
4. Cap concurrent warm tabs (e.g. active + last 2–3 + any audible).

---

### 2. Background throttling is explicitly disabled for every tab

**Where:**
- `tab-manager.ts` → `backgroundThrottling: false`
- `cache.ts` → `disable-renderer-backgrounding`
- Chrome overlay also uses `backgroundThrottling: false`

**What happens today**
```ts
// tab create
backgroundThrottling: false
// app startup
app.commandLine.appendSwitch('disable-renderer-backgrounding')
```
Comment intent: keep restored tabs warm for thumbnails.

**Why it hurts**
- With many tabs, this is the largest continuous CPU/GPU tax.
- Background pages keep timers, rAF, and compositor work closer to foreground rates.
- Thumbnail quality does not justify burning cycles on *every* inactive tab forever.

**Improve**
1. Default `backgroundThrottling: true` (and drop `disable-renderer-backgrounding`).
2. Temporarily disable throttling only while capturing a thumbnail / link preview.
3. Prefer snapshotting the *active* tab on leave, so carousel rarely needs to wake cold tabs.

---

### 3. Session restore eagerly creates and navigates every tab

**Where:** `window-manager.ts` → `restoreSessionTabs`

**What happens today**
- Active tab loads first (good).
- Every background URL immediately gets `createTab(..., activate=false)` + `loadURL`.
- Stagger is only `setImmediate` between tabs — not enough to protect bandwidth, CPU, or peak memory.

**Why it hurts**
- Cold start with 30 restored tabs ≈ 30 simultaneous renderer startups + network storms.
- First paint of the active tab competes with background loads.
- Audio lock helps UX, not resource contention.

**Improve**
1. Restore **metadata only** for background tabs; materialize on first focus (or lazily after active settles).
2. If eager warm-up is desired, cap concurrency (e.g. 1–2 background loads) and delay until `did-finish-load` of the active tab.
3. Optional setting: “Restore tabs as unloaded” (Chrome-style).

---

### 4. Carousel thumbnail capture wakes and snapshots tabs sequentially

**Where:** `captureCarouselThumbnails` → `captureThumbnail` → `snapshotTab` / `waitForPaint`

**What happens today**
- Opening the carousel walks **every** tab id.
- Missing thumbnails force: show view → wait for load (up to 5s) → frame subscription → double rAF via `executeJavaScript` → `capturePage({ stayAwake: true })` → JPEG base64.
- Thumbnails stored as in-memory `data:image/jpeg;base64,...` (~tens of KB each, unbounded with tab count).

**Why it hurts**
- First carousel open with many tabs can freeze UI for seconds.
- `stayAwake: true` fights power savings.
- Base64 in main + renderer IPC duplicates large strings.

**Improve**
1. Snapshot on deactivate (already partially done via `cacheActiveThumbnail`) and treat that as the source of truth.
2. Capture at most the visible carousel window (±2 neighbors), not the whole list.
3. Store thumbnails as files or `nativeImage` handles / shared buffers, not IPC’d data URLs.
4. Never block carousel open on capture — show placeholders, fill async.

---

### 5. `will-download` listener leaked on the shared session per tab

**Where:** `tab-manager.ts` `attachWebContentsHandlers`

```ts
wc.session.on('will-download', ...)
```

**What happens today**
- `session` is the default shared session.
- Every new tab adds another listener; close does not remove it.
- After N tabs (including closed ones), each download fires N handlers / dialogs.

**Why it hurts**
- Correctness bug that also wastes main-process work as tab churn grows.
- Duplicate save dialogs under load.

**Improve**
- Register **one** session-level `will-download` in `WindowManager` (route by `contents` → owning tab), or use `wc.session` once at startup and never per-tab.

---

## Priority P1 — High impact on snappiness

### 6. Unbounded / chatty `STATE_CHANGED` IPC

**Where:** Tab navigation events → `onUpdate()` → `broadcastState()` → full `BrowserState` to chrome

**Triggers (per tab):** `did-start-loading`, `did-stop-loading`, `page-title-updated`, `page-favicon-updated`, `did-navigate`, `did-navigate-in-page`, `did-finish-load`, plus chrome show/hide/switch.

**Why it hurts**
- SPA pages that update titles/history fire many IPC round-trips.
- Each broadcast rebuilds `getTabStates()` for **all** tabs and re-renders React chrome when visible.
- Background-tab title noise still wakes the chrome renderer.

**Improve**
1. Coalesce with `requestAnimationFrame` / 16–32ms debounce per window.
2. Send patches (`tab-updated`, `active-changed`) instead of full state.
3. Skip broadcasts for non-active tabs when chrome is hidden (except title for carousel inventory).

---

### 7. Omnibox loads full history (up to 5000) into the renderer on every open

**Where:**
- `store.ts` history capped at 5000
- `Omnibox.tsx` `getHistory()` on each `focusToken`
- `buildSuggestions()` scans history with `includes` until limit

**Why it hurts**
- IPC + JSON of thousands of entries every Cmd+L.
- Per-keystroke `buildSuggestions` walks history until 12 matches; worst case scans most of the list with `toLowerCase()`.

**Improve**
1. Main-process search API: `searchHistory(query, limit)` (indexed or at least prefix-filtered).
2. Omnibox only fetches recent N (e.g. 50) for empty query; query hits the search API.
3. Debounce suggestion rebuild (~30–50ms) while typing.

---

### 8. Layout work is duplicated and O(tabs) on every resize / switch

**Where:**
- `TabManager` registers `window.on('resize', onLayout)`
- `WindowManager` also registers `win.on('resize', layoutWindow)`
- `onLayout` **is** `layoutWindow` → double layout per resize
- `layoutTabViews` loops all tabs: ensure child, `setBounds`, `setVisible`

**Why it hurts**
- Resize and tab switch pay O(tabs) view mutations.
- Hibernated tabs (P0) should not be in this loop at all.

**Improve**
1. Single resize listener.
2. Only update bounds for visible / capturing views; leave others detached.
3. Debounce resize layouts (~16ms).

---

### 9. Startup creates an unused shell `BrowserWindow` document + chrome + first tab serially

**Where:** `createWindow`

**What happens today**
1. Create `BrowserWindow`, `await loadURL('data:text/html,...')` (unused shell).
2. Create chrome `WebContentsView`, `await loadURL(chrome)`.
3. `await createTab` (loads home / restore).
4. Then possibly kick off full session restore.

**Why it hurts**
- Extra WebContents for a blank shell that only exists to host `contentView`.
- Serial awaits delay first interactive frame.
- Chrome still pulls Google Fonts over the network (`renderer/index.html`).

**Improve**
1. Skip shell navigation if Electron version allows empty contentView-only usage; otherwise keep minimal and non-blocking.
2. Parallelize chrome load with first-tab creation where safe.
3. Bundle IBM Plex locally (see P2) so chrome paint is not network-bound.

---

### 10. Link previews spawn a hidden BrowserWindow and can `capturePage` the active tab on hover

**Where:** `link-preview.ts`, `handleLinkHover`, tab preload overlay

**What happens today**
- Offscreen `BrowserWindow` (1280×800) loads destination URLs (up to 7s + settle).
- Hovering a link that matches the *current* tab triggers another full-page capture.
- Overlay listeners on every page (`mouseover` capture phase).

**Why it hurts**
- Extra process + network under the user’s cursor.
- Competing with the active page for CPU during reading/browsing.
- Default setting is **on**.

**Improve**
1. Prefer Open Graph / cached screenshots over live navigations.
2. Hard-cap concurrent preview loads; cancel aggressively (partially done).
3. Never `capturePage` the active tab on hover unless cache miss and user dwells longer.
4. Consider default-off or “on delay after first use.”

---

## Priority P2 — Medium (feel / first paint / chrome weight)

### 11. Google Fonts on every `browsy://` page and chrome

**Where:** `protocol.ts`, `bookmarks-page.ts`, `shortcuts-page.ts`, `renderer/index.html`

**Why it hurts**
- New tab / home / settings / error pages block on external CSS + font files when offline or slow.
- Extra DNS/TLS for an otherwise local protocol.

**Improve**
- Ship `IBM Plex` as app assets; reference via `browsy://` or `file:` / protocol handler. Use `font-display: swap` if any remote fallback remains.

---

### 12. Chrome stack is heavy for an overlay (Chakra + Emotion + Framer Motion)

**Where:** `package.json`, `main.tsx`, `NavigationChrome`, `TabCarousel`

**Why it hurts**
- Large JS parse/compile for a mostly-hidden overlay.
- Motion + CSS-in-JS on every launcher/carousel open adds main-thread work on the chrome renderer.

**Improve**
- Keep Chakra if velocity matters, but code-split carousel/omnibox; or move chrome to lighter primitives.
- Prefer CSS transitions for opacity/transform already used in simple ways.
- Production-only: verify bundle size after `electron-vite build` and set a budget for `renderer` JS.

---

### 13. Empty-query tab inventory is capped at 12

**Where:** `buildSuggestions(..., limit = 12)` when query is empty

**Why it hurts**
- With many tabs, Spotlight cannot list/find beyond the first 12 without typing.
- Feels broken for the “many tabs” goal even if CPU is fine.

**Improve**
- Virtualized full tab list (or higher cap with windowing), fuzzy filter as user types, recent-first ordering.

---

### 14. History / store writes on every finished load

**Where:** `did-finish-load` → `addHistoryEntry` → electron-store rewrite

**Why it hurts**
- electron-store serializes JSON to disk; frequent navigations = sync disk churn on the main process.

**Improve**
- Batch history writes (flush every N seconds or on quit/blur).
- Deduplicate more aggressively (already URL-deduped) and consider SQLite later if history grows.

---

### 15. Disk cache is large; process model is default-only

**Where:** `cache.ts` (512 MB disk + 128 MB media), no custom `partition` / process limits

**Notes**
- Large cache helps repeat visits (good) but increases disk footprint.
- `SpareRendererForSitePerProcess` is enabled (good for navigation snappiness).
- No memory-pressure listener to discard tabs when the OS is tight.

**Improve**
- Listen for `memory-pressure` / low-memory signals and hibernate background tabs.
- Revisit cache budgets on low-RAM machines (or make them adaptive).

---

## Priority P3 — Lower / polish

| Item | Detail |
|------|--------|
| Double `win.show()` | `ready-to-show` and explicit `show()` — harmless but noisy. |
| Dummy shell focus steal | `focusShortcutTarget` exists because shell can steal focus — remove shell = remove edge case. |
| Favicon data URLs in state | Large favicons inflate every `STATE_CHANGED`; prefer http(s) favicon URLs or a small cache keyed by origin. |
| Link-preview cache | LRU exists (`LINK_PREVIEW_CACHE_LIMIT`) — good; ensure disposed with window. |
| Preconnect recent sites | Good for cold navigations; keep. |
| Code cache path | Good; keep. |
| Audio lock until gesture on restore | Correct UX; keep with hibernation. |

---

## Suggested implementation order

Aligned with “snappy with many tabs,” not micro-optimizing chrome CSS.

| Order | Work | Outcome |
|------:|------|---------|
| 1 | Fix session `will-download` registration | Correctness + main-process leak |
| 2 | Re-enable background throttling; snapshot-on-deactivate | Immediate CPU win |
| 3 | Lazy / hibernated session restore + idle discard | Memory scales with *active* tabs |
| 4 | Carousel: neighbor-only async thumbs, no data-URL IPC flood | Snappy Cmd←/→ |
| 5 | Coalesce / patch `STATE_CHANGED` | Quieter chrome + less IPC |
| 6 | History search in main; slim omnibox payload | Faster Cmd+L |
| 7 | Local fonts + startup parallelization | Faster home / chrome first paint |
| 8 | Link-preview cost controls | Less background contention while browsing |

---

## Acceptance checks (once fixes land)

Use these as manual / automated gates:

1. **50-tab stress:** Open 50 distinct sites (mix of heavy SPAs). Memory and CPU with chrome hidden should stay near “few warm tabs,” not 50 full renderers.
2. **Session restore:** Quit with 30 tabs; relaunch; active tab interactive quickly; others unload until focused.
3. **Carousel:** Open switcher immediately after restore — UI within one frame; thumbnails fill without jank.
4. **Cmd+L:** Open launcher with 5k history — no multi-hundred-ms hitch; typing stays ≤1 frame behind.
5. **Idle:** Leave 20 background tabs for 10+ minutes — CPU near idle aside from the active page.
6. **Download:** Create/close many tabs, then download once — single save dialog.

---

## Out of scope / already OK

- Sandbox + contextIsolation on tabs: correct; keep.
- Navigation allowlist: not a perf issue.
- MCP/API/CDP off by default: good for baseline perf.
- Staggered restore *intent* is right; only the materialization strategy needs changing.

---

## Summary

Browsy’s architecture (one `WebContentsView` per tab, always attached, never throttled, fully restored) is the opposite of what “many tabs feel light” requires. Caching and preconnect help page loads, but they cannot offset unbounded live renderers. Prioritize **lifecycle (hibernate + lazy restore)**, **throttling**, and **cheaper IPC/thumbnails**; then tighten chrome weight and fonts for first-paint polish.
