import { describe, it, expect } from 'vitest';
import { extractCardsFromNote } from './flashcardSyncService';
import type { Note } from '../../../shared/schema/index';

function makeNote(content: any): Note {
  return {
    id: 'n1',
    title: 'test',
    content: JSON.stringify(content),
    capturedFromIds: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('extractCardsFromNote', () => {
  it('returns empty for non-JSON content', () => {
    const note: Note = {
      id: 'n', title: 'x', content: 'not json',
      capturedFromIds: [], createdAt: 0, updatedAt: 0,
    };
    expect(extractCardsFromNote(note)).toEqual([]);
  });

  it('returns empty when no headings at target level', () => {
    const note = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Top' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
      ],
    });
    expect(extractCardsFromNote(note, 3)).toEqual([]);
  });

  it('extracts one card per H3 with following content as back', () => {
    const note = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Innovation funnel' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A staged process for filtering ideas.' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Stage-Gate' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Discrete go/kill decisions.' }] },
      ],
    });
    const cards = extractCardsFromNote(note, 3);
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toBe('Innovation funnel');
    expect(cards[0].back).toContain('staged process');
    expect(cards[1].front).toBe('Stage-Gate');
    expect(cards[1].back).toContain('go/kill');
  });

  it('higher-level heading closes a card without opening a new one', () => {
    const note = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Concept A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A body.' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'New section' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Outside any card.' }] },
      ],
    });
    const cards = extractCardsFromNote(note, 3);
    expect(cards).toHaveLength(1);
    expect(cards[0].back).not.toContain('Outside any card');
  });

  it('skips headings with empty body', () => {
    const note = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Lonely' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Has body' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Real content.' }] },
      ],
    });
    const cards = extractCardsFromNote(note, 3);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Has body');
  });

  it('produces stable cardKey for same front + position', () => {
    const noteA = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Stage-Gate' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'v1.' }] },
      ],
    });
    const noteB = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Stage-Gate' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'v2 (edited).' }] },
      ],
    });
    const a = extractCardsFromNote(noteA, 3);
    const b = extractCardsFromNote(noteB, 3);
    expect(a[0].cardKey).toBe(b[0].cardKey); // stable across edits to body
  });

  it('cardKey changes when position changes', () => {
    const noteSingle = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Topic X' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      ],
    });
    const noteWithPrior = makeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Earlier' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'pre' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Topic X' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      ],
    });
    const a = extractCardsFromNote(noteSingle, 3);
    const b = extractCardsFromNote(noteWithPrior, 3);
    const topicX_alone = a.find(c => c.front === 'Topic X')!;
    const topicX_after = b.find(c => c.front === 'Topic X')!;
    expect(topicX_alone.cardKey).not.toBe(topicX_after.cardKey);
  });
});
