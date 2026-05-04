// Slide-mode export — port from CodiMD's slide mode.
//
// Take the current note's TipTap JSON, split it on horizontal-rule
// nodes (`---` in markdown), render each chunk as a reveal.js
// `<section>`. Output is a single HTML file using reveal.js from a CDN
// — keeps the export small (~10 KB) and the user can `open` it in any
// browser without further setup.
//
// We DON'T inline reveal.js itself because it's ~250 KB; opening the
// output briefly online isn't a privacy issue (no note content goes
// to the CDN — only the JS asset is fetched). Users on offline-only
// machines can swap the CDN URLs for local copies.

import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'

const REVEAL_VERSION = '5.0.4'
const CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/reveal.js/${REVEAL_VERSION}`

interface SlideExportOptions {
  title: string
  /** Parsed TipTap JSON document. */
  doc: any
}

/** Split a TipTap doc into an array of slide-content arrays by walking
 *  the top-level children and chunking on horizontalRule nodes. */
export function splitDocIntoSlides(doc: any): any[][] {
  if (!doc || !Array.isArray(doc.content)) return []
  const slides: any[][] = [[]]
  for (const child of doc.content) {
    if (child.type === 'horizontalRule') {
      // Start a new slide
      slides.push([])
    } else {
      slides[slides.length - 1].push(child)
    }
  }
  // Drop any empty slides (e.g. trailing `---`)
  return slides.filter(s => s.length > 0)
}

/** Render a single slide's content nodes as HTML via @tiptap/html. */
function renderSlideHtml(nodes: any[]): string {
  if (nodes.length === 0) return ''
  const fragmentDoc = { type: 'doc', content: nodes }
  try { return generateHTML(fragmentDoc, [StarterKit, Underline]) }
  catch { return '' }
}

const REVEAL_CSS_OVERRIDES = `
  .reveal { font-family: -apple-system, system-ui, 'SF Pro Display', sans-serif; }
  .reveal h1 { font-size: 1.8em; }
  .reveal h2 { font-size: 1.4em; }
  .reveal h3 { font-size: 1.15em; }
  .reveal blockquote { border-left: 3px solid #5fa1ff; padding-left: 14px; opacity: 0.85; }
  .reveal code { font-family: 'SF Mono', Menlo, monospace; }
  .reveal aside.source-quote::after {
    display: block; margin-top: 6px; opacity: 0.65; font-style: italic;
    content: "— " attr(data-source-title);
  }
  .reveal sup.footnote-ref { color: #ffb84d; font-weight: 700; }
  .reveal sup.footnote-ref::before { content: "[" counter(footnote) "]"; }
  .reveal { counter-reset: footnote 0; }
  .reveal sup.footnote-ref { counter-increment: footnote; }
`

export function buildRevealHtml(opts: SlideExportOptions): string {
  const slides = splitDocIntoSlides(opts.doc)
  const safeTitle = (opts.title || 'Slides').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  const sections = slides.length === 0
    ? '<section><h1>Empty deck</h1><p>This note has no content yet.</p></section>'
    : slides.map(s => `<section>${renderSlideHtml(s)}</section>`).join('\n')

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${safeTitle}</title>
<link rel="stylesheet" href="${CDN_BASE}/reveal.min.css">
<link rel="stylesheet" href="${CDN_BASE}/theme/black.min.css">
<style>${REVEAL_CSS_OVERRIDES}</style>
</head><body>
<div class="reveal"><div class="slides">
${sections}
</div></div>
<script src="${CDN_BASE}/reveal.min.js"></script>
<script>
  Reveal.initialize({
    hash: true,
    slideNumber: 'c/t',
    transition: 'fade',
    controls: true,
    progress: true,
  });
</script>
</body></html>`
}
