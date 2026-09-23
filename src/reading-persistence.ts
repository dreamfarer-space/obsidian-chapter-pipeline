import { MarkdownView } from 'obsidian';
import { DEFAULT_SETTINGS } from './constants';
import { normalizeReadingState } from './core/storage';
import {
  chapterIdentityEquals,
  createChapterIdentity,
  createChapterMarkerKey,
  normalizeChapterIdentity,
  resolveChapterIdentity
} from './core/reading-identity';
import type { ChapterMarker, ChapterNode, FileLike, ReadingFileState } from './types';

const MAX_FILE_CHAPTER_SNAPSHOTS = 32;

type ReadingAwarePlugin = Record<string, any> & {
  fileChapterSnapshots?: Map<string, ChapterNode[]>;
  viewChapterSnapshots?: WeakMap<object, ChapterNode[]>;
};

type LegacyPluginConstructor = {
  prototype: ReadingAwarePlugin;
};

/** Return a stable path from either a file-like object or an already-normalized path. */
function filePathOf(fileOrPath: FileLike | string | null | undefined): string {
  return typeof fileOrPath === 'string' ? fileOrPath : fileOrPath?.path || '';
}

/** Remember a chapter snapshot in a small insertion-ordered LRU to bound long-session memory use. */
function rememberFileChapterSnapshot(plugin: ReadingAwarePlugin, path: string, chapters: ChapterNode[]): void {
  if (!path || !chapters?.length) return;
  plugin.fileChapterSnapshots ??= new Map<string, ChapterNode[]>();
  plugin.fileChapterSnapshots.delete(path);
  plugin.fileChapterSnapshots.set(path, chapters);
  while (plugin.fileChapterSnapshots.size > MAX_FILE_CHAPTER_SNAPSHOTS) {
    const oldest = plugin.fileChapterSnapshots.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    plugin.fileChapterSnapshots.delete(oldest);
  }
}

/** Prefer the most complete cached chapter list while refreshing LRU recency on file hits. */
function getIdentityChapters(
  plugin: ReadingAwarePlugin,
  fileOrPath: FileLike | string,
  chapter?: ChapterNode,
  view?: object
): ChapterNode[] {
  const path = filePathOf(fileOrPath);
  const byFile = path ? plugin.fileChapterSnapshots?.get(path) : undefined;
  if (path && byFile?.length) {
    plugin.fileChapterSnapshots?.delete(path);
    plugin.fileChapterSnapshots?.set(path, byFile);
    return byFile;
  }
  const byView = view ? plugin.viewChapterSnapshots?.get(view) : undefined;
  if (byView?.length) return byView;
  return chapter ? [chapter] : [];
}

/** Find the stored marker that resolves to a live chapter, lazily enriching v1 markers when safe. */
function findChapterMarkerEntry(
  plugin: ReadingAwarePlugin,
  file: FileLike,
  chapter: ChapterNode,
  chapters: ChapterNode[]
): { key: string; marker: ChapterMarker } | null {
  const fileState = plugin.getReadingFileState?.(file, false) as ReadingFileState | null | undefined;
  const markers = fileState?.markers;
  if (!markers) return null;

  const exact = markers[chapter.id];
  if (exact) {
    const identity = normalizeChapterIdentity(exact.identity);
    if (!identity) {
      exact.identity = createChapterIdentity(chapter, chapters.length ? chapters : [chapter]);
      plugin.ensureReadingState?.();
      plugin.scheduleReadingStateSave?.();
      return { key: chapter.id, marker: exact };
    }
    const resolved = resolveChapterIdentity(identity, chapters);
    if (resolved?.id === chapter.id) return { key: chapter.id, marker: exact };
  }

  for (const [key, marker] of Object.entries(markers)) {
    if (key === chapter.id) continue;
    const identity = normalizeChapterIdentity(marker.identity);
    if (!identity) continue;
    const resolved = resolveChapterIdentity(identity, chapters);
    if (resolved?.id === chapter.id) return { key, marker };
  }
  return null;
}

