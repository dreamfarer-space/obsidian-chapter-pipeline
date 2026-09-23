import { MarkdownView } from 'obsidian';
import { DEFAULT_SETTINGS } from './constants';
import { ChapterParser } from './core/parser';
import { SoundEngine } from './core/sound';
import { ReadingStorage, normalizeReadingState } from './core/storage';
import {
  chapterIdentityEquals,
  createChapterIdentity,
  createChapterMarkerKey,
  normalizeChapterIdentity,
  resolveChapterIdentity
} from './core/reading-identity';
import { LivePreviewTracker } from './views/live-preview-tracker';
import { ReadingViewTracker } from './views/reading-view-tracker';
import { ViewSession } from './views/view-session';
import { updateHierarchyFolding } from './ui/stepper';
import { StepperView } from './ui/stepper';
import { TooltipManager } from './ui/tooltip';
import { ChapterSuggestModal as TypedChapterSuggestModal } from './ui/modal';
import { ChapterPipelineSettingTab as TypedChapterPipelineSettingTab } from './ui/settings-tab';
import { applyRuntimePerformancePatches } from './runtime-performance';
import type { ChapterMarker, ChapterNode, FileLike, ReadingFileState } from './types';

interface LegacyScrollBinding {
  scrollers?: Array<{ removeEventListener?: (...args: unknown[]) => void }>;
  scroller?: { removeEventListener?: (...args: unknown[]) => void };
  handler?: (...args: unknown[]) => void;
}

interface ProductionPlugin {
  settings?: Record<string, unknown>;
  soundEngine?: { playScrollTick?: (volume: number) => void; playClick?: (volume: number) => void };
  scrollBindings?: Map<unknown, LegacyScrollBinding>;
  viewSessions?: Map<object, ViewSession>;
  viewSessionVersions?: Map<object, number>;
  viewChapterSnapshots?: WeakMap<object, ChapterNode[]>;
  fileChapterSnapshots?: Map<string, ChapterNode[]>;
  viewTooltips?: Map<object, HTMLElement>;
  app?: {
    workspace?: {
      getLeavesOfType?: (type: string) => Array<{ view?: object }>;
      getActiveViewOfType?: (viewType: unknown) => object | null;
    };
  };
  getReadingHeading?: (view: object, chapter: ChapterNode) => Element | null;
  getViewScroller?: (container: HTMLElement, view: object) => HTMLElement | null;
  isReadingMode?: (view: object, container?: HTMLElement | null) => boolean;
  jumpToHeading?: (view: object, chapter: ChapterNode) => void;
  recordReadingPosition?: (view: object, chapter: ChapterNode) => boolean;
}

type ReadingAwarePlugin = ProductionPlugin & Record<string, any>;

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

// The legacy coordinator remains the compatibility boundary for product/UI
// behavior while typed view sessions take over the real production scroll path.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LegacyPlugin = require('./legacy-main.js') as {
  new (...args: unknown[]): ProductionPlugin;
  prototype: ProductionPlugin & Record<string, unknown>;
  ChapterParser?: typeof ChapterParser;
  SoundEngine?: typeof SoundEngine;
  updateHierarchyFolding?: typeof updateHierarchyFolding;
};

applyRuntimePerformancePatches(LegacyPlugin as never);

function filePathOf(fileOrPath: FileLike | string | null | undefined): string {
  return typeof fileOrPath === 'string' ? fileOrPath : fileOrPath?.path || '';
}

function getIdentityChapters(
  plugin: ReadingAwarePlugin,
  fileOrPath: FileLike | string,
  chapter?: ChapterNode,
  view?: object
): ChapterNode[] {
  const path = filePathOf(fileOrPath);
  const byFile = path ? plugin.fileChapterSnapshots?.get(path) : undefined;
  if (byFile?.length) return byFile;
  const byView = view ? plugin.viewChapterSnapshots?.get(view) : undefined;
  if (byView?.length) return byView;
  return chapter ? [chapter] : [];
}

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

/**
 * Install v2 persisted chapter identities on the production compatibility
 * coordinator. This deliberately lives at the compatibility boundary so the
 * real Obsidian path and the typed storage module share the same schema.
 */
