import { ChapterParser } from './core/parser';
import { SoundEngine } from './core/sound';
import { ReadingStorage } from './core/storage';
import { LivePreviewTracker } from './views/live-preview-tracker';
import { ReadingViewTracker } from './views/reading-view-tracker';
import { ViewSession } from './views/view-session';
import { updateHierarchyFolding } from './ui/stepper';
import { StepperView } from './ui/stepper';
import { TooltipManager } from './ui/tooltip';
import { ChapterSuggestModal as TypedChapterSuggestModal } from './ui/modal';
import { ChapterPipelineSettingTab as TypedChapterPipelineSettingTab } from './ui/settings-tab';
import type { ChapterNode } from './types';

interface LegacyScrollBinding {
  scrollers?: Array<{ removeEventListener?: (...args: unknown[]) => void }>;
  scroller?: { removeEventListener?: (...args: unknown[]) => void };
  handler?: (...args: unknown[]) => void;
}

interface ProductionPlugin {
  settings?: Record<string, unknown>;
  soundEngine?: { playScrollTick?: (volume: number) => void };
  scrollBindings?: Map<unknown, LegacyScrollBinding>;
  viewSessions?: Map<object, ViewSession>;
  viewSessionVersions?: Map<object, number>;
  viewChapterSnapshots?: WeakMap<object, ChapterNode[]>;
  viewTooltips?: Map<object, HTMLElement>;
  app?: { workspace?: { getLeavesOfType?: (type: string) => Array<{ view?: object }> } };
  getReadingHeading?: (view: object, chapter: ChapterNode) => Element | null;
  getViewScroller?: (container: HTMLElement, view: object) => HTMLElement | null;
  isReadingMode?: (view: object, container?: HTMLElement | null) => boolean;
  jumpToHeading?: (view: object, chapter: ChapterNode) => void;
  recordReadingPosition?: (view: object, chapter: ChapterNode) => void;
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

function removeLegacyScrollBinding(plugin: ProductionPlugin, container: HTMLElement): void {
  const binding = plugin.scrollBindings?.get(container);
  if (!binding) return;
  const scrollers = binding.scrollers ?? (binding.scroller ? [binding.scroller] : []);
  if (binding.handler) {
    scrollers.forEach((scroller) => scroller?.removeEventListener?.('scroll', binding.handler, true));
  }
  plugin.scrollBindings?.delete(container);
}

function installTypedProductionSessions(): void {
  const prototype = LegacyPlugin.prototype as ProductionPlugin & {
    attachStepperToView?: (view: object) => Promise<void>;
    updateAllMarkdownViews?: () => void;
    onunload?: () => void;
  };
  const legacyAttach = prototype.attachStepperToView;
  if (!legacyAttach || (legacyAttach as { __typedSessionsInstalled?: boolean }).__typedSessionsInstalled) return;

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
          if (this.settings?.enableSound !== false) {
            const volume = typeof this.settings?.soundVolume === 'number' ? this.settings.soundVolume : 50;
            this.soundEngine?.playScrollTick?.(volume);
          }
          this.recordReadingPosition?.(view, chapters[index]);
        }
      },
    });

    if (this.viewSessionVersions.get(view) !== sessionVersion || typedView.contentEl !== container) {
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

// Obsidian loads plugins through module.exports. `export =` preserves the same
// shape for Node-based tests and for the production bundle.
export = LegacyPlugin;
