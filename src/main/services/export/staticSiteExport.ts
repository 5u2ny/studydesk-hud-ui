// Static-site publish — port from MkDocs.
//
// Take a set of notes (optionally filtered by course) and emit a
// browsable static site to a chosen directory:
//
//   <out>/
//     index.html              landing page with note list + search box
//     notes/<slug>.html       one HTML file per note
//     search-index.json       plain-text dump per note for client-side search
//     assets/site.css         shared stylesheet
//     assets/search.js        tiny client-side search (no lunr — just a fast
//                             substring scorer over the JSON index, ~30 LOC)
//
// We deliberately don't pull in lunr.js as a dep. For a few-hundred-note
// vault, an in-browser substring + heading-weight scorer is sub-50ms and
// keeps the published site dependency-free.

import * as path from 'node:path'
import * as fs from 'node:fs'
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import type { Note, Course } from '../../../shared/schema/index'

interface PublishOptions {
  notes: Note[]
  courses: Course[]
  /** Filter — null/undefined publishes everything. */
  courseId?: string
  /** Output directory (must already exist; we create children). */
  outDir: string
  /** Optional site title — defaults to course name or "StudyDesk". */
  siteTitle?: string
}

interface SearchEntry {
  slug: string
  title: string
  course?: string
  text: string
}

