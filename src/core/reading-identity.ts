import { normalizeHeadingText } from './parser';
import type { ChapterIdentity, ChapterNode } from '../types';

function chapterFingerprint(chapter: ChapterNode | null | undefined): string | null {
  if (!chapter) return null;
  const normalized = normalizeHeadingText(chapter.rawHeading || chapter.title);
  return normalized ? `h${chapter.level}:${normalized}` : null;
}

function occurrenceFromId(chapter: ChapterNode): number {
  const match = String(chapter.id || '').match(/:(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function chapterIndex(chapter: ChapterNode, chapters: ChapterNode[]): number {
  const direct = chapters.indexOf(chapter);
  if (direct >= 0) return direct;
  return chapters.findIndex((candidate) => (
    candidate.id === chapter.id &&
    candidate.line === chapter.line &&
    candidate.headingIndex === chapter.headingIndex
  ));
}

function previousPeer(chapters: ChapterNode[], index: number, level: number): ChapterNode | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (chapters[cursor].level <= level) return chapters[cursor];
  }
  return null;
}

function nextPeer(chapters: ChapterNode[], index: number, level: number): ChapterNode | null {
  for (let cursor = index + 1; cursor < chapters.length; cursor += 1) {
    if (chapters[cursor].level <= level) return chapters[cursor];
  }
  return null;
}

function parentHeading(chapters: ChapterNode[], index: number, level: number): ChapterNode | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (chapters[cursor].level < level) return chapters[cursor];
  }
  return null;
}

export function createChapterIdentity(chapter: ChapterNode, chapters: ChapterNode[] = [chapter]): ChapterIdentity {
  const list = Array.isArray(chapters) && chapters.length > 0 ? chapters : [chapter];
  const rawIndex = chapterIndex(chapter, list);
  const index = rawIndex >= 0 ? rawIndex : 0;
  const normalizedTitle = normalizeHeadingText(chapter.rawHeading || chapter.title);
  const titleCount = list.filter((candidate) => (
    candidate.level === chapter.level &&
    normalizeHeadingText(candidate.rawHeading || candidate.title) === normalizedTitle
  )).length;

  return {
    version: 2,
    level: chapter.level,
    line: chapter.line,
    normalizedTitle,
    occurrence: occurrenceFromId(chapter),
    titleCount: Math.max(1, titleCount),
    parent: chapterFingerprint(parentHeading(list, index, chapter.level)),
    previous: chapterFingerprint(previousPeer(list, index, chapter.level)),
    next: chapterFingerprint(nextPeer(list, index, chapter.level))
  };
}

export function normalizeChapterIdentity(input: unknown): ChapterIdentity | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Partial<ChapterIdentity>;
  const level = Number(source.level);
  const line = Number(source.line);
  const occurrence = Number(source.occurrence);
  const titleCount = Number(source.titleCount);

  if (source.version !== 2) return undefined;
  if (!Number.isInteger(level) || level < 1 || level > 6) return undefined;
  if (!Number.isInteger(line) || line < 0) return undefined;
  if (!Number.isInteger(occurrence) || occurrence < 0) return undefined;
  if (!Number.isInteger(titleCount) || titleCount < 1) return undefined;
  if (typeof source.normalizedTitle !== 'string') return undefined;

  const normalizeContext = (value: unknown): string | null => (
    typeof value === 'string' && value ? value : null
  );

  return {
    version: 2,
    level,
    line,
    normalizedTitle: source.normalizedTitle,
    occurrence,
    titleCount,
    parent: normalizeContext(source.parent),
    previous: normalizeContext(source.previous),
    next: normalizeContext(source.next)
  };
}

export function chapterIdentityEquals(left: unknown, right: unknown): boolean {
  const a = normalizeChapterIdentity(left);
  const b = normalizeChapterIdentity(right);
  if (!a || !b) return false;
  return a.level === b.level &&
    a.line === b.line &&
    a.normalizedTitle === b.normalizedTitle &&
    a.occurrence === b.occurrence &&
    a.titleCount === b.titleCount &&
    a.parent === b.parent &&
    a.previous === b.previous &&
    a.next === b.next;
}

function contextScore(saved: ChapterIdentity, current: ChapterIdentity): number {
  let score = 0;
  if (saved.parent && saved.parent === current.parent) score += 6;
  if (saved.previous && saved.previous === current.previous) score += 3;
  if (saved.next && saved.next === current.next) score += 3;
  if (saved.occurrence === current.occurrence) score += 1;
  if (saved.line === current.line) score += 1;
  return score;
}

function hasStrongContext(saved: ChapterIdentity, current: ChapterIdentity): boolean {
  let comparable = 0;
  let matched = 0;

  for (const key of ['parent', 'previous', 'next'] as const) {
    const savedValue = saved[key];
    if (savedValue) {
      comparable += 1;
      if (savedValue === current[key]) matched += 1;
    }
  }

  if (saved.parent && current.parent && saved.parent !== current.parent) return false;
  return comparable >= 1 && matched === comparable;
}

/**
 * Resolve a persisted chapter identity conservatively.
 *
 * Precedence:
 * 1. exact v2 identity
 * 2. line + level when title/context corroborates it
 * 3. title + level, disambiguated by structural context for duplicates
 * 4. strong nearby-context fallback for renames that also shifted lines
 */
export function resolveChapterIdentity(input: unknown, chapters: ChapterNode[]): ChapterNode | null {
  const saved = normalizeChapterIdentity(input);
  if (!saved || !Array.isArray(chapters) || chapters.length === 0) return null;

  const prepared = chapters.map((chapter) => ({
    chapter,
    identity: createChapterIdentity(chapter, chapters)
  }));

  const exact = prepared.find((entry) => chapterIdentityEquals(saved, entry.identity));
  if (exact) return exact.chapter;

  const sameTitle = prepared.filter((entry) => (
    entry.identity.level === saved.level &&
    entry.identity.normalizedTitle === saved.normalizedTitle
  ));

  const sameLine = prepared.filter((entry) => (
    entry.identity.level === saved.level && entry.identity.line === saved.line
  ));
  if (sameLine.length === 1) {
    const candidate = sameLine[0];
    if (candidate.identity.normalizedTitle === saved.normalizedTitle) {
      if (saved.titleCount === 1 || hasStrongContext(saved, candidate.identity)) {
        return candidate.chapter;
      }
    } else if (hasStrongContext(saved, candidate.identity)) {
      return candidate.chapter;
    }
  }

  if (sameTitle.length === 1 && saved.titleCount === 1) {
    return sameTitle[0].chapter;
  }

  if (sameTitle.length > 0) {
    const ranked = sameTitle
      .map((entry) => ({ ...entry, score: contextScore(saved, entry.identity) }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const second = ranked[1];
    if (best.score >= 6 && (!second || best.score > second.score)) return best.chapter;
  }

  const contextual = prepared.filter((entry) => (
    entry.identity.level === saved.level && hasStrongContext(saved, entry.identity)
  ));
  return contextual.length === 1 ? contextual[0].chapter : null;
}

export function createChapterMarkerKey(identityInput: unknown): string {
  const identity = normalizeChapterIdentity(identityInput);
  if (!identity) return '';
  const serialized = [
    identity.level,
    identity.line,
    identity.normalizedTitle,
    identity.occurrence,
    identity.titleCount,
    identity.parent || '',
    identity.previous || '',
    identity.next || ''
  ].join('|');
  return `v2:${encodeURIComponent(serialized)}`;
}