/** Produce the localized notices used by the identity-aware resume path. */
function readingNoticeText(key: 'resumeUnavailable' | 'resumeNotFound' | 'resumeAvailable', title = ''): string {
  const language = (
    (typeof window !== 'undefined' && window.localStorage?.getItem('language')) ||
    (typeof navigator !== 'undefined' ? navigator.language : 'en') ||
    'en'
  ).toLowerCase();
  const zh = language.startsWith('zh');
  if (key === 'resumeUnavailable') return zh ? '这篇笔记没有保存的阅读位置。' : 'No saved reading position in this note.';
  if (key === 'resumeNotFound') return zh ? '保存的章节已不存在，无法恢复。' : 'The saved chapter is no longer available.';
  return zh ? `可恢复上次阅读：${title}` : `Resume available: ${title}`;
}

/** Install v2 reading-state persistence on the legacy production coordinator exactly once. */
export function installReadingIdentityPersistence(LegacyPlugin: LegacyPluginConstructor): void {
  const prototype = LegacyPlugin.prototype;
  if (prototype.__readingIdentityV2Installed) return;
  prototype.__readingIdentityV2Installed = true;

  prototype.loadSettings = async function (this: ReadingAwarePlugin): Promise<void> {
    const loaded = await this.loadData?.();
    const loadedSettings = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    const settings = this.settings as Record<string, any>;

    if (settings.showExcerpt === undefined) settings.showExcerpt = true;
    if (typeof settings.excerptLength !== 'number' || settings.excerptLength < 60 || settings.excerptLength > 300) settings.excerptLength = 140;
    if (settings.activeColor === '#10b981') settings.activeColor = '#3b82f6';
    if (!settings.customActiveColor) settings.customActiveColor = '#3b82f6';
    if (settings.enableSound === undefined) settings.enableSound = false;
    if (settings.soundVolume === undefined) settings.soundVolume = 50;
    if (!settings.dockPosition) settings.dockPosition = 'left';
    if (!settings.hierarchyMode) settings.hierarchyMode = 'hover-expand';
    if (settings.showProgressRail === undefined) settings.showProgressRail = false;
    if (settings.tooltipGlassmorphism === undefined) settings.tooltipGlassmorphism = false;
    if (settings.showChapterOrder === undefined) settings.showChapterOrder = false;
    if (settings.readingBookmarksEnabled === undefined) settings.readingBookmarksEnabled = false;

    settings.readingState = normalizeReadingState(settings.readingState);
    await this.saveSettings?.();
  };

  prototype.ensureReadingState = function (this: ReadingAwarePlugin) {
    const state = this.settings?.readingState;
    const invalid = !state || typeof state !== 'object' || Array.isArray(state) ||
      !(state as Record<string, unknown>).files ||
      typeof (state as Record<string, unknown>).files !== 'object' ||
      Array.isArray((state as Record<string, unknown>).files);
    if (invalid || (state as { version?: number } | undefined)?.version !== 2) {
      if (!this.settings) this.settings = {};
      this.settings.readingState = normalizeReadingState(state);
    }
    return this.settings?.readingState;
  };

  const legacyAttach = prototype.attachStepperToView;
  if (typeof legacyAttach === 'function') {
    prototype.attachStepperToView = async function (this: ReadingAwarePlugin, view: object): Promise<void> {
      await legacyAttach.call(this, view);
      const typedView = view as { file?: FileLike };
      const chapters = this.viewChapterSnapshots?.get(view);
      if (typedView.file?.path && chapters?.length) rememberFileChapterSnapshot(this, typedView.file.path, chapters);
    };
  }

  const legacyGetAllChapters = prototype.getAllChaptersForView;
  if (typeof legacyGetAllChapters === 'function') {
    prototype.getAllChaptersForView = async function (this: ReadingAwarePlugin, view: object): Promise<ChapterNode[]> {
      const chapters = await legacyGetAllChapters.call(this, view) as ChapterNode[];
      const path = (view as { file?: FileLike })?.file?.path;
      if (path && chapters.length) rememberFileChapterSnapshot(this, path, chapters);
      return chapters;
    };
  }

  prototype.getChapterMarkers = function (this: ReadingAwarePlugin, file: FileLike, chapter: ChapterNode): ChapterMarker | null {
    if (!file || !chapter?.id) return null;
    const chapters = getIdentityChapters(this, file, chapter);
    return findChapterMarkerEntry(this, file, chapter, chapters)?.marker ?? null;
  };

  prototype.recordReadingPosition = function (this: ReadingAwarePlugin, view: object, chapter: ChapterNode): boolean {
    const typedView = view as { file?: FileLike };
    if (!this.isReadingBookmarksEnabled?.() || !this.isActiveMarkdownView?.(view) || !typedView.file || !chapter?.id) return false;

    const fileState = this.getReadingFileState?.(typedView.file, true) as ReadingFileState | null;
    if (!fileState) return false;
    const chapters = getIdentityChapters(this, typedView.file, chapter, view);
    const identity = createChapterIdentity(chapter, chapters);
    this.ensureReadingState?.();

    if (fileState.resume?.chapterId === chapter.id) {
      if (!chapterIdentityEquals(fileState.resume.identity, identity)) {
        fileState.resume.identity = identity;
        fileState.resume.title = chapter.title || chapter.rawHeading || fileState.resume.title || '';
        this.scheduleReadingStateSave?.();
      }
      return false;
    }

    fileState.resume = {
      chapterId: chapter.id,
      title: chapter.title || chapter.rawHeading || '',
      updatedAt: Date.now(),
      identity
    };
    this.scheduleReadingStateSave?.();
    return true;
  };

  prototype.resumeLastChapter = async function (this: ReadingAwarePlugin, view?: object): Promise<boolean> {
    if (!this.isReadingBookmarksEnabled?.()) return false;
    const targetView = view && (view as { file?: FileLike }).file
      ? view
      : this.app?.workspace?.getActiveViewOfType?.(MarkdownView);
    const file = (targetView as { file?: FileLike } | null)?.file;
    if (!targetView || !file) return false;

    const fileState = this.getReadingFileState?.(file, false) as ReadingFileState | null;
    const savedResume = fileState?.resume;
    if (!savedResume?.chapterId) {
      this.showNotice?.(readingNoticeText('resumeUnavailable'));
      return false;
    }

    const chapters = await this.getAllChaptersForView?.(targetView) as ChapterNode[];
    const identity = normalizeChapterIdentity(savedResume.identity);
    const targetChapter = identity
      ? resolveChapterIdentity(identity, chapters)
      : chapters.find((chapter) => chapter.id === savedResume.chapterId) ?? null;

    if (!targetChapter) {
      if (!identity && fileState) {
        delete fileState.resume;
        this.pruneReadingFileState?.(file);
        await this.saveSettings?.();
      }
      this.showNotice?.(readingNoticeText('resumeNotFound'));
      return false;
    }

    const refreshedIdentity = createChapterIdentity(targetChapter, chapters);
    if (savedResume.chapterId !== targetChapter.id || !chapterIdentityEquals(savedResume.identity, refreshedIdentity)) {
      savedResume.chapterId = targetChapter.id;
      savedResume.title = targetChapter.title || targetChapter.rawHeading || savedResume.title || '';
      savedResume.identity = refreshedIdentity;
      this.ensureReadingState?.();
      await this.saveSettings?.();
    }

    if (this.settings?.enableSound !== false) {
      const volume = typeof this.settings?.soundVolume === 'number' ? this.settings.soundVolume : 50;
      this.soundEngine?.playClick?.(volume);
    }
    this.jumpToHeading?.(targetView, targetChapter);
    return true;
  };

  prototype.toggleChapterMarker = async function (
    this: ReadingAwarePlugin,
    view: object,
    chapter: ChapterNode,
    markerName: 'revisit' | 'important'
  ): Promise<boolean> {
    const file = (view as { file?: FileLike })?.file;
    if (!this.isReadingBookmarksEnabled?.() || !file || !chapter?.id || !['revisit', 'important'].includes(markerName)) return false;

    const fileState = this.getReadingFileState?.(file, true) as ReadingFileState | null;
    if (!fileState) return false;
    const chapters = await this.getAllChaptersForView?.(view) as ChapterNode[];
    const identityChapter = chapters.find((candidate) => candidate.id === chapter.id) ?? chapter;
    const identity = createChapterIdentity(identityChapter, chapters.length ? chapters : [chapter]);
    const existing = findChapterMarkerEntry(this, file, chapter, chapters.length ? chapters : [chapter]);
    const current: ChapterMarker = existing ? { ...existing.marker } : { revisit: false, important: false };
    current[markerName] = !current[markerName];

    if (existing) delete fileState.markers[existing.key];
    if (current.revisit || current.important) {
      current.identity = identity;
      fileState.markers[createChapterMarkerKey(identity) || chapter.id] = current;
    } else {
      this.pruneReadingFileState?.(file);
    }

    this.ensureReadingState?.();
    await this.saveSettings?.();
    this.updateAllMarkdownViews?.();
    return current[markerName];
  };

  prototype.clearChapterMarkers = async function (this: ReadingAwarePlugin, view: object, chapter: ChapterNode): Promise<boolean> {
    const file = (view as { file?: FileLike })?.file;
    if (!file || !chapter?.id) return false;
    const chapters = getIdentityChapters(this, file, chapter, view);
    const entry = findChapterMarkerEntry(this, file, chapter, chapters);
    if (!entry) return false;
    const fileState = this.getReadingFileState?.(file, false) as ReadingFileState | null;
    if (!fileState) return false;
    delete fileState.markers[entry.key];
    this.pruneReadingFileState?.(file);
    await this.saveSettings?.();
    this.updateAllMarkdownViews?.();
    return true;
  };

  prototype.mergeReadingFileStates = function (
    this: ReadingAwarePlugin,
    destinationState?: ReadingFileState,
    sourceState?: ReadingFileState
  ): ReadingFileState {
    const merged: ReadingFileState = { markers: {} };
    for (const state of [destinationState, sourceState].filter(Boolean) as ReadingFileState[]) {
      for (const [key, marker] of Object.entries(state.markers || {})) {
        const identity = normalizeChapterIdentity(marker.identity);
        const mergedKey = identity ? (createChapterMarkerKey(identity) || key) : key;
        const current = merged.markers[mergedKey] || { revisit: false, important: false };
        current.revisit = current.revisit || marker.revisit === true;
        current.important = current.important || marker.important === true;
        if (!current.identity && identity) current.identity = identity;
        merged.markers[mergedKey] = current;
      }
    }

    const destinationResume = destinationState?.resume;
    const sourceResume = sourceState?.resume;
    if (destinationResume || sourceResume) {
      const newerSource = sourceResume && (!destinationResume || sourceResume.updatedAt > destinationResume.updatedAt);
      merged.resume = { ...(newerSource ? sourceResume : destinationResume)! };
    }
    return merged;
  };

  prototype.maybeShowResumeNotice = function (
    this: ReadingAwarePlugin,
    view: object,
    content: string,
    file: FileLike
  ): void {
    if (!this.isReadingBookmarksEnabled?.() || !this.isActiveMarkdownView?.(view) || !file?.path || this.resumePromptedPaths?.has(file.path)) return;
    const chapters = this.extractAllChapters?.(content, file) as ChapterNode[];
    rememberFileChapterSnapshot(this, file.path, chapters);

    const fileState = this.getReadingFileState?.(file, false) as ReadingFileState | null;
    const savedResume = fileState?.resume;
    if (!savedResume?.chapterId) return;

    this.resumePromptedPaths?.add(file.path);
    const identity = normalizeChapterIdentity(savedResume.identity);
    const chapter = identity
      ? resolveChapterIdentity(identity, chapters)
      : chapters.find((item) => item.id === savedResume.chapterId) ?? null;

    if (chapter) {
      if (!identity) {
        savedResume.identity = createChapterIdentity(chapter, chapters);
        this.ensureReadingState?.();
        this.scheduleReadingStateSave?.();
      }
      this.showNotice?.(readingNoticeText('resumeAvailable', chapter.title || savedResume.title));
    }
  };

  const legacyMigrateReadingState = prototype.migrateReadingState;
  if (typeof legacyMigrateReadingState === 'function') {
    prototype.migrateReadingState = async function (this: ReadingAwarePlugin, oldPath: string, newPath: string) {
      const result = await legacyMigrateReadingState.call(this, oldPath, newPath);
      this.fileChapterSnapshots?.delete(oldPath);
      return result;
    };
  }

  const legacyPruneDeletedReadingState = prototype.pruneDeletedReadingState;
  if (typeof legacyPruneDeletedReadingState === 'function') {
    prototype.pruneDeletedReadingState = async function (this: ReadingAwarePlugin, deletedPath: string) {
      const result = await legacyPruneDeletedReadingState.call(this, deletedPath);
      const prefix = deletedPath.endsWith('/') ? deletedPath : `${deletedPath}/`;
      for (const path of this.fileChapterSnapshots?.keys() ?? []) {
        if (path === deletedPath || path.startsWith(prefix)) this.fileChapterSnapshots?.delete(path);
      }
      return result;
    };
  }
}
