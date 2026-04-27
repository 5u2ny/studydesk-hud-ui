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

## Use

- **Today** — shows current focus, next deadline, due today/tomorrow/this week,
  critical alerts, confusions, and the recommended next action.
- **Courses** — create course workspaces for assignments, deadlines, captures,
  study items, and confusions.
- **Deadlines** — replaces the generic calendar with academic due-date clarity.
- **Capture** — highlight text in any app and press `Cmd+Shift+C`; turn captures
  into flashcards, concepts, or confusions.
- **Study** — keep flashcards, concepts, definitions, questions, exam hints, and
  unresolved confusions in one review queue.
- **Critical Alerts** — Gmail is optional. When enabled, local rules surface only
  emails that likely require action; Focus OS does not generate reply drafts.
- **Tabs** — `Cmd+1..7` switches between Today / Courses / Deadlines / Capture /
  Study / Alerts / Settings. `Cmd+K` focuses the task input.

API keys are optional. Gmail tokens are encrypted via macOS Keychain
(`safeStorage`) when Gmail is connected.

## Stack

Electron 41 · React 18 · TypeScript 5.9 · Vite 8 · Tailwind · Radix UI ·
TipTap 2 (notes) · `uiohook-napi` (global capture shortcut) ·
local JSON persistence in `src/main/services/store.ts` · `imapflow` +
`mailparser` (optional Gmail critical alerts) · deterministic local rules by
default.

See [`CLAUDE.md`](./CLAUDE.md) for the architecture deep-dive and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev workflow. MIT licensed.
