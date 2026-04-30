# StudyDesk UI Contract

This contract locks the product architecture for future phases. Any new feature must fit this shell unless the design contract is intentionally revised.

## Fixed Architecture

- The app opens inside a centered macOS liquid-glass window with traffic lights, soft blue wallpaper bleed, white rim, and heavy backdrop blur.
- The top row is always the primary HUD: timer pill on the left, feature navigation in the center, search/alerts/settings on the right.
- The workspace body is always three zones: left resource rail, central work surface, right intelligence rail.
- The left rail owns courses, syllabus imports, assignment prompts, notes, and captures.
- The central surface owns the current task: editor, assignment parser, quiz, flashcards, syllabus import, dashboard, or class mode.
- The right rail owns deadlines, checklist progress, study queue, unresolved questions, and local alerts.
- Phase 3 central surfaces are first-class architecture: Dashboard, Quiz, Flashcards, Syllabus Import, and Class Mode must render inside the same central work surface rather than replacing the shell.
- Phase 4 workflow controls must call existing IPC services from inside the shell. Do not create parallel client-only workflow state when a persisted service already exists.

## Visual Rules

- Use translucent white and pale blue glass, not dark panels.
- Use blue as the primary action color, cyan for parser/extraction confidence, orange only for urgency, green only for completion.
- Keep controls compact and macOS-like: rounded icon pills, segmented tabs, narrow section headers, and crisp hairline borders.
- Do not introduce marketing-style hero sections, decorative blobs, or unrelated layout experiments.
- Preserve the same spacing scale: 10-16px rail gaps, 12-16px panel padding, 34-44px controls, and 15-17px card radius.

## Phase Check

Before ending any future UI phase:

- The app must still show the top HUD, left resource rail, central work surface, and right intelligence rail.
- The full workspace preview must render at desktop size without overlapping text or clipped controls.
- Every top navigation tab must route to a visible in-shell workspace surface; tab clicks must not create or mutate data unless the user presses an explicit action button inside the surface.
- Workflow buttons for review, resolve, complete, start, and end must refresh shared workspace data after completion so the side rail and central surface stay in sync.
- `npm run typecheck`, `npm run build:renderer`, and `npm test` must pass or the failure must be documented with the exact blocker.
