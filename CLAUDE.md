# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<critical>
Obey every rule in this file unless I explicitly override it for this repo. If a user request conflicts with these rules, explain the conflict briefly and follow the rules.
</critical>

<critical>
Prefer reusing and editing existing code over generating new files, new architectures, or large boilerplate. Default to minimal diffs and patches.
</critical>

<critical>
Be extremely concise in output. Avoid reprinting large files, long summaries, or repeated explanations unless explicitly requested.
</critical>

## Approach

- Read existing files before writing. Don't re-read the entire repo; open only the specific files needed for the current task or ones that changed.
- Thorough in reasoning, concise in output. Think in detail, but keep visible responses short and focused on actions or patches.
- Skip files over 100KB unless required for the task.
- No sycophantic openers or closing fluff.
- No emojis or em dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.
- Prefer:
  - Small diffs over full-file rewrites.
  - Pointers to existing functions/components over re-implementations.
  - Referencing existing docs/comments instead of rephrasing them at length.

## Token and context discipline

- Do not summarize the entire repository or architecture unless explicitly asked.
- Do not restate the user’s prompt, this CLAUDE.md, or existing comments back to the user.
- When changing code:
  - Show only the minimal diff or the smallest relevant snippet.
  - Avoid printing whole files unless the user explicitly says “show the full file”.
- When exploring the repo:
  - Open targeted files by path instead of scanning many unrelated files.
  - Reuse knowledge from earlier in the session; do not repeatedly re-open the same file unless it changed.
- Keep explanations tight:
  - Default to a short answer plus a patch or concrete steps.
  - Offer “I can explain more if you want details” instead of writing long essays.

## Common commands

```bash
npm start              # build + launch Electron (full app)
npm run build          # build:renderer + build:main
npm run build:renderer # vite build (3 entry points: floating, notes, freeze)
npm run build:main     # tsc -p tsconfig.main.json (main process)
npm run dev:renderer   # vite dev server on :7331 (main still needs to be rebuilt separately)
npm run typecheck      # tsc --noEmit -p tsconfig.json
npm test               # vitest run (all tests)
npx vitest run src/renderer/floating/notch/notchSizing.test.ts  # single test file
npx vitest run -t "fixed cap"                                   # single test by name

# Launching without the build step (faster iteration on main):
./node_modules/.bin/electron . > /tmp/focus-app.log 2>&1 &
tail -f /tmp/focus-app.log
tail -f /tmp/focus-app.log | grep -E "capture|gmail|ax"
```

## Path aliases

Both `tsconfig.json` and `vite.config.ts` define these:
- `@shared/*` resolves to `src/renderer/shared/*`
- `@schema` resolves to `src/shared/schema/index.ts` (shared between main + renderer)

When something fails silently in the running app, the renderer console errors are forwarded to the main process log via the hook installed in `windowManager.createFloatingWindow`. **Always check `/tmp/focus-app.log` before adding more `console.log`.**

## Three-process architecture

1. **Main process** (`src/main/*.ts`) — Node.js, owns the filesystem, IPC handlers, native modules, window lifecycle, and all services (capture, Gmail OAuth/IMAP, LLM, store).
2. **Preload bridges** (`src/preload/*Preload.ts`) — `contextBridge.exposeInMainWorld('focusAPI', ...)` plus explicit allowlisted `electron.invoke/on/off` bridges. Renderers call `window.focusAPI.*` for timer/window methods or `ipc.invoke('approved:channel', payload)` from `@shared/ipc-client` for approved channels only.
3. **Three renderers**, each with its own Vite entry point in `vite.config.ts`:
   - `floating/` — the always-on-top Spotlight-style command bar (the hero UI)
   - `notes/` — persistent TipTap editor in a hide-on-close BrowserWindow
   - `freeze/` — full-screen lock overlays during forced focus blocks

Renderer↔main communication is **always async via IPC**. Adding a new feature usually means: schema field → focusStore mutator → service method → IPC handler in `src/main/ipcHandlers.ts` → `src/preload/floatingPreload.ts` allowlist → `src/renderer/shared/ipc-contracts.ts` → renderer call site.

## Single source of truth: focusStore

