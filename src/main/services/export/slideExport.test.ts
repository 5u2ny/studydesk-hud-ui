import { describe, it, expect } from 'vitest'
import { splitDocIntoSlides, buildRevealHtml } from './slideExport'

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const hr = { type: 'horizontalRule' as const }

describe('splitDocIntoSlides', () => {
  it('returns empty array for empty doc', () => {
    expect(splitDocIntoSlides({ type: 'doc', content: [] })).toEqual([])
    expect(splitDocIntoSlides(null)).toEqual([])
  })

  it('treats a doc with no HRs as a single slide', () => {
    const doc = { type: 'doc', content: [para('a'), para('b')] }
    expect(splitDocIntoSlides(doc)).toEqual([[para('a'), para('b')]])
  })

  it('splits on horizontalRule nodes', () => {
    const doc = { type: 'doc', content: [para('one'), hr, para('two'), hr, para('three')] }
    const slides = splitDocIntoSlides(doc)
    expect(slides.length).toBe(3)
    expect(slides[0]).toEqual([para('one')])
    expect(slides[1]).toEqual([para('two')])
    expect(slides[2]).toEqual([para('three')])
  })

  it('drops empty slides created by trailing or leading HRs', () => {
    const doc = { type: 'doc', content: [hr, para('only'), hr] }
    expect(splitDocIntoSlides(doc).length).toBe(1)
  })
})

describe('buildRevealHtml', () => {
  it('produces a reveal.js HTML scaffold with one section per slide', () => {
    const html = buildRevealHtml({
      title: 'Test Deck',
      doc: { type: 'doc', content: [para('one'), hr, para('two')] },
    })
    expect(html).toContain('<title>Test Deck</title>')
    expect(html).toContain('Reveal.initialize')
    const sectionCount = (html.match(/<section>/g) ?? []).length
    expect(sectionCount).toBe(2)
  })

  it('emits a placeholder section for empty docs', () => {
    const html = buildRevealHtml({ title: 'Empty', doc: { type: 'doc', content: [] } })
    expect(html).toContain('Empty deck')
  })

  it('escapes HTML-meaningful chars in the title', () => {
    const html = buildRevealHtml({ title: '<script>x</script>', doc: { type: 'doc', content: [] } })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
  })
})
