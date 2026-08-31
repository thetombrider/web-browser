# Split Tabs — UX / UI Exploration

Design exploration for showing **two tabs side by side** in one Browsy window, with keyboard access on par with the rest of the browser, and clear interaction with the **tab carousel** (hidden chrome) and **TabBar / navigation chrome** (chrome mode).

> Naming note: there is no “tabs pane” component today. Chrome mode uses `NavigationChrome` + `TabBar`. Hidden-chrome tab switching uses `TabCarousel`. This doc uses those names.

---

## 1. Why this is non-trivial in Browsy

Browsy is not a classic always-visible tab strip browser. Tab UX is **mode-dependent**:

| Mode | How you see / switch tabs | Content layout |
|------|---------------------------|----------------|
| **Chrome visible** (`Cmd/Ctrl+L`) | Horizontal `TabBar` above omnibox | Page inset under ~100px chrome |
| **Chrome hidden** (default browsing) | Peek strip only; `Cmd+←/→` opens **carousel** | Full-bleed page |
| **Carousel open** | Thumbnail switcher overlay | Chrome view fullscreen; pages underneath |

Today the main process attaches **only one** `WebContentsView` (`activeTabId`). Split requires a first-class “two visible tabs” model in layout, focus, chrome, session, and shortcuts — not just a UI overlay.

Existing horizontal-space competitor: **DevTools docked right** (`F12`). Any split design must define stacking with DevTools.

---

## 2. Goals

1. Show two live tabs, each roughly half the window.
2. Fully usable without the mouse (enter, exit, focus swap, replace a side, close).
3. Feel native to Browsy: overlay chrome, carousel when chrome is hidden, minimal chrome when browsing.
4. Keep the mental model small — prefer one clear “split pair” over arbitrary tiling.

Non-goals for v1:

- More than two panes
- Vertical split
- Persistent multi-column workspaces / saved layouts
- Drag-to-snap from TabBar (optional later)

---

## 3. Core interaction models (options)

### Option A — Focused pair (recommended)

Window state holds a split pair plus which side is focused:

```ts
split: {
  leftTabId: string
  rightTabId: string
  focused: 'left' | 'right'
  ratio: number // default 0.5; optional resize later
} | null
```

- Both tabs stay in the global tab list; split does not create a separate “workspace.”
- The **focused** side is what omnibox, back/forward, reload, close, and most shortcuts target.
- `activeTabId` either becomes an alias of the focused split tab, or stays as “primary” while `split.focused` overrides routing — prefer **alias** so existing APIs keep working.

**Enter split**