Persistence is one JSON file at `~/Library/Application Support/focus-os/focus-os-store.json`, managed by the local JSON wrapper in `src/main/services/store.ts`. The schema lives in `src/shared/schema/index.ts` (`StoreData`, `Settings`, `DEFAULT_SETTINGS`, plus all entity types). When adding a field:

1. Edit `Settings` (or the relevant interface) in `src/shared/schema/index.ts`.
2. If it has a default, add to `DEFAULT_SETTINGS`.
3. Add a focusStore mutator in `src/main/services/store.ts` if it needs special logic; otherwise direct `focusStore.updateSettings({ ... })` is fine.
4. Add a typed IPC contract in `src/renderer/shared/ipc-contracts.ts` and expose the channel through the relevant preload allowlist.
5. Surface in `src/renderer/floating/components/SettingsPanel.tsx` or the relevant Student Edition section.

Student Edition academic entities are first-class local data: courses, assignments, academic deadlines, class sessions, study items, confusion items, and critical email alerts. `calendarEvents` remains in the schema only for old-store compatibility; do not build new generic calendar features on it.

Sensitive values (Gmail OAuth refresh token, LLM API key, Gmail App Password) go through `src/main/services/keychain/secureStore.ts` which wraps Electron's `safeStorage` (macOS Keychain). They're stored as base64-encoded ciphertext under `*Encrypted` field names in the schema.

## Highlight capture (the trickiest part)

`src/main/services/capture/captureService.ts`. Three things you need to know:

- **AX is dead in Electron-based apps.** `AXSelectedText` returns "missing value" inside Claude desktop, VSCode, Slack, Cursor, etc. We tried osascript-via-System-Events and a compiled Swift helper — both were rejected by the sandbox boundary or returned empty.
- **What works everywhere:** the **PopClip pattern** via `uiohook-napi`. Listen for global `mouseup`, check the drag distance from the recorded `mousedown` (>5px → likely a selection), wait 80ms for the host app to settle, synthesize `Cmd+C` via `osascript`, read the clipboard, restore the original clipboard contents, save the captured text. Implemented in `captureFromMouseUp()`.
- **Three global hotkeys are registered:** `Cmd+Shift+C`, `Cmd+Option+C`, `Cmd+Shift+9`. Cmd+Shift+C is hijacked by Chrome/Safari DevTools "Inspect Element" mode in browser contexts, so the fallbacks exist.

`uiohook-napi` is a native module — it must match the Electron runtime. If you bump Electron, run:

```bash
./node_modules/.bin/electron-rebuild -f -w uiohook-napi
```

## Gmail and critical alerts

Two connection paths live in `src/main/services/gmail/`, both feeding `imapClient.ts` through `imapflow`:

1. **App Password** (`gmailService.connect`) — legacy. Most Workspace accounts have this disabled by admin policy and Google has been quietly removing the option for many personal accounts in 2024–2025.
2. **OAuth2 PKCE + loopback** (`oauth.ts` → `gmailService.oauthConnect`) — the path that actually works for everyone. Spins up `http://127.0.0.1:<random>/callback`, opens the system browser to Google consent, exchanges the code for tokens, stores both encrypted in Keychain. Access tokens auto-refresh via `getValidAccessToken()` when they expire (1h lifetime).

OAuth credentials can be **shipped with the app** by editing `src/main/services/gmail/oauthConfig.ts` (`SHIPPED_OAUTH.clientId`/`clientSecret`) — when these are non-empty, the SettingsPanel hides the per-user Client ID/Secret fields and gives a true one-click "Sign in with Google". Currently empty, so users supply their own credentials from a Google Cloud project.

Required scopes: `openid email https://mail.google.com/`. Without `email`, the userinfo lookup fails after the OAuth round-trip — the `id_token` claim is read first as a faster fallback than calling `/oauth2/v2/userinfo`.

Email reply drafting is intentionally removed from the Student Edition product. Keep email behavior to rule-based critical alerting, reason/next-action display, snooze, dismiss, resolve, and convert-to-task. Do not add a generic inbox client or AI draft reply surface.

## Window chassis

`src/main/windowManager.ts`:

