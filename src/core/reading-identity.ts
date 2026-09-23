import { normalizeHeadingText } from './parser';
import type { ChapterIdentity, ChapterNode } from '../types';

interface PreparedChapter {
  chapter: ChapterNode;
  identity: ChapterIdentity;
}

/** Return the stable structural fingerprint persisted for a neighboring heading. */
function chapterFingerprint(chapter: ChapterNode | null | undefined): string | null {
  if (!chapter) return null;
  const normalized = normalizeHeadingText(chapter.rawHeading || chapter.title);
  return normalized ? `h${chapter.level}:${normalized}` : null;
}

/** Recover the duplicate occurrence suffix from the existing chapter id. */
function occurrenceFromId(chapter: ChapterNode): number {
  const match = String(chapter.id || '').match(/:(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/** Build identities for a complete chapter list in O(levels * n), with levels capped at six. */
function prepareChapterIdentities(chapters: ChapterNode[]): PreparedChapter[] {
  const normalizedTitles = chapters.map((chapter) => normalizeHeadingText(chapter.rawHeading || chapter.title));
  const titleCounts = new Map<string, number>();
  const titleKey = (index: number) => `${chapters[index].level}\u0000${normalizedTitles[index]}`;

  for (let index = 0; index < chapters.length; index += 1) {
    const key = titleKey(index);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const parentIndexes = Array<number>(chapters.length).fill(-1);
  const previousIndexes = Array<number>(chapters.length).fill(-1);
  const lastByLevel = Array<number>(7).fill(-1);

  for (let index = 0; index < chapters.length; index += 1) {
    const level = chapters[index].level;
    let previous = -1;
    let parent = -1;
    for (let candidateLevel = 1; candidateLevel <= level; candidateLevel += 1) {
      previous = Math.max(previous, lastByLevel[candidateLevel]);
    }
    for (let candidateLevel = 1; candidateLevel < level; candidateLevel += 1) {
      parent = Math.max(parent, lastByLevel[candidateLevel]);
    }
    previousIndexes[index] = previous;
    parentIndexes[index] = parent;
    if (level >= 1 && level <= 6) lastByLevel[level] = index;
  }

  const nextIndexes = Array<number>(chapters.length).fill(-1);
  const nextByLevel = Array<number>(7).fill(Number.POSITIVE_INFINITY);
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    const level = chapters[index].level;
    let next = Number.POSITIVE_INFINITY;
    for (let candidateLevel = 1; candidateLevel <= level; candidateLevel += 1) {
      next = Math.min(next, nextByLevel[candidateLevel]);
    }
    nextIndexes[index] = Number.isFinite(next) ? next : -1;
    if (level >= 1 && level <= 6) nextByLevel[level] = index;
  }

  return chapters.map((chapter, index) => ({
    chapter,
    identity: {
      version: 2,
      level: chapter.level,
      line: chapter.line,
      normalizedTitle: normalizedTitles[index],
      occurrence: occurrenceFromId(chapter),
      titleCount: Math.max(1, titleCounts.get(titleKey(index)) ?? 1),
      parent: chapterFingerprint(parentIndexes[index] >= 0 ? chapters[parentIndexes[index]] : null),
      previous: chapterFingerprint(previousIndexes[index] >= 0 ? chapters[previousIndexes[index]] : null),
      next: chapterFingerprint(nextIndexes[index] >= 0 ? chapters[nextIndexes[index]] : null)
    }
  }));
}

/** Create the v2 persisted identity for one chapter against its surrounding chapter list. */
export function createChapterIdentity(chapter: ChapterNode, chapters: ChapterNode[] = [chapter]): ChapterIdentity {
  const list = Array.isArray(chapters) && chapters.length > 0 ? chapters : [chapter];
  const prepared = prepareChapterIdentities(list);
  let index = list.indexOf(chapter);
  if (index < 0) {
    index = list.findIndex((candidate) => (
      candidate.id === chapter.id &&
      candidate.line === chapter.line &&
      candidate.headingIndex === chapter.headingIndex
    ));
  }
  return (index >= 0 ? prepared[index]?.identity : undefined) ?? prepareChapterIdentities([chapter])[0].identity;
}

/** Validate and normalize an identity loaded from plugin data without trusting its shape. */
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

/** Compare two persisted identities field-for-field after validation. */
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

/** Score corroborating context while keeping parent, neighbors, and weak hints separate. */
function contextScore(saved: ChapterIdentity, current: ChapterIdentity): number {
  let score = 0;
  if (saved.parent && saved.parent === current.parent) score += 6;
  if (saved.previous && saved.previous === current.previous) score += 3;
  if (saved.next && saved.next === current.next) score += 3;
  if (saved.occurrence === current.occurrence) score += 1;
  if (saved.line === current.line) score += 1;
  return score;
}

/** Require every persisted structural signal to agree for the rename/context fallback. */
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

/** Return whether matching context actually distinguishes a candidate from its duplicate-title peers. */
function hasDuplicateDiscriminator(
  saved: ChapterIdentity,
  candidate: PreparedChapter,
  candidates: PreparedChapter[]
): boolean {
  for (const key of ['parent', 'previous', 'next'] as const) {
    const value = saved[key];
    if (!value || candidate.identity[key] !== value) continue;
    if (candidates.some((other) => other !== candidate && other.identity[key] !== value)) return true;
  }
  return false;
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

  const prepared = prepareChapterIdentities(chapters);
  const exact = prepared.find((entry) => chapterIdentityEquals(saved, entry.identity));
  if (exact) return exact.chapter;

  const sameTitle = prepared.filter((entry) => (
    entry.identity.level === saved.level &&
    entry.identity.normalizedTitle === saved.normalizedTitle
  ));
  const duplicateSetShrank = saved.titleCount > 1 && sameTitle.length < saved.titleCount;

  const sameLine = prepared.filter((entry) => (
    entry.identity.level === saved.level && entry.identity.line === saved.line
  ));
  if (sameLine.length === 1) {
    const candidate = sameLine[0];
    if (candidate.identity.normalizedTitle === saved.normalizedTitle) {
      if (saved.titleCount === 1 || (!duplicateSetShrank && hasStrongContext(saved, candidate.identity))) {
        return candidate.chapter;
      }
    } else if (hasStrongContext(saved, candidate.identity)) {
      return candidate.chapter;
    }
  }

  if (sameTitle.length === 1 && saved.titleCount === 1) {
    return sameTitle[0].chapter;
  }

  if (!duplicateSetShrank && sameTitle.length > 0) {
    const ranked = sameTitle
      .map((entry) => ({ ...entry, score: contextScore(saved, entry.identity) }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const second = ranked[1];
    const discriminated = saved.titleCount === 1 || hasDuplicateDiscriminator(saved, best, sameTitle);
    if (discriminated && best.score >= 6 && (!second || best.score > second.score)) return best.chapter;
  }

  const contextual = prepared.filter((entry) => (
    entry.identity.level === saved.level &&
    hasStrongContext(saved, entry.identity) &&
    !(duplicateSetShrank && entry.identity.normalizedTitle === saved.normalizedTitle)
  ));
  return contextual.length === 1 ? contextual[0].chapter : null;
}

/** Create an unambiguous persisted marker key from the complete normalized identity tuple. */
export function createChapterMarkerKey(identityInput: unknown): string {
  const identity = normalizeChapterIdentity(identityInput);
  if (!identity) return '';
  const serialized = JSON.stringify([
    identity.level,
    identity.line,
    identity.normalizedTitle,
    identity.occurrence,
    identity.titleCount,
    identity.parent || '',
    identity.previous || '',
    identity.next || ''
  ]);
  return `v2:${encodeURIComponent(serialized)}`;
}