/** Convert a note title to a safe URL slug. */
function slugify(title: string, fallback: string): string {
  const base = (title || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || fallback
}

/** Strip plain text from a TipTap doc — for the search index. */
function plainText(node: any): string {
  if (!node) return ''
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  const inner = Array.isArray(node.content) ? node.content.map(plainText).join(' ') : ''
  const sep = node.type === 'paragraph' || node.type === 'heading' ? ' ' : ''
  return inner + sep
}

const SITE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  font: 16px/1.6 -apple-system, system-ui, 'SF Pro Text', 'Segoe UI', sans-serif;
  margin: 0; background: #fafafb; color: #1f2024;
}
@media (prefers-color-scheme: dark) {
  body { background: #0e0e12; color: #ececef; }
  a { color: #7eaaff; }
  .card { background: #16171b; border-color: #26272d; }
  .meta { color: #8e8e94; }
}
.container { max-width: 760px; margin: 0 auto; padding: 32px 20px; }
h1, h2, h3 { line-height: 1.25; }
h1 { font-size: 28px; margin: 0 0 14px; }
h2 { font-size: 19px; margin: 22px 0 8px; }
h3 { font-size: 15px; margin: 14px 0 6px; }
.meta { font-size: 13px; color: #6f6f76; margin-bottom: 24px; }
a { color: #2c5fb0; text-decoration: none; }
a:hover { text-decoration: underline; }
.search { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(120,120,128,0.20); background: transparent; color: inherit; font-size: 15px; margin-bottom: 18px; }
.card-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.card { padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(120,120,128,0.15); background: #fff; }
.card h3 { margin: 0 0 4px; font-size: 16px; }
.card p { margin: 0; font-size: 13px; color: #6f6f76; }
blockquote { margin: 10px 0; padding-left: 14px; border-left: 3px solid #c4c4cc; color: #58585e; }
code { font: 13px 'SF Mono', Menlo, monospace; background: rgba(120,120,128,0.10); padding: 1px 5px; border-radius: 3px; }
pre code { display: block; padding: 12px; }
hr { border: 0; border-top: 1px solid rgba(120,120,128,0.20); margin: 18px 0; }
img { max-width: 100%; }
sup.footnote-ref { color: #b88600; font-weight: 700; font-size: 11px; }
sup.footnote-ref::before { content: "[" counter(footnote) "]"; }
body { counter-reset: footnote 0; }
sup.footnote-ref { counter-increment: footnote; }
`

const SEARCH_JS = `(function(){
  const input = document.getElementById('search');
  const list = document.getElementById('cards');
  if (!input || !list) return;
  let entries = [];
  fetch('search-index.json').then(r => r.json()).then(data => { entries = data; }).catch(()=>{});
  function score(entry, q) {
    const t = entry.title.toLowerCase();
    const x = entry.text.toLowerCase();
    if (t.includes(q)) return 10 + (t === q ? 100 : 0) + (t.startsWith(q) ? 5 : 0);
    if (x.includes(q)) return 1;
    return 0;
  }
  input.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      Array.from(list.children).forEach(li => li.style.display = '');
      return;
    }
    const ranked = entries.map(en => ({ slug: en.slug, score: score(en, q) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
    const allowed = new Set(ranked.map(r => r.slug));
    Array.from(list.children).forEach(li => {
      const slug = li.getAttribute('data-slug');
      li.style.display = allowed.has(slug) ? '' : 'none';
    });
  });
})();`

function escape(s: string): string {
  return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
}

export interface PublishResult {
  outDir: string
  noteCount: number
  bytes: number
}

export async function publishStaticSite(opts: PublishOptions): Promise<PublishResult> {
  const filtered = opts.courseId
    ? opts.notes.filter(n => n.courseId === opts.courseId)
    : opts.notes

  const courseTitle = opts.courseId
    ? opts.courses.find(c => c.id === opts.courseId)?.name
    : undefined
  const siteTitle = opts.siteTitle || courseTitle || 'StudyDesk Notes'

  // Build output structure
  const notesDir = path.join(opts.outDir, 'notes')
  const assetsDir = path.join(opts.outDir, 'assets')
  await fs.promises.mkdir(notesDir, { recursive: true })
  await fs.promises.mkdir(assetsDir, { recursive: true })

  // Write shared assets
  await fs.promises.writeFile(path.join(assetsDir, 'site.css'), SITE_CSS, 'utf-8')
  await fs.promises.writeFile(path.join(assetsDir, 'search.js'), SEARCH_JS, 'utf-8')

  // Compute slugs & uniqueness
  const usedSlugs = new Set<string>()
  const noteEntries: Array<{ note: Note; slug: string }> = []
  for (const n of filtered) {
    let slug = slugify(n.title, n.id.slice(0, 8))
    let i = 1
    while (usedSlugs.has(slug)) { slug = slugify(n.title, n.id.slice(0, 8)) + '-' + (++i) }
    usedSlugs.add(slug)
    noteEntries.push({ note: n, slug })
  }

  // Render each note's HTML page + collect search index
  let totalBytes = 0
  const searchIndex: SearchEntry[] = []
  for (const { note, slug } of noteEntries) {
    let body: string
    try { body = generateHTML(JSON.parse(note.content), [StarterKit, Underline]) }
    catch { body = '<p><em>Empty note.</em></p>' }
    const updated = new Date(note.updatedAt).toLocaleDateString()
    const courseName = note.courseId
      ? opts.courses.find(c => c.id === note.courseId)?.name
      : undefined
    const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escape(note.title || 'Untitled')} · ${escape(siteTitle)}</title>
<link rel="stylesheet" href="../assets/site.css">
</head><body><div class="container">
<a href="../index.html">← Back to index</a>
<h1>${escape(note.title || 'Untitled')}</h1>
<div class="meta">${courseName ? escape(courseName) + ' · ' : ''}Updated ${escape(updated)}</div>
${body}
</div></body></html>`
    const filePath = path.join(notesDir, slug + '.html')
    await fs.promises.writeFile(filePath, html, 'utf-8')
    totalBytes += Buffer.byteLength(html, 'utf-8')

    // Collect for search — use plain text to keep the index small
    let text = ''
    try { text = plainText(JSON.parse(note.content)).replace(/\s+/g, ' ').trim() }
    catch { text = '' }
    searchIndex.push({
      slug,
      title: note.title || 'Untitled',
      course: courseName,
      text: text.slice(0, 4000),  // cap so the index doesn't bloat
    })
  }

  // Write search index
  const indexJson = JSON.stringify(searchIndex)
  await fs.promises.writeFile(path.join(opts.outDir, 'search-index.json'), indexJson, 'utf-8')
  totalBytes += Buffer.byteLength(indexJson, 'utf-8')

  // Build the index page
  const cards = noteEntries.map(({ note, slug }) => {
    const updated = new Date(note.updatedAt).toLocaleDateString()
    const courseName = note.courseId
      ? opts.courses.find(c => c.id === note.courseId)?.name
      : undefined
    return `<li class="card" data-slug="${escape(slug)}">
  <h3><a href="notes/${escape(slug)}.html">${escape(note.title || 'Untitled')}</a></h3>
  <p>${courseName ? escape(courseName) + ' · ' : ''}Updated ${escape(updated)}</p>
</li>`
  }).join('\n')

  const indexHtml = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escape(siteTitle)}</title>
<link rel="stylesheet" href="assets/site.css">
</head><body><div class="container">
<h1>${escape(siteTitle)}</h1>
<div class="meta">${noteEntries.length} note${noteEntries.length === 1 ? '' : 's'} · published ${new Date().toLocaleDateString()}</div>
<input id="search" class="search" type="search" placeholder="Search notes…" />
<ul id="cards" class="card-list">
${cards || '<li class="card"><p>No notes yet.</p></li>'}
</ul>
</div>
<script src="assets/search.js"></script>
</body></html>`
  await fs.promises.writeFile(path.join(opts.outDir, 'index.html'), indexHtml, 'utf-8')
  totalBytes += Buffer.byteLength(indexHtml, 'utf-8')

  return { outDir: opts.outDir, noteCount: noteEntries.length, bytes: totalBytes }
}