- The floating bar uses **Electron's `vibrancy: 'hud'`** option (real `NSVisualEffectView`), positioned at `workArea.height * 0.18` below the menu bar (Sol-style "biased above midline").
- The Spotlight surface CSS background must stay around **rgba(12,12,16,0.66)** — too transparent and white text vanishes against bright wallpapers; too opaque and the vibrancy is wasted.
- Notes window uses **hide-on-close** — `app.isQuitting` flag in `src/main/index.ts` lets `before-quit` actually destroy it; otherwise close just hides.
- Three window dimensions: `COLLAPSED { 728x72 }`, `EXPANDED { 728x460 }`, `ISLAND { 280x52 }`. The bar always recenters horizontally on resize.

## Notch UI (the floating window's current mode)

The floating window renders as a hardware-notch-style overlay anchored to the top center of the screen. Architecture lives in `src/renderer/floating/notch/`:

- **notchSizing.ts** — window dimensions per state (`idle`, `hoverDock`, `activePopover`, `workspaceOpening`). The cap is a fixed 220px-wide black pill that never changes shape. `activePopover` widens the BrowserWindow to 540px to accommodate the widget below.
- **NotchShell.tsx** — the root layout: fixed cap on top, popover floats below with a 12px transparent gap. Clicking the cap opens "Today" as the default feature.
- **NotchPopover.tsx** — the Liquid Glass widget panel. Dock navigation icons (feature-switching buttons) live inside the popover header, not in the cap.
- **NotchIdle.tsx** — content inside the cap: timer ring + info chips.
- **notchModel.ts** — data derivation (idle chips, live status text, badges, feature order).
- **SFIcons.tsx** — hand-crafted SF-Symbols-style SVG icons for the 14px menu-bar size.

**Design rules:**
- The cap must stay fixed width in all states (idle, hover, expanded). Never widen it.
- No dock icons, side pods, or controls in the macOS menu-bar strip. All feature navigation goes in the popover.
- CSS in `floating.css` under `.studydesk-notch-*` selectors. Shell width is `--shell-width: 220px`, never overridden.

**Native addon** (`src/main/native/notch_helper.mm`):
- Uses private CGS APIs (`CGSSpaceCreate`, `CGSSpaceSetAbsoluteLevel`, `CGSAddWindowsToSpaces`) to place the window at INT_MAX level -- above everything including the menu bar.
- Swizzles `constrainFrameRect:toScreen:` to let the window sit at y=0 (flush with screen top edge).
- Built via `node-addon-api`; rebuild with `electron-rebuild` when bumping Electron.
- IPC: `resizeWindow(h, w, topCenter)` repositions from App.tsx via `window.focusAPI.resizeWindow()`.

## UI primitives (shadcn-style, hand-rolled)

`src/renderer/shared/ui/` contains `tabs.tsx` (wraps `@radix-ui/react-tabs`), `button.tsx` (cva variants: `default | phase | ghost | icon`), `input.tsx`. Tailwind config lives in `tailwind.config.js`; tokens in `src/renderer/floating/styles/globals.css`. The `phase-*` utility classes (`phase-text`, `phase-bg-soft`, `phase-border`, `phase-glow`) read from CSS variables `--phase-r/g/b` set dynamically in `App.tsx` based on the current timer phase.

## Known footguns

- **TipTap content cannot be `{}`.** `JSON.parse('')` throws, and `JSON.parse('{}')` returns `{}`, which is not a valid ProseMirror doc. Always pass either an empty string or `{type:'doc',content:[...]}`. See `parseContent()` in `notes/Editor.tsx`.
- **useCallback TDZ in App.tsx:** the keyboard `useEffect` references `closeSettings` (a `useCallback`) — it must appear *after* that callback in source order, otherwise the dependency array reads an undefined slot during render and throws "Cannot access 'B' before initialization."
- **Spawned binaries don't inherit Electron's AX permission.** macOS attaches AX grants per bundle ID. A Swift helper compiled into `~/Library/Application Support/focus-os/ax-selection-reader` would need its OWN whitelist entry. Don't go down this path again — use the `uiohook-napi` mouse-up trick.

## Capture flow at a glance

```
mouseup (uiohook) -> drag distance > 5px?
  -> wait 80ms
  -> save clipboard
  -> synthesize Cmd+C (osascript)
  -> read clipboard (the selection)
  -> restore original clipboard
  -> emit 'capture:new' to renderer via IPC
```