function installReadingIdentityPersistence(): void {
  const prototype = LegacyPlugin.prototype as ReadingAwarePlugin;
  if (prototype.__readingIdentityV2Installed) return;
  prototype.__readingIdentityV2Installed = true;

  prototype.loadSettings = async function (this: ReadingAwarePlugin): Promise<void> {
    const loaded = await this.loadData?.();
    const loadedSettings = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    const settings = this.settings as Record<string, any>;

    if (settings.showExcerpt === undefined) settings.showExcerpt = true;
    if (typeof settings.excerptLength !== 'number' || settings.excerptLength < 60 || settings.excerptLength > 300) {
      settings.excerptLength = 140;
    }
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
      const path = typedView.file?.path;
      const chapters = this.viewChapterSnapshots?.get(view);
      if (path && chapters?.length) {
        this.fileChapterSnapshots ??= new Map<string, ChapterNode[]>();
        this.fileChapterSnapshots.set(path, chapters);
      }
    };
  }

  const legacyGetAllChapters = prototype.getAllChaptersForView;
  if (typeof legacyGetAllChapters === 'function') {
    prototype.getAllChaptersForView = async function (this: ReadingAwarePlugin, view: object): Promise<ChapterNode[]> {
      const chapters = await legacyGetAllChapters.call(this, view) as ChapterNode[];
      const typedView = view as { file?: FileLike };
      if (typedView?.file?.path && chapters.length) {
        this.fileChapterSnapshots ??= new Map<string, ChapterNode[]>();
        this.fileChapterSnapshots.set(typedView.file.path, chapters);
      }
      return chapters;
    };
  }

  prototype.getChapterMarkers = function (
    this: ReadingAwarePlugin,
    file: FileLike,
    chapter: ChapterNode
  ): ChapterMarker | null {
    if (!file || !chapter?.id) return null;
    const chapters = getIdentityChapters(this, file, chapter);
    return findChapterMarkerEntry(this, file, chapter, chapters)?.marker ?? null;
  };

  prototype.recordReadingPosition = function (
    this: ReadingAwarePlugin,
    view: object,
    chapter: ChapterNode
  ): boolean {
    const typedView = view as { file?: FileLike };
    if (!this.isReadingBookmarksEnabled?.() || !this.isActiveMarkdownView?.(view) || !typedView.file || !chapter?.id) {
      return false;
    }

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
      // Preserve unresolved v2 records so a temporary edit does not silently
      // destroy a valid bookmark. Keep the legacy v1 cleanup behavior.
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
    if (!this.isReadingBookmarksEnabled?.() || !file || !chapter?.id || !['revisit', 'important'].includes(markerName)) {
      return false;
    }

    const fileState = this.getReadingFileState?.(file, true) as ReadingFileState | null;
    if (!fileState) return false;
    const chapters = await this.getAllChaptersForView?.(view) as ChapterNode[];
    const identityChapter = chapters.find((candidate) => candidate.id === chapter.id) ?? chapter;
    const identity = createChapterIdentity(identityChapter, chapters.length ? chapters : [chapter]);
    const existing = findChapterMarkerEntry(this, file, chapter, chapters.length ? chapters : [chapter]);
    const current: ChapterMarker = existing
      ? { ...existing.marker }
      : { revisit: false, important: false };
    current[markerName] = !current[markerName];

    if (existing) delete fileState.markers[existing.key];
    if (current.revisit || current.important) {
      current.identity = identity;
      const key = createChapterMarkerKey(identity) || chapter.id;
      fileState.markers[key] = current;
    } else {
      this.pruneReadingFileState?.(file);
    }

    this.ensureReadingState?.();
    await this.saveSettings?.();
    this.updateAllMarkdownViews?.();
    return current[markerName];
  };

  prototype.clearChapterMarkers = async function (
    this: ReadingAwarePlugin,
    view: object,
    chapter: ChapterNode
  ): Promise<boolean> {
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
        const current = merged.markers[key] || { revisit: false, important: false };
        current.revisit = current.revisit || marker.revisit === true;
        current.important = current.important || marker.important === true;
        if (!current.identity) {
          const identity = normalizeChapterIdentity(marker.identity);
          if (identity) current.identity = identity;
        }
        merged.markers[key] = current;
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
    if (!this.isReadingBookmarksEnabled?.() || !this.isActiveMarkdownView?.(view) || !file?.path || this.resumePromptedPaths?.has(file.path)) {
      return;
    }
    const chapters = this.extractAllChapters?.(content, file) as ChapterNode[];
    this.fileChapterSnapshots ??= new Map<string, ChapterNode[]>();
    this.fileChapterSnapshots.set(file.path, chapters);

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
      const title = chapter.title || savedResume.title;
      const message = readingNoticeText('resumeAvailable', title);
      this.showNotice?.(message);
    }
  };
}

