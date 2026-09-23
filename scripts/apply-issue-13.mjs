import fs from 'node:fs';
import path from 'node:path';

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(needle, index + needle.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing section start: ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing section end: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const identitySource = `import { normalizeHeadingText } from './parser';
import type { ChapterIdentity, ChapterNode } from '../types';

function chapterFingerprint(chapter: ChapterNode | null | undefined): string | null {
  if (!chapter) return null;
  const normalized = normalizeHeadingText(chapter.rawHeading || chapter.title);
  if (!normalized) return null;
  return \`h\${chapter.level}:\${normalized}\`;
}

function occurrenceFromId(chapter: ChapterNode): number {
  const match = String(chapter.id || '').match(/:(\\d+)$/);
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
  const index = Math.max(0, chapterIndex(chapter, list));
  return {
    version: 2,
    level: chapter.level,
    line: chapter.line,
    normalizedTitle: normalizeHeadingText(chapter.rawHeading || chapter.title),
    occurrence: occurrenceFromId(chapter),
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
  if (source.version !== 2) return undefined;
  if (!Number.isInteger(level) || level < 1 || level > 6) return undefined;
  if (!Number.isInteger(line) || line < 0) return undefined;
  if (!Number.isInteger(occurrence) || occurrence < 0) return undefined;
  if (typeof source.normalizedTitle !== 'string') return undefined;
  const normalizeContext = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
  return {
    version: 2,
    level,
    line,
    normalizedTitle: source.normalizedTitle,
    occurrence,
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
    a.parent === b.parent &&
    a.previous === b.previous &&
    a.next === b.next;
}

function duplicateContextScore(saved: ChapterIdentity, current: ChapterIdentity): number {
  let score = 0;
  if (saved.parent && saved.parent === current.parent) score += 4;
  if (saved.previous && saved.previous === current.previous) score += 2;
  if (saved.next && saved.next === current.next) score += 2;
  if (saved.occurrence === current.occurrence) score += 1;
  if (saved.line === current.line) score += 1;
  return score;
}

function hasStrongRenameContext(saved: ChapterIdentity, current: ChapterIdentity): boolean {
  const hasPrevious = typeof saved.previous === 'string' && saved.previous.length > 0;
  const hasNext = typeof saved.next === 'string' && saved.next.length > 0;
  if (!hasPrevious && !hasNext) return false;
  if (hasPrevious && saved.previous !== current.previous) return false;
  if (hasNext && saved.next !== current.next) return false;
  if (!hasPrevious && saved.previous === null && current.previous !== null) return false;
  if (!hasNext && saved.next === null && current.next !== null) return false;
  if (saved.parent && saved.parent !== current.parent) return false;
  return true;
}

/** Resolve a persisted v2 identity without letting duplicate-title occurrence changes win by accident. */
export function resolveChapterIdentity(input: unknown, chapters: ChapterNode[]): ChapterNode | null {
  const saved = normalizeChapterIdentity(input);
  if (!saved || !Array.isArray(chapters) || chapters.length === 0) return null;

  const prepared = chapters.map((chapter) => ({ chapter, identity: createChapterIdentity(chapter, chapters) }));
  const exact = prepared.find((entry) => chapterIdentityEquals(saved, entry.identity));
  if (exact) return exact.chapter;

  const sameTitle = prepared.filter((entry) => (
    entry.identity.level === saved.level &&
    entry.identity.normalizedTitle === saved.normalizedTitle
  ));

  const sameLine = prepared.filter((entry) => entry.identity.level === saved.level && entry.identity.line === saved.line);
  if (sameLine.length === 1) {
    const candidate = sameLine[0];
    if (candidate.identity.normalizedTitle === saved.normalizedTitle && sameTitle.length === 1) {
      return candidate.chapter;
    }
    if (candidate.identity.normalizedTitle !== saved.normalizedTitle && hasStrongRenameContext(saved, candidate.identity)) {
      return candidate.chapter;
    }
  }

  if (sameTitle.length === 1) return sameTitle[0].chapter;
  if (sameTitle.length > 1) {
    const ranked = sameTitle
      .map((entry) => ({ ...entry, score: duplicateContextScore(saved, entry.identity) }))
      .sort((left, right) => right.score - left.score);
    if (ranked[0].score >= 4 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
      return ranked[0].chapter;
    }
    return null;
  }

  const contextual = prepared.filter((entry) => (
    entry.identity.level === saved.level && hasStrongRenameContext(saved, entry.identity)
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
    identity.parent || '',
    identity.previous || '',
    identity.next || ''
  ].join('|');
  return \`v2:\${encodeURIComponent(serialized)}\`;
}
`;

fs.mkdirSync(path.join('src', 'core'), { recursive: true });
fs.writeFileSync(path.join('src', 'core', 'reading-identity.ts'), identitySource);

let types = fs.readFileSync(path.join('src', 'types.ts'), 'utf8');
types = replaceOnce(
  types,
  "export type BookmarkKind = 'revisit' | 'important';\n\n",
  `export type BookmarkKind = 'revisit' | 'important';\n\nexport interface ChapterIdentity {\n  version: 2;\n  level: number;\n  line: number;\n  normalizedTitle: string;\n  occurrence: number;\n  parent: string | null;\n  previous: string | null;\n  next: string | null;\n}\n\n`,
  'ChapterIdentity type'
);
types = replaceOnce(types, '  updatedAt: number;\n}', '  updatedAt: number;\n  identity?: ChapterIdentity;\n}', 'resume identity');
types = replaceOnce(types, '  important: boolean;\n}', '  important: boolean;\n  identity?: ChapterIdentity;\n}', 'marker identity');
types = replaceOnce(types, '  version: 1;\n', '  version: 2;\n', 'reading state version');
fs.writeFileSync(path.join('src', 'types.ts'), types);

let storage = fs.readFileSync(path.join('src', 'core', 'storage.ts'), 'utf8');
storage = replaceOnce(
  storage,
  "} from '../types';\n\n",
  "} from '../types';\nimport { normalizeChapterIdentity } from './reading-identity';\n\n",
  'storage identity import'
);
storage = replaceOnce(storage, '  return { version: 1, files: {} };', '  return { version: 2, files: {} };', 'empty state version');
storage = replaceOnce(
  storage,
  `        fileState.resume = {\n          chapterId: candidate.chapterId,\n          title: typeof candidate.title === 'string' ? candidate.title : '',\n          updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : 0\n        };`,
  `        fileState.resume = {\n          chapterId: candidate.chapterId,\n          title: typeof candidate.title === 'string' ? candidate.title : '',\n          updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : 0\n        };\n        const identity = normalizeChapterIdentity(candidate.identity);\n        if (identity) fileState.resume.identity = identity;`,
  'storage resume migration'
);
storage = replaceOnce(
  storage,
  `        const marker: ChapterMarker = {\n          revisit: candidate.revisit === true,\n          important: candidate.important === true\n        };`,
  `        const marker: ChapterMarker = {\n          revisit: candidate.revisit === true,\n          important: candidate.important === true\n        };\n        const identity = normalizeChapterIdentity(candidate.identity);\n        if (identity) marker.identity = identity;`,
  'storage marker migration'
);
storage = replaceOnce(
  storage,
  `    if (!fileState || fileState.resume?.chapterId === resume.chapterId) return false;\n    fileState.resume = { ...resume };`,
  `    if (!fileState) return false;\n    const unchanged = fileState.resume?.chapterId === resume.chapterId &&\n      JSON.stringify(fileState.resume?.identity ?? null) === JSON.stringify(resume.identity ?? null);\n    if (unchanged) return false;\n    fileState.resume = { ...resume };`,
  'storage resume comparison'
);
storage = replaceOnce(
  storage,
  `  toggleMarker(fileOrPath: FileLike | string, chapterId: string, kind: BookmarkKind): boolean {`,
  `  toggleMarker(fileOrPath: FileLike | string, chapterId: string, kind: BookmarkKind, identity?: ChapterMarker['identity']): boolean {`,
  'storage toggle signature'
);
storage = replaceOnce(
  storage,
  `    marker[kind] = !marker[kind];\n    if (marker.revisit || marker.important) fileState.markers[chapterId] = marker;`,
  `    marker[kind] = !marker[kind];\n    if (identity) marker.identity = identity;\n    if (marker.revisit || marker.important) fileState.markers[chapterId] = marker;`,
  'storage toggle identity'
);
fs.writeFileSync(path.join('src', 'core', 'storage.ts'), storage);

let legacy = fs.readFileSync(path.join('src', 'legacy-main.js'), 'utf8');
legacy = replaceOnce(
  legacy,
  "const { SoundEngine: TypedSoundEngine } = require('./core/sound.ts');\n",
  "const { SoundEngine: TypedSoundEngine } = require('./core/sound.ts');\nconst {\n  chapterIdentityEquals,\n  createChapterIdentity,\n  createChapterMarkerKey,\n  normalizeChapterIdentity,\n  resolveChapterIdentity\n} = require('./core/reading-identity.ts');\n",
  'legacy identity import'
);
legacy = replaceOnce(legacy, '    version: 1,\n    files: {}', '    version: 2,\n    files: {}', 'legacy default state version');
legacy = replaceOnce(legacy, '  return { version: 1, files: {} };', '  return { version: 2, files: {} };', 'legacy empty state version');

const normalizedReadingState = `function normalizeReadingState(readingState) {
  const normalized = createEmptyReadingState();
  const files = readingState && typeof readingState === 'object' && !Array.isArray(readingState)
    ? readingState.files
    : null;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return normalized;

  for (const [path, rawFileState] of Object.entries(files)) {
    if (!path || !rawFileState || typeof rawFileState !== 'object' || Array.isArray(rawFileState)) continue;

    const fileState = { markers: {} };
    const rawResume = rawFileState.resume;
    if (rawResume && typeof rawResume === 'object' && typeof rawResume.chapterId === 'string' && rawResume.chapterId) {
      fileState.resume = {
        chapterId: rawResume.chapterId,
        title: typeof rawResume.title === 'string' ? rawResume.title : '',
        updatedAt: Number.isFinite(rawResume.updatedAt) ? rawResume.updatedAt : 0
      };
      const identity = normalizeChapterIdentity(rawResume.identity);
      if (identity) fileState.resume.identity = identity;
    }

    const rawMarkers = rawFileState.markers;
    if (rawMarkers && typeof rawMarkers === 'object' && !Array.isArray(rawMarkers)) {
      for (const [chapterId, rawMarker] of Object.entries(rawMarkers)) {
        if (!chapterId || !rawMarker || typeof rawMarker !== 'object' || Array.isArray(rawMarker)) continue;
        const marker = {
          revisit: rawMarker.revisit === true,
          important: rawMarker.important === true
        };
        const identity = normalizeChapterIdentity(rawMarker.identity);
        if (identity) marker.identity = identity;
        if (marker.revisit || marker.important) {
          fileState.markers[chapterId] = marker;
        }
      }
    }

    if (fileState.resume || Object.keys(fileState.markers).length > 0) {
      normalized.files[path] = fileState;
    }
  }

  return normalized;
}

`;
legacy = replaceSection(
  legacy,
  'function normalizeReadingState(readingState) {',
  'class ChapterPipelinePlugin extends Plugin {',
  normalizedReadingState,
  'legacy normalize reading state'
);
legacy = replaceOnce(
  legacy,
  '    this.viewChapterSnapshots = new WeakMap();\n',
  '    this.viewChapterSnapshots = new WeakMap();\n    this.fileChapterSnapshots = new Map();\n',
  'file chapter snapshot map'
);

const ensureReadingState = `  ensureReadingState() {
    const state = this.settings?.readingState;
    if (!state || typeof state !== 'object' || Array.isArray(state) || !state.files || typeof state.files !== 'object' || Array.isArray(state.files)) {
      this.settings.readingState = createEmptyReadingState();
    }
    if (this.settings.readingState.version !== 2) {
      this.settings.readingState.version = 2;
    }
    return this.settings.readingState;
  }

`;
legacy = replaceSection(
  legacy,
  '  ensureReadingState() {',
  '  cleanupOrphanedReadingState() {',
  ensureReadingState,
  'legacy ensure reading state'
);

const chapterMarkerMethods = `  findChapterMarkerEntry(file, chapter, chapters = null) {
    if (!file || !chapter?.id) return null;
    const fileState = this.getReadingFileState(file, false);
    const markers = fileState?.markers;
    if (!markers) return null;
    const chapterList = Array.isArray(chapters) && chapters.length > 0
      ? chapters
      : (this.fileChapterSnapshots.get(file.path) || [chapter]);

    const exact = markers[chapter.id];
    if (exact) {
      const exactIdentity = normalizeChapterIdentity(exact.identity);
      if (!exactIdentity) return { key: chapter.id, marker: exact };
      const resolved = resolveChapterIdentity(exactIdentity, chapterList);
      if (resolved?.id === chapter.id) return { key: chapter.id, marker: exact };
    }

    for (const [key, marker] of Object.entries(markers)) {
      if (key === chapter.id || !marker || typeof marker !== 'object') continue;
      const identity = normalizeChapterIdentity(marker.identity);
      if (!identity) continue;
      const resolved = resolveChapterIdentity(identity, chapterList);
      if (resolved?.id === chapter.id) return { key, marker };
    }
    return null;
  }

  getChapterMarkers(file, chapter) {
    return this.findChapterMarkerEntry(file, chapter)?.marker || null;
  }

`;
legacy = replaceSection(
  legacy,
  '  getChapterMarkers(file, chapter) {',
  '  getChapterStatusLabels(file, chapter) {',
  chapterMarkerMethods,
  'legacy chapter marker lookup'
);

const recordReadingPosition = `  recordReadingPosition(view, chapter) {
    if (!this.isReadingBookmarksEnabled() || !this.isActiveMarkdownView(view) || !view?.file || !chapter?.id) return false;

    const fileState = this.getReadingFileState(view.file, true);
    const chapters = this.fileChapterSnapshots.get(view.file.path) || this.viewChapterSnapshots.get(view) || [chapter];
    const identity = createChapterIdentity(chapter, chapters);
    this.ensureReadingState().version = 2;

    if (fileState.resume?.chapterId === chapter.id) {
      if (!chapterIdentityEquals(fileState.resume.identity, identity)) {
        fileState.resume.identity = identity;
        fileState.resume.title = chapter.title || chapter.rawHeading || fileState.resume.title || '';
        this.scheduleReadingStateSave();
      }
      return false;
    }

    fileState.resume = {
      chapterId: chapter.id,
      title: chapter.title || chapter.rawHeading || '',
      updatedAt: Date.now(),
      identity
    };
    this.scheduleReadingStateSave();
    return true;
  }

`;
legacy = replaceSection(
  legacy,
  '  recordReadingPosition(view, chapter) {',
  '  async getAllChaptersForView(view) {',
  recordReadingPosition,
  'legacy record reading position'
);

const allChaptersMethod = `  async getAllChaptersForView(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView?.file) return [];

    const content = await this.app.vault.cachedRead(targetView.file);
    const chapters = this.extractAllChapters(content, targetView.file);
    this.fileChapterSnapshots.set(targetView.file.path, chapters);
    return chapters;
  }

`;
legacy = replaceSection(
  legacy,
  '  async getAllChaptersForView(view) {',
  '  async resumeLastChapter(view) {',
  allChaptersMethod,
  'legacy get all chapters'
);

const resumeMethod = `  async resumeLastChapter(view) {
    if (!this.isReadingBookmarksEnabled()) return false;
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView?.file) return false;

    const savedResume = this.getReadingFileState(targetView.file, false)?.resume;
    if (!savedResume?.chapterId) {
      this.showNotice(t('resumeUnavailable'));
      return false;
    }

    const chapters = await this.getAllChaptersForView(targetView);
    const identity = normalizeChapterIdentity(savedResume.identity);
    const targetChapter = identity
      ? resolveChapterIdentity(identity, chapters)
      : chapters.find((chapter) => chapter.id === savedResume.chapterId);
    if (!targetChapter) {
      const fileState = this.getReadingFileState(targetView.file, false);
      if (fileState) {
        delete fileState.resume;
        this.pruneReadingFileState(targetView.file);
        await this.saveSettings();
      }
      this.showNotice(t('resumeNotFound'));
      return false;
    }

    const refreshedIdentity = createChapterIdentity(targetChapter, chapters);
    if (savedResume.chapterId !== targetChapter.id || !chapterIdentityEquals(savedResume.identity, refreshedIdentity)) {
      savedResume.chapterId = targetChapter.id;
      savedResume.title = targetChapter.title || targetChapter.rawHeading || savedResume.title || '';
      savedResume.identity = refreshedIdentity;
      this.ensureReadingState().version = 2;
      await this.saveSettings();
    }

    if (this.settings.enableSound !== false) {
      const volume = this.settings.soundVolume !== undefined ? this.settings.soundVolume : 50;
      this.soundEngine.playClick(volume);
    }
    this.jumpToHeading(targetView, targetChapter);
    return true;
  }

`;
legacy = replaceSection(
  legacy,
  '  async resumeLastChapter(view) {',
  '  async toggleChapterMarker(view, chapter, markerName) {',
  resumeMethod,
  'legacy resume reading position'
);

const toggleMethod = `  async toggleChapterMarker(view, chapter, markerName) {
    if (!this.isReadingBookmarksEnabled() || !view?.file || !chapter?.id || !['revisit', 'important'].includes(markerName)) return false;

    const fileState = this.getReadingFileState(view.file, true);
    const markers = fileState.markers || (fileState.markers = {});
    const chapters = this.fileChapterSnapshots.get(view.file.path) || this.viewChapterSnapshots.get(view) || [chapter];
    const identity = createChapterIdentity(chapter, chapters);
    const existing = this.findChapterMarkerEntry(view.file, chapter, chapters);
    const current = existing
      ? { ...existing.marker }
      : { revisit: false, important: false };
    current[markerName] = !current[markerName];

    if (existing) delete markers[existing.key];
    if (current.revisit || current.important) {
      current.identity = identity;
      const storageKey = createChapterMarkerKey(identity) || chapter.id;
      markers[storageKey] = current;
    } else {
      this.pruneReadingFileState(view.file);
    }

    this.ensureReadingState().version = 2;
    await this.saveSettings();
    this.updateAllMarkdownViews();
    return current[markerName];
  }

`;
legacy = replaceSection(
  legacy,
  '  async toggleChapterMarker(view, chapter, markerName) {',
  '  async toggleCurrentChapterMarker(markerName, view) {',
  toggleMethod,
  'legacy toggle chapter marker'
);

const clearChapterMarkers = `  async clearChapterMarkers(view, chapter) {
    if (!view?.file || !chapter?.id) return false;
    const chapters = this.fileChapterSnapshots.get(view.file.path) || this.viewChapterSnapshots.get(view) || [chapter];
    const entry = this.findChapterMarkerEntry(view.file, chapter, chapters);
    if (!entry) return false;
    const fileState = this.getReadingFileState(view.file, false);
    delete fileState.markers[entry.key];
    this.pruneReadingFileState(view.file);
    await this.saveSettings();
    this.updateAllMarkdownViews();
    return true;
  }

`;
legacy = replaceSection(
  legacy,
  '  async clearChapterMarkers(view, chapter) {',
  '  mergeReadingFileStates(destinationState, sourceState) {',
  clearChapterMarkers,
  'legacy clear chapter markers'
);

legacy = replaceOnce(
  legacy,
  `        current.revisit = current.revisit || marker.revisit === true;\n        current.important = current.important || marker.important === true;\n        merged.markers[chapterId] = current;`,
  `        current.revisit = current.revisit || marker.revisit === true;\n        current.important = current.important || marker.important === true;\n        if (!current.identity) {\n          const identity = normalizeChapterIdentity(marker.identity);\n          if (identity) current.identity = identity;\n        }\n        merged.markers[chapterId] = current;`,
  'legacy merge marker identity'
);

const resumeNotice = `  maybeShowResumeNotice(view, content, file) {
    if (!this.isReadingBookmarksEnabled() || !this.isActiveMarkdownView(view) || !file?.path || this.resumePromptedPaths.has(file.path)) return;
    const savedResume = this.getReadingFileState(file, false)?.resume;
    if (!savedResume?.chapterId) return;

    this.resumePromptedPaths.add(file.path);
    const chapters = this.extractAllChapters(content, file);
    this.fileChapterSnapshots.set(file.path, chapters);
    const identity = normalizeChapterIdentity(savedResume.identity);
    const chapter = identity
      ? resolveChapterIdentity(identity, chapters)
      : chapters.find((item) => item.id === savedResume.chapterId);
    if (chapter) {
      this.showNotice(t('resumeAvailable', { title: chapter.title || savedResume.title }));
    }
  }

`;
legacy = replaceSection(
  legacy,
  '  maybeShowResumeNotice(view, content, file) {',
  '  showNotice(message, timeout = 6000) {',
  resumeNotice,
  'legacy resume notice'
);

legacy = replaceOnce(
  legacy,
  '    this.viewChapterSnapshots.set(view, chapters);\n    this.maybeShowResumeNotice(view, content, file);',
  '    this.viewChapterSnapshots.set(view, chapters);\n    this.fileChapterSnapshots.set(file.path, chapters);\n    this.maybeShowResumeNotice(view, content, file);',
  'legacy attach file snapshot'
);
legacy = replaceOnce(
  legacy,
  '    this.documentRevisions?.clear?.();\n',
  '    this.documentRevisions?.clear?.();\n    this.fileChapterSnapshots?.clear?.();\n',
  'legacy clear file snapshots'
);
legacy = replaceOnce(
  legacy,
  'ChapterPipelinePlugin.updateHierarchyFolding = updateHierarchyFolding;\n',
  `ChapterPipelinePlugin.updateHierarchyFolding = updateHierarchyFolding;\nChapterPipelinePlugin.createChapterIdentity = createChapterIdentity;\nChapterPipelinePlugin.resolveChapterIdentity = resolveChapterIdentity;\n`,
  'legacy static identity helpers'
);
legacy = replaceOnce(
  legacy,
  'module.exports.updateHierarchyFolding = updateHierarchyFolding;',
  `module.exports.updateHierarchyFolding = updateHierarchyFolding;\nmodule.exports.createChapterIdentity = createChapterIdentity;\nmodule.exports.resolveChapterIdentity = resolveChapterIdentity;`,
  'legacy exported identity helpers'
);
fs.writeFileSync(path.join('src', 'legacy-main.js'), legacy);

let mainTest = fs.readFileSync('main.test.js', 'utf8');
const integrationTest = `test('reading bookmarks recover across heading edits without misattaching duplicate sections', async () => {
  const { app, plugin, view } = createReadingHarness();
  plugin.settings.readingBookmarksEnabled = true;
  plugin.settings.minHeadingLevel = 1;
  plugin.settings.maxHeadingLevel = 6;
  plugin.settings.ignoreFirstH1 = false;
  plugin.settings.showExcerpt = false;
  plugin.app.workspace.getActiveViewOfType = () => view;

  const setDocument = (headings) => {
    app.metadataCache.getFileCache = () => ({ headings });
    app.vault.cachedRead = async () => headings
      .map((heading) => \`${'#'.repeat(heading.level)} \${heading.heading}\`)
      .join('\\n');
  };

  setDocument([
    { heading: 'Intro', level: 1, position: { start: { line: 0 } } },
    { heading: 'Target', level: 2, position: { start: { line: 4 } } },
    { heading: 'After', level: 2, position: { start: { line: 8 } } }
  ]);
  await plugin.attachStepperToView(view);
  let chapters = await plugin.getChaptersForView(view);
  const originalTarget = chapters.find((chapter) => chapter.title === 'Target');
  assert.equal(plugin.recordReadingPosition(view, originalTarget), true);
  await plugin.toggleChapterMarker(view, originalTarget, 'important');
  assert.equal(plugin.settings.readingState.version, 2);
  assert.ok(plugin.getReadingFileState(view.file, false).resume.identity);

  // Rename: line + surrounding context restores both resume and marker.
  setDocument([
    { heading: 'Intro', level: 1, position: { start: { line: 0 } } },
    { heading: 'Target Renamed', level: 2, position: { start: { line: 4 } } },
    { heading: 'After', level: 2, position: { start: { line: 8 } } }
  ]);
  await plugin.attachStepperToView(view);
  chapters = await plugin.getChaptersForView(view);
  const renamedTarget = chapters.find((chapter) => chapter.title === 'Target Renamed');
  assert.equal(plugin.getChapterMarkers(view.file, renamedTarget).important, true);
  let jumpedTo = null;
  plugin.jumpToHeading = (_targetView, chapter) => { jumpedTo = chapter; };
  assert.equal(await plugin.resumeLastChapter(view), true);
  assert.equal(jumpedTo.title, 'Target Renamed');

  // Line insertion: title fallback keeps the restored identity attached.
  setDocument([
    { heading: 'Intro', level: 1, position: { start: { line: 0 } } },
    { heading: 'Target Renamed', level: 2, position: { start: { line: 11 } } },
    { heading: 'After', level: 2, position: { start: { line: 15 } } }
  ]);
  await plugin.attachStepperToView(view);
  chapters = await plugin.getChaptersForView(view);
  const shiftedTarget = chapters.find((chapter) => chapter.title === 'Target Renamed');
  assert.equal(plugin.getChapterMarkers(view.file, shiftedTarget).important, true);
  assert.equal(await plugin.resumeLastChapter(view), true);
  assert.equal(jumpedTo.line, 11);

  // Duplicate titles: parent/nearby context wins over stale occurrence and line.
  await plugin.clearReadingBookmarks(view);
  setDocument([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } }
  ]);
  await plugin.attachStepperToView(view);
  chapters = await plugin.getChaptersForView(view);
  const groupADetails = chapters[2];
  await plugin.toggleChapterMarker(view, groupADetails, 'revisit');

  setDocument([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } }
  ]);
  await plugin.attachStepperToView(view);
  chapters = await plugin.getChaptersForView(view);
  assert.equal(plugin.getChapterMarkers(view.file, chapters[2]), null, 'bookmark must not follow stale duplicate occurrence');
  assert.equal(plugin.getChapterMarkers(view.file, chapters[4]).revisit, true, 'bookmark should stay under Group A');

  // Deleting the bookmarked heading must not attach its marker to an unrelated sibling.
  setDocument([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 6 } } },
    { heading: 'End', level: 2, position: { start: { line: 8 } } }
  ]);
  await plugin.attachStepperToView(view);
  chapters = await plugin.getChaptersForView(view);
  for (const chapter of chapters) {
    assert.equal(plugin.getChapterMarkers(view.file, chapter)?.revisit === true, false);
  }
  const remainingMarkers = Object.values(plugin.getReadingFileState(view.file, false).markers);
  assert.equal(remainingMarkers.some((marker) => marker.revisit === true), true, 'unresolved bookmark should remain stored');
});

`;
mainTest = replaceOnce(
  mainTest,
  "test('user-facing strings follow Chinese Obsidian language and fall back to English otherwise', async () => {",
  integrationTest + "test('user-facing strings follow Chinese Obsidian language and fall back to English otherwise', async () => {",
  'integration test insertion'
);
fs.writeFileSync('main.test.js', mainTest);

const identityTest = `const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

class Plugin {}
class MarkdownView {}
class PluginSettingTab {}
class Setting {}
class SuggestModal {}
class Menu {}
class Notice {}

const originalLoad = Module._load;
Module._load = function loadWithObsidianStub(request, parent, isMain) {
  if (request === 'obsidian') {
    return {
      Plugin,
      MarkdownView,
      MarkdownRenderer: { render() {} },
      PluginSettingTab,
      Setting,
      SuggestModal,
      Menu,
      Notice,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ChapterPipelinePlugin = require('./main.js');
Module._load = originalLoad;

const { ChapterParser, ReadingStorage, createChapterIdentity, resolveChapterIdentity } = ChapterPipelinePlugin;

function parse(headings) {
  const content = headings.map((heading) => \`${'#'.repeat(heading.level)} \${heading.heading}\`).join('\\n');
  return ChapterParser.parse(content, headings, {
    minHeadingLevel: 1,
    maxHeadingLevel: 6,
    ignoreFirstH1: false,
    showExcerpt: false,
  });
}

test('v2 identity resolves rename, line shift, duplicate reorder, and deletion conservatively', () => {
  const original = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  const saved = createChapterIdentity(original[2], original);

  const renamed = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details Renamed', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, renamed).title, 'Details Renamed');

  const shifted = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 9 } } },
    { heading: 'Details', level: 3, position: { start: { line: 14 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 20 } } },
    { heading: 'Details', level: 3, position: { start: { line: 24 } } },
    { heading: 'End', level: 2, position: { start: { line: 28 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, shifted).line, 14);

  const reordered = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, reordered).id, reordered[4].id);
  assert.notEqual(reordered[4].id, original[2].id);

  const deleted = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 4 } } },
    { heading: 'Details', level: 3, position: { start: { line: 6 } } },
    { heading: 'End', level: 2, position: { start: { line: 8 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, deleted), null);
});

test('ReadingStorage migrates v1 records to v2 without dropping legacy resume or markers', async () => {
  const host = {
    settings: { readingState: null },
    loadData: async () => ({
      readingState: {
        version: 1,
        files: {
          'note.md': {
            resume: { chapterId: 'h2:details:0', title: 'Details', updatedAt: 42 },
            markers: { 'h2:details:0': { revisit: true, important: false } },
          },
        },
      },
    }),
    saveData: async () => {},
  };
  const storage = new ReadingStorage(host);
  const state = await storage.load();
  assert.equal(state.version, 2);
  assert.equal(state.files['note.md'].resume.chapterId, 'h2:details:0');
  assert.equal(state.files['note.md'].resume.identity, undefined);
  assert.equal(state.files['note.md'].markers['h2:details:0'].revisit, true);
});
`;
fs.writeFileSync('reading-identity.test.js', identityTest);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!packageJson.scripts?.test?.includes('reading-identity.test.js')) {
  packageJson.scripts.test += ' reading-identity.test.js';
}
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

console.log('Applied Issue #13 source, schema, and test changes.');
