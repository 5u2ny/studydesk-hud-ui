import { describe, it, expect } from 'vitest'
import { tipTapJsonToMarkdown } from './exportMarkdown'

const wrap = (content: any[]) => ({ type: 'doc', content })

describe('tipTapJsonToMarkdown', () => {
  it('returns empty string for empty doc', () => {
    expect(tipTapJsonToMarkdown(wrap([]))).toBe('')
    expect(tipTapJsonToMarkdown(null)).toBe('')
  })

  it('serializes a paragraph', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    ]))
    expect(out.trim()).toBe('Hello world')
  })

  it('serializes headings at correct levels', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H1' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'H3' }] },
    ]))
    expect(out).toContain('# H1')
    expect(out).toContain('### H3')
  })

  it('serializes bold/italic marks', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'paragraph', content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
      ] },
    ]))
    expect(out).toContain('**bold**')
    expect(out).toContain('*italic*')
  })

  it('serializes bullet lists', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
      ] },
    ]))
    expect(out).toContain('- one')
    expect(out).toContain('- two')
  })

  it('serializes ordered lists with sequential numbers', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'orderedList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
      ] },
    ]))
    expect(out).toContain('1. first')
    expect(out).toContain('2. second')
  })

  it('serializes blockquote', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'blockquote', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] },
      ] },
    ]))
    expect(out).toContain('> quoted')
  })

  it('serializes code block with language', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const x = 1' }] },
    ]))
    expect(out).toMatch(/```js\nconst x = 1\n```/)
  })

  it('serializes horizontalRule as ---', () => {
    const out = tipTapJsonToMarkdown(wrap([{ type: 'horizontalRule' }]))
    expect(out.trim()).toBe('---')
  })

  it('emits footnote refs and definitions', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'paragraph', content: [
        { type: 'text', text: 'See note' },
        { type: 'footnote', attrs: { content: 'first footnote' } },
        { type: 'text', text: ' and another' },
        { type: 'footnote', attrs: { content: 'second footnote' } },
      ] },
    ]))
    expect(out).toContain('See note[^1]')
    expect(out).toContain('and another[^2]')
    expect(out).toContain('[^1]: first footnote')
    expect(out).toContain('[^2]: second footnote')
  })

  it('emits noteLink as Obsidian [[ ]] syntax', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'paragraph', content: [
        { type: 'text', text: 'Chapter 3', marks: [{ type: 'noteLink', attrs: { noteId: 'n_1', displayText: 'Chapter 3' } }] },
      ] },
    ]))
    expect(out.trim()).toBe('[[Chapter 3]]')
  })

  it('emits inlineComment as ==highlight== with hidden HTML comment', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'paragraph', content: [
        { type: 'text', text: 'review later', marks: [{ type: 'inlineComment', attrs: { commentId: 'c1', text: 'verify with TA' } }] },
      ] },
    ]))
    expect(out).toContain('==review later==')
    expect(out).toContain('verify with TA')
  })

  it('emits sourceQuote as blockquote with attribution', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'sourceQuote', attrs: { sourceTitle: 'syllabus.pdf' }, content: [{ type: 'text', text: 'attendance is mandatory' }] },
    ]))
    expect(out).toContain('> attendance is mandatory')
    expect(out).toContain('— syllabus.pdf')
  })

  it('escapes special markdown characters in plain text', () => {
    const out = tipTapJsonToMarkdown(wrap([
      { type: 'paragraph', content: [{ type: 'text', text: 'use *asterisks* and [brackets]' }] },
    ]))
    expect(out).toContain('\\*asterisks\\*')
    expect(out).toContain('\\[brackets\\]')
  })
})
