// Flashcard sync — derives flashcards from Notes (StudyMD-style heading extraction)
// and Captures (one card per capture).
//
// Adapted from jotron/StudyMD: walk the document tree, treat each heading at
// the configured level as a card boundary; content until the next heading at
// or above that level becomes the back. Their version operates on rendered
// HTML — we operate directly on TipTap JSON, which is faster and lossless.
//
// StudyMD has no card IDs (re-parsing wipes review state). We add stable
// sourceCardKey = sha1(front + position) so SM-2 difficulty/nextReview survives
// edits. Cards no longer present in the source are marked obsolete (deleted).

import { createHash } from 'node:crypto';
import { focusStore } from '../store';
import { studyService } from './studyService';
import type { Note, StudyItem, Capture } from '../../../shared/schema/index';

interface ExtractedCard {
  cardKey: string;       // stable id derived from front + position
  front: string;
  back: string;
  position: number;      // ordinal in the source note (used for cardKey)
}

const DEFAULT_HEADING_LEVEL = 3; // "### foo" pattern — flexible enough for course notes

/** Plain-text-ize a TipTap JSON node for storing as flashcard text. */
function textOf(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = textOf(node.content);
  // Add a newline between block-level nodes so cards don't get jammed together
  const blockTypes = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'blockquote']);
  return blockTypes.has(node.type) ? inner + '\n' : inner;
}

function trimText(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function makeCardKey(front: string, position: number): string {
  // sha1 over normalized front + position so identical headings at different
  // positions still produce distinct keys (SM-2 state is per-position, not
  // per-front, which matches user mental model: edits to surrounding context
  // shouldn't blow up review history).
  const normalized = front.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha1').update(`${normalized}|${position}`).digest('hex').slice(0, 16);
}

/** Walk a TipTap JSON doc, emit cards by heading boundaries. */
export function extractCardsFromNote(note: Note, headingLevel: number = DEFAULT_HEADING_LEVEL): ExtractedCard[] {
  let doc: any;
  try {
    doc = JSON.parse(note.content);
  } catch {
    return [];
  }
  if (!doc?.content || !Array.isArray(doc.content)) return [];

  const cards: ExtractedCard[] = [];
  let active: { front: string; bodyParts: string[]; position: number } | null = null;
  let position = 0;

  function closeActive() {
    if (!active) return;
    const front = trimText(active.front);
    const back = trimText(active.bodyParts.join(''));
    if (front.length > 0) {
      cards.push({
        cardKey: makeCardKey(front, active.position),
        front,
        back,
        position: active.position,
      });
    }
    active = null;
  }

  for (const node of doc.content) {
    const isHeading = node.type === 'heading';
    const level: number | undefined = node.attrs?.level;

    if (isHeading && level !== undefined && level <= headingLevel) {
      // Any heading at or above the configured level closes the active card.
      closeActive();
      // A heading EXACTLY at the configured level opens a new card.
      if (level === headingLevel) {
        position++;
        active = {
          front: textOf(node),
          bodyParts: [],
          position,
        };
      }
      // Headings ABOVE the level (e.g. h1/h2 when level=3) just close, don't open.
    } else if (active) {
      active.bodyParts.push(textOf(node));
    }
  }
  closeActive();

  // Filter out cards with no back content (dangling headings)
  return cards.filter(c => c.back.length > 0);
}

export const flashcardSyncService = {
  /** Re-derive flashcards from a single note. Preserves SM-2 state via cardKey match. */
  syncNote(noteId: string, headingLevel: number = DEFAULT_HEADING_LEVEL): {
    created: number;
    updated: number;
    deleted: number;
    cards: StudyItem[];
  } {
    const note = focusStore.get('notes').find(n => n.id === noteId);
    if (!note) return { created: 0, updated: 0, deleted: 0, cards: [] };

    const extracted = extractCardsFromNote(note, headingLevel);
    const existing = focusStore.get('studyItems').filter(s => s.sourceNoteId === noteId);

    const existingByKey = new Map(existing.map(s => [s.sourceCardKey ?? '', s]));
    const seenKeys = new Set<string>();

    let created = 0;
    let updated = 0;
    const cards: StudyItem[] = [];

    for (const card of extracted) {
      seenKeys.add(card.cardKey);
      const prior = existingByKey.get(card.cardKey);
      if (prior) {
        // Update front/back text but PRESERVE difficulty/nextReviewAt/reviewCount
        // — the user's review history survives note edits.
        if (prior.front !== card.front || prior.back !== card.back) {
          cards.push(studyService.update(prior.id, { front: card.front, back: card.back }));
          updated++;
        } else {
          cards.push(prior);
        }
      } else {
        cards.push(studyService.create({
          courseId: note.courseId,
          sourceNoteId: noteId,
          sourceCardKey: card.cardKey,
          type: 'flashcard',
          front: card.front,
          back: card.back,
        }));
        created++;
      }
    }

    // Delete cards that no longer match any extracted heading
    let deleted = 0;
    for (const prior of existing) {
      if (!prior.sourceCardKey || !seenKeys.has(prior.sourceCardKey)) {
        studyService.delete(prior.id);
        deleted++;
      }
    }

    return { created, updated, deleted, cards };
  },

  /** Promote a single capture into a flashcard. Idempotent by capture id. */
  syncCapture(capture: Capture, opts?: { back?: string }): StudyItem {
    const existing = focusStore.get('studyItems').find(s => s.sourceCaptureId === capture.id);
    if (existing) return existing;
    return studyService.create({
      courseId: capture.courseId,
      sourceCaptureId: capture.id,
      type: 'flashcard',
      front: capture.text.slice(0, 280),
      back: opts?.back,
    });
  },

  /** Bulk: sync all notes that have at least one heading at the target level. */
  syncAllNotes(headingLevel: number = DEFAULT_HEADING_LEVEL): {
    notesProcessed: number;
    totalCreated: number;
    totalUpdated: number;
    totalDeleted: number;
  } {
    const notes = focusStore.get('notes');
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    let processed = 0;
    for (const note of notes) {
      const r = this.syncNote(note.id, headingLevel);
      if (r.created + r.updated + r.deleted > 0 || r.cards.length > 0) processed++;
      totalCreated += r.created;
      totalUpdated += r.updated;
      totalDeleted += r.deleted;
    }
    return { notesProcessed: processed, totalCreated, totalUpdated, totalDeleted };
  },

  /** Get all cards derived from a specific note (for sidebar badge counts). */
  cardsFromNote(noteId: string): StudyItem[] {
    return focusStore.get('studyItems').filter(s => s.sourceNoteId === noteId);
  },
};