installReadingIdentityPersistence();

/** Remove the compatibility renderer's scroll listener before typed tracking takes ownership. */
function removeLegacyScrollBinding(plugin: ProductionPlugin, container: HTMLElement): void {
  const binding = plugin.scrollBindings?.get(container);
  if (!binding) return;
  const scrollers = binding.scrollers ?? (binding.scroller ? [binding.scroller] : []);
  if (binding.handler) {
    scrollers.forEach((scroller) => scroller?.removeEventListener?.('scroll', binding.handler, true));
  }
  plugin.scrollBindings?.delete(container);
}

/** Install typed per-view session ownership onto the legacy coordinator exactly once. */
function installTypedProductionSessions(): void {
  const prototype = LegacyPlugin.prototype as ProductionPlugin & {
    attachStepperToView?: (view: object) => Promise<void>;
    updateAllMarkdownViews?: () => void;
    onunload?: () => void;
  };
  const legacyAttach = prototype.attachStepperToView;
  if (!legacyAttach || (legacyAttach as { __typedSessionsInstalled?: boolean }).__typedSessionsInstalled) return;

  /** Attach one generation-guarded typed session after the compatibility renderer finishes. */
  const typedAttach = async function (this: ProductionPlugin, view: object): Promise<void> {
    this.viewSessions ??= new Map<object, ViewSession>();
    this.viewSessionVersions ??= new Map<object, number>();
    const sessionVersion = (this.viewSessionVersions.get(view) ?? 0) + 1;
    this.viewSessionVersions.set(view, sessionVersion);

    this.viewSessions.get(view)?.dispose();
    this.viewSessions.delete(view);

    await legacyAttach.call(this, view);
    if (this.viewSessionVersions.get(view) !== sessionVersion) return;

    const typedView = view as { contentEl?: HTMLElement; file?: unknown };
    const container = typedView?.contentEl;
    if (!container || !typedView.file || typeof typedView.file !== 'object') return;

    const stepperElement = container.querySelector('.codex-stepper-container') as HTMLElement | null;
    if (!stepperElement) return;

    // Reuse the exact per-view chapter snapshot that produced the adopted dash DOM.
    // Resume lookups may parse a wider heading range and must not replace it.
    const chapters = this.viewChapterSnapshots?.get(view) ?? [];
    if (!chapters.length) return;

    const dashElements = Array.from(container.querySelectorAll('.codex-dash-item')) as HTMLElement[];
    const tooltipElement = this.viewTooltips?.get(view) ?? null;
    const isReading = this.isReadingMode?.(view, container) === true;
    const scroller = isReading
      ? this.getViewScroller?.(container, view) ?? (container.querySelector('.markdown-preview-view') as HTMLElement | null)
      : this.getViewScroller?.(container, view) ?? (container.querySelector('.cm-scroller') as HTMLElement | null);

    if (!scroller) return;

    // The compatibility renderer binds its historical scroll handler while it
    // builds the DOM. Remove it before installing the typed tracker so users do
    // not run two tracking implementations in parallel.
    removeLegacyScrollBinding(this, container);

    const hierarchyMode = (this.settings?.hierarchyMode ?? 'all') as 'all' | 'hover-expand' | 'active-branch';
    const railIndicator = container.querySelector('.codex-progress-indicator') as HTMLElement | null;

    const session = new ViewSession({
      view,
      mode: isReading ? 'reading' : 'live-preview',
      container: scroller,
      chapters,
      stepperElement,
      dashElements,
      tooltipElement,
      hierarchyMode,
      // Legacy has already established the initial dash/rail state. The typed
      // tracker becomes authoritative from the first real scroll/mutation.
      trackImmediately: false,
      findReadingHeading: isReading && this.getReadingHeading
        ? (chapter) => this.getReadingHeading?.(view, chapter) ?? null
        : undefined,
      onSelectChapter: (chapter) => this.jumpToHeading?.(view, chapter),
      onActiveChapter: (index, previousIndex) => {
        dashElements.forEach((element, elementIndex) => {
          if (elementIndex === index) element.classList.add('active');
          else element.classList.remove('active');
        });

        if (railIndicator) {
          if (chapters.length <= 1) {
            railIndicator.style.height = '100%';
          } else {
            const activeItem = dashElements[index];
            const offsetTop = Number((activeItem as HTMLElement & { offsetTop?: number })?.offsetTop) || 0;
            const offsetHeight = Number((activeItem as HTMLElement & { offsetHeight?: number })?.offsetHeight) || 10;
            railIndicator.style.height = offsetTop > 0
              ? `${offsetTop + (offsetHeight / 2)}px`
              : `${Math.round((index / (chapters.length - 1)) * 100)}%`;
          }
        }

        if (previousIndex >= 0 && previousIndex !== index) {
          const volume = typeof this.settings?.soundVolume === 'number' ? this.settings.soundVolume : 50;
          this.soundEngine?.playScrollTick?.(volume);
          this.recordReadingPosition?.(view, chapters[index]);
        }
      },
    });

    const markdownLeaves = this.app?.workspace?.getLeavesOfType?.('markdown');
    const isMounted = markdownLeaves === undefined || markdownLeaves.some((leaf) => leaf?.view === view);
    if (this.viewSessionVersions.get(view) !== sessionVersion || typedView.contentEl !== container || !isMounted) {
      session.dispose();
      return;
    }
    this.viewSessions.set(view, session);
  };
  (typedAttach as { __typedSessionsInstalled?: boolean }).__typedSessionsInstalled = true;
  prototype.attachStepperToView = typedAttach;

  const legacyUpdateAllMarkdownViews = prototype.updateAllMarkdownViews;
  if (legacyUpdateAllMarkdownViews) {
    prototype.updateAllMarkdownViews = function (this: ProductionPlugin): void {
      const leaves = this.app?.workspace?.getLeavesOfType?.('markdown') ?? [];
      const mountedViews = new Set<object>();
      leaves.forEach((leaf) => {
        if (leaf?.view && typeof leaf.view === 'object') mountedViews.add(leaf.view);
      });
      this.viewSessions?.forEach((session, sessionView) => {
        if (mountedViews.has(sessionView)) return;
        session.dispose();
        this.viewSessions?.delete(sessionView);
        this.viewSessionVersions?.delete(sessionView);
      });
      legacyUpdateAllMarkdownViews.call(this);
    };
  }

  const legacyUnload = prototype.onunload;
  prototype.onunload = function (this: ProductionPlugin): void {
    this.viewSessions?.forEach((session) => session.dispose());
    this.viewSessions?.clear();
    this.viewSessionVersions?.clear();
    this.fileChapterSnapshots?.clear();
    legacyUnload?.call(this);
  };
}

