# Focus OS Student Edition

A free, open source, local-first academic command center for students. Focus OS
turns courses, syllabi, assignments, captures, study items, confusions, and
critical emails into a calm Today view, deadline board, and focus HUD.

Core flows work without paid AI APIs, hosted models, Ollama, or continuous local
model inference. AI is optional and disabled by default.

## Install

```bash
git clone https://github.com/5u2ny/focus-os.git
cd focus-os
npm install
npm start
```

Requires macOS, Node 20+, and Xcode Command Line Tools
(`xcode-select --install`). On first launch, grant **Accessibility**
permission to Focus OS in System Settings → Privacy & Security so the global
mouse hook can drive auto-capture.

## Notch UI

Focus OS lives in the MacBook notch. The floating window is a frameless
always-on-top panel pinned to the exact top-center of the display, matching the
hardware notch height pixel-for-pixel (38 px on M-series Pro, 32 px on Air).

### Layout

The shell is a three-part horizontal bar: **left wing** (120 px), **center cap**
(180 px, hidden behind the physical notch), and **right wing** (120 px). Wings
are invisible at rest; hovering over the notch area expands the shell sideways
with a 280 ms ease-out transition, revealing:

- **Left wing** -- Pomodoro timer display and idle status chips (next deadline,
  due review count).
- **Center cap** -- Opaque black fill continuous with the hardware notch. Blank;
  acts as the hover target.
- **Right wing** -- Feature dock icons (Today, Courses, Deadlines, Capture,
  Study, Alerts, Workspace, Settings) with numeric badges.

Clicking a dock icon opens a **popover panel** (540 x 380 px) that drops below
the bar. Each popover renders live data from the local store; there are no
mock views. A native Objective-C addon (`notch_helper.node`) removes AppKit
window constraints so the panel can overlap the menu bar and attach flush to
the display top edge.

### Tray icon

A menu-bar tray icon shows a circular progress ring colored by the current
timer phase (red for focus, green for break, blue for long break). The ring
updates every tick and doubles as a quick launcher: Show, Notes, Quit.

### Workspace window

Clicking the Workspace dock icon (or `ipc:window:openWorkspace`) opens a
separate 920 x 680 standard-frame window with a TipTap note editor, course
sidebar, tool tabs (Today, Quiz, Flashcards, Assignment, Syllabus, Class),
and a right rail showing deadlines, assignment checklist, study queue,
confusions, and alerts. The workspace hides on close rather than destroying,
so reopening is instant.

## Features

- **Today** -- current focus, next deadline, due today/tomorrow/this week,
  critical alerts, confusions, and the recommended next action.
- **Courses** -- course workspaces for assignments, deadlines, captures,
  study items, and confusions.
- **Deadlines** -- academic due-date board replacing a generic calendar.
- **Capture** -- highlight text in any app and press `Cmd+Shift+C`; turn
  captures into flashcards, concepts, or confusions.
- **Study** -- flashcards, concepts, definitions, questions, exam hints, and
  unresolved confusions in one review queue.
- **Syllabus Import** -- paste or select a syllabus note, parse it into
  courses, assignments, deadlines, and setup tasks, then review and confirm.
- **Critical Alerts** -- Gmail is optional. When enabled, local rules surface
  only emails that likely require action; Focus OS does not generate reply
  drafts.

API keys are optional. Gmail tokens are encrypted via macOS Keychain
(`safeStorage`) when Gmail is connected.

## Stack

Electron 41 · React 18 · TypeScript 5.9 · Vite 8 · Tailwind · Radix UI ·
TipTap 2 (notes) · `uiohook-napi` (global capture shortcut) ·
local JSON persistence in `src/main/services/store.ts` · `imapflow` +
`mailparser` (optional Gmail critical alerts) · deterministic local rules by
default.

## Troubleshooting

**Stale renderer after rebuild.** Electron aggressively caches compiled
renderer JS. If the UI shows old text or layout after `npm run build`, clear
the cache before relaunching:

```bash
rm -rf ~/Library/Application\ Support/focus-os/Cache \
       ~/Library/Application\ Support/focus-os/Code\ Cache
npm start
```

This only removes V8 bytecode and Blink resource caches. User data in
`focus-os-store.json` is not affected.

See [`CLAUDE.md`](./CLAUDE.md) for the architecture deep-dive and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev workflow. MIT licensed.