| Trigger | Behavior |
|---------|----------|
| `Cmd/Ctrl+\` (or `Cmd/Ctrl+Shift+D`) | Split: focused tab stays on left; right opens next tab in list, or a new home tab if only one tab exists |
| From chrome: secondary action on a tab | “Open beside” → that tab becomes the other side |
| From carousel: modifier commit | See §5 |

**Exit split**

| Trigger | Behavior |
|---------|----------|
| `Cmd/Ctrl+\` again (toggle) | Unsplit; focused tab remains full-bleed |
| Close one side’s only copy | Other side expands to full |
| `Esc` | Does **not** exit split (Esc already hides chrome / dismisses carousel) |

**Focus**

| Trigger | Behavior |
|---------|----------|
| `Cmd/Ctrl+Alt+←/→` or `Cmd/Ctrl+Shift+←/→` | Focus left / right pane |
| Click in a pane | Focus that pane (mouse) |
| `Cmd+←/→` | Tab cycle / carousel — **not** pane focus (preserve existing meaning) |

### Option B — Carousel-native “pick other half”

Same layout as A, but **primary enter path** is the carousel:

1. User is browsing (chrome hidden).
2. `Cmd+\` freezes current tab as “anchor” (left) and opens carousel in **“choose right pane”** mode.
3. `Enter` commits selection as the right tab; Esc cancels and leaves unsplit.

Pros: reuses the strongest keyboard tab picker; teaches one path.  
Cons: chrome-mode users need a parallel path; first-time discoverability of the mode flag matters.

### Option C — Arc / Zen style “split from tab strip”

Split only creatable from TabBar (drag tab to edge, or pin a second row). Poor fit for Browsy’s hidden-chrome default and keyboard-first ethos. Reject for v1; keep as optional mouse affordance later.

### Option D — New window instead of in-window split

Already possible via `Cmd/Ctrl+N`. Does not satisfy “two tabs in one window.” Useful as the escape hatch when DevTools + split fight for width.

---

## 4. Chrome mode (TabBar / navigation chrome)

When chrome is visible, users already see all tabs and can switch instantly with `Cmd+←/→` (no carousel).

### 4.1 Visual treatment of the TabBar

**Recommended:** keep a **single shared TabBar** (one list of all tabs). Mark the split pair without inventing a second strip:

- Focused split tab: existing `browsy.active` chip.
- Other visible (unfocused) split tab: secondary mark — e.g. left/right accent bar or subtle paired background (`browsy.hover` + thin accent edge), not a second “active” fill.
- Optional tiny glyphs `‹` / `›` or a split icon on the pair only — keep chips at 28px height; no new card chrome.

Avoid: two mini TabBars (one per pane). That fights the single omnibox and doubles density in a ~100px overlay.

### 4.2 Omnibox & nav controls

- Omnibox, back, forward, reload always bind to the **focused** pane.
- Opening chrome (`Cmd/Ctrl+L`) while split: focus omnibox as today; URL reflects focused tab.
- Switching tabs via TabBar click:
  - Click a tab that is already in the split → focus that side (no layout change).
  - Click a tab **outside** the pair → **replace focused side** with that tab (pair stays). Alternative (stricter): exit split and show only that tab — clearer but more destructive. Prefer **replace focused side** so split survives browsing.
- New tab (`Cmd/Ctrl+T` / `+`): create tab and put it in the **focused** side (replace), or open as focused full-tab and dissolve split. Prefer **replace focused side** for consistency with click-switch.
- Close (`Cmd/Ctrl+W`): close focused tab; if it was in the pair, expand the remaining side (exit split).

### 4.3 Discoverability in chrome

- Omnibox command: `/split` (toggle) and optionally `/split-left`, `/split-right` later.
- Shortcuts page: document enter/exit and focus-swap.
- No permanent split toolbar in the first viewport of chrome — one composition, one job. A quiet pair mark on TabBar is enough.

---

## 5. Hidden chrome & carousel interaction

This is the highest-risk design surface: `Cmd+←/→` already means “open/move carousel,” and carousel commit means “make this the only visible tab.”

### 5.1 While split is active and chrome is hidden

| Input | Proposed behavior |
|-------|-------------------|
| `Cmd+←/→` | Open carousel in **replace-focused** mode (default). Hint text: “Enter to put here · Esc to cancel”. Committing replaces the focused half only; the other half stays. |
| `Cmd+\` | Toggle unsplit (focused expands). |
| Focus swap shortcut | Moves keyboard focus between live panes without overlay. |
| Peek / show chrome | Unchanged; chrome overlays both halves with shared TabBar. |

Do **not** make bare `Cmd+←/→` swap panes — that would break the carousel muscle memory when chrome is hidden.

### 5.2 Carousel modes when split exists (or when entering split)

| Mode | How entered | Enter commits… | Hint copy |
|------|-------------|----------------|-----------|
| **Switch** (today) | `Cmd+←/→` with no split | Full-window active tab | “Enter to switch · Esc to cancel” |
| **Replace focused** | `Cmd+←/→` while split | Focused half only | “Enter to put on left/right · Esc to cancel” |
| **Pick other half** (Option B) | `Cmd+\` from unsplit | Opens split with selection as opposite pane | “Enter to split with this tab · Esc to cancel” |

UI delta for replace / pick modes:

- Keep existing card carousel motion.
- Change bottom hint + top counter context (`Left · 2 / 5` or `Split with · 2 / 5`).
- Optional: dim the live “anchor” half under the overlay with a thin side label (“keeping left”) — avoid floating badges on cards; label the chrome overlay edges instead.

### 5.3 Carousel while chrome would be visible

Unchanged: if chrome is visible, `Cmd+←/→` instantly cycles tabs (today). Under split + chrome visible:

- Cycle should move **focused side** through the tab list (skipping or including the other half — prefer **including**, and if you land on the other half’s tab, treat as focus swap).

### 5.4 Closing from carousel

Today `Cmd/Ctrl+W` in carousel closes the **selected** carousel tab. Keep that. If closing dissolves the split (one side gone), dismiss carousel if &lt;2 tabs remain (existing rule).

---

## 6. Keyboard map (proposal)

New / changed only; existing shortcuts keep priority where noted.

| Shortcut | Context | Action |
|----------|---------|--------|
| `Cmd/Ctrl+\` | Normal | Enter split (current + next/new on right) |
| `Cmd/Ctrl+\` | Split | Exit split (focused full) |
| `Cmd/Ctrl+\` then carousel (alt flow) | Option B | Pick other half |
| `Cmd/Ctrl+Alt+←` / `→` | Split | Focus left / right pane |
| `Cmd+←` / `→` | Chrome hidden, unsplit | Carousel switch (unchanged) |
| `Cmd+←` / `→` | Chrome hidden, split | Carousel replace-focused |
| `Cmd+←` / `→` | Chrome visible | Cycle focused side (adapted) |
| `Enter` / `Esc` | Carousel | Commit / dismiss (unchanged semantics, mode-specific target) |
| `Cmd/Ctrl+W` | Split, no carousel | Close focused tab; may unsplit |
| `Cmd/Ctrl+L` | Split | Show chrome; omnibox → focused tab |
| `/split` | Omnibox | Toggle split |

**Avoid colliding with:** `Cmd+[` / `]` (back/forward), `Cmd+T/W/L/N`, carousel Enter/Esc.

Platform note: today next/prev tabs are **Meta-only** (`Cmd`), not Ctrl — keep that quirk for carousel; new split shortcuts should work with Ctrl **or** Cmd like `L`/`T`/`W`.

---

## 7. Visual / layout options for the content area

Layout lives in main-process `layoutTabViews`, not React.

### 7.1 Geometry

```
┌──────────────── chrome overlay (optional) ────────────────┐
├─────────────────────┬─────────────────────────────────────┤
│     Left tab WC     │           Right tab WC              │
│   (focused ring?)   │                                     │
└─────────────────────┴─────────────────────────────────────┘
```

- Default ratio `0.5`; hairline divider (`1px`, `browsy.border`).
- Focus indicator: **inset 2px accent outline** on the focused pane only — not a floating badge. Matches carousel’s accent language without stickers on content.
- Chrome inset (`topInset`) applies to **both** panes equally when navigation chrome is open.
- Peek/drag region stays full width on top.

### 7.2 Divider resize

v1: fixed 50/50.  
v1.1: drag divider + `Cmd/Ctrl+Alt+[` / `]` nudge ratio. Skip until the keyboard model is solid.

### 7.3 DevTools collision

When focused tab opens DevTools (`mode: 'right'`):

| Strategy | Notes |
|----------|-------|
| **A. Temporarily unsplit** | Simplest; toast “Split closed for DevTools” |
| **B. DevTools replaces the other half** | Surprising if the other half had a live page |
| **C. DevTools inside focused half only** | Best long-term if Electron allows nested bounds; verify |

Recommend **A for v1**, **C if feasible** after a spike.

### 7.4 Internal pages (`browsy://home|settings|…`)