installTypedProductionSessions();

LegacyPlugin.ChapterParser = ChapterParser;
LegacyPlugin.SoundEngine = SoundEngine;
LegacyPlugin.updateHierarchyFolding = updateHierarchyFolding;

// Expose the typed building blocks for incremental adoption by the coordinator
// and by downstream integrations. The legacy static names above remain stable.
const PublicPlugin = LegacyPlugin as typeof LegacyPlugin & Record<string, unknown>;
PublicPlugin.ReadingStorage = ReadingStorage;
PublicPlugin.ReadingViewTracker = ReadingViewTracker;
PublicPlugin.LivePreviewTracker = LivePreviewTracker;
PublicPlugin.ViewSession = ViewSession;
PublicPlugin.StepperView = StepperView;
PublicPlugin.TooltipManager = TooltipManager;
PublicPlugin.TypedChapterSuggestModal = TypedChapterSuggestModal;
PublicPlugin.TypedChapterPipelineSettingTab = TypedChapterPipelineSettingTab;
PublicPlugin.createChapterIdentity = createChapterIdentity;
PublicPlugin.resolveChapterIdentity = resolveChapterIdentity;
PublicPlugin.normalizeChapterIdentity = normalizeChapterIdentity;

// Obsidian loads plugins through module.exports. `export =` preserves the same
// shape for Node-based tests and for the production bundle.
export = LegacyPlugin;