Internal pages force navigation chrome today. Under split:

- Allow internal page in one half; chrome still global.
- Opening an internal page in focused half should not dissolve the other half.

---

## 8. Motion & polish (taste-aligned)

Ship 2–3 intentional motions, not noise:

1. **Enter split** — other pane slides/wipes in from the right (~180ms, same ease as carousel).
2. **Focus swap** — accent outline cross-fades; no content slide.
3. **Exit split** — focused pane expands; other fades out.

Reuse tokens: `browsy.accent`, `browsy.border`, `browsy.backdrop` for overlays. No new purple glow / pill clusters. Divider is a line, not a card.

---

## 9. Comparison matrix

| Criterion | A Focused pair + shortcut | B Carousel-first pick | C TabBar-drag only |
|-----------|---------------------------|----------------------|--------------------|
| Keyboard-first | Strong | Strongest enter path | Weak |
| Fits hidden chrome | Good if carousel replace mode exists | Excellent | Poor |
| Fits TabBar chrome | Good with pair marks | Needs extra chrome entry | Natural for mouse |
| Mental load | Low (toggle + focus) | Medium (carousel modes) | Low but incomplete |
| Impl surface | State + layout + shortcuts | Same + carousel mode flag | Drag UX + layout |
| Risk to `Cmd+←/→` | Contained (mode-aware) | Contained | None |

**Recommendation:** implement **Option A** as the product model, with **Option B’s carousel “pick other half”** as an *additional* enter path (not the only one), and **carousel replace-focused** whenever split is already active. Skip C for v1.

---

## 10. Architecture touchpoints (for a later implementation PR)

| Area | Change |
|------|--------|
| `BrowserState` / types | Add `split` (+ maybe `carousel.mode`) |
| `TabManager.layoutTabViews` | Attach two views; half bounds; topInset |
| `WindowManager` shortcuts | Split toggle, focus swap, carousel mode |
| `TabBar` | Pair / focused-vs-visible styling |
| `TabCarousel` | Mode-aware hints; commit targets |
| Session store | Persist pair + ratio optional |
| API / MCP | Optional `split` / `focus_pane` later |
| Shortcuts page | Document new keys |

---

## 11. Open questions

1. **Replace vs dissolve** when choosing a tab outside the pair from TabBar — this doc prefers replace focused side.
2. **Whether the unfocused split tab stays “warm”** (attached `WebContentsView`) — yes; required for live side-by-side.
3. **Shortcut chord for focus swap** — `Ctrl/Cmd+Alt+Arrow` vs `Ctrl/Cmd+Shift+Arrow`; need to avoid OS/Electron conflicts on Linux/macOS.
4. **Should split survive session restore?** Likely yes if both URLs restore.
5. **Minimum window width** before refusing split or auto-unsplit (e.g. &lt; 800px).

---

## 12. Suggested phased delivery

1. **Spike:** dual `WebContentsView` layout + focus routing + DevTools behavior.
2. **v1:** Option A toggle, focus swap, TabBar pair marks, carousel replace-focused, `/split`, shortcuts page.
3. **v1.1:** Carousel “pick other half” enter path, optional divider resize, session persistence, agent API.

This keeps the keyboard story coherent with today’s chrome-vs-carousel split personality instead of fighting it.
