import { ChapterParser } from './core/parser';
import { SoundEngine } from './core/sound';
import { ReadingStorage } from './core/storage';
import {
  createChapterIdentity,
  createChapterMarkerKey,
  normalizeChapterIdentity,
  resolveChapterIdentity
} from './core/reading-identity';
import { installReadingIdentityPersistence } from './reading-persistence';
import { SessionCoordinator } from './session-coordinator';
import { LivePreviewTracker } from './views/live-preview-tracker';
import { ReadingViewTracker } from './views/reading-view-tracker';
import { buildViewRenderSignature, canReuseRenderedSession } from './views/render-signature';
import { ViewSession } from './views/view-session';
import { updateHierarchyFolding } from './ui/stepper';
import { StepperView } from './ui/stepper';
import { TooltipManager } from './ui/tooltip';
import { ChapterSuggestModal as TypedChapterSuggestModal } from './ui/modal';
import { ChapterPipelineSettingTab as TypedChapterPipelineSettingTab } from './ui/settings-tab';
import { applyRuntimePerformancePatches } from './runtime-performance';
import type { ChapterNode } from './types';

interface LegacyRenderResult {
  hostContainer: HTMLElement;
  chapters: ChapterNode[];
  stepperElement: HTMLElement;
  dashElements: HTMLElement[];
  tooltipElement: HTMLElement | null;
  railIndicator: HTMLElement | null;
  trackingContainer: HTMLElement | null;
  releaseLegacyScrollTracking: () => void;
  isCurrentMount: () => boolean;
  mode: 'reading' | 'live-preview';
}

interface ProductionPlugin {
  settings?: Record<string, unknown>;
  soundEngine?: { playScrollTick?: (volume: number) => void };
  sessionCoordinator?: SessionCoordinator<object, ViewSession>;
  fileChapterSnapshots?: Map<string, ChapterNode[]>;
  app?: { workspace?: { getLeavesOfType?: (type: string) => Array<{ view?: object }> } };
  getReadingHeading?: (view: object, chapter: ChapterNode) => Element | null;
  isActiveMarkdownView?: (view: object) => boolean;
  jumpToHeading?: (view: object, chapter: ChapterNode) => void;
  recordReadingPosition?: (view: object, chapter: ChapterNode) => void;
}

// The legacy coordinator remains the compatibility boundary for product/UI
// behavior while typed view sessions take over the real production scroll path.
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Keep the legacy coordinator as the CommonJS compatibility boundary until its migration is complete.
const LegacyPlugin = require('./legacy-main.js') as {
  new (...args: unknown[]): ProductionPlugin;
  prototype: ProductionPlugin & Record<string, unknown>;
  ChapterParser?: typeof ChapterParser;
  SoundEngine?: typeof SoundEngine;
  updateHierarchyFolding?: typeof updateHierarchyFolding;
};

applyRuntimePerformancePatches(LegacyPlugin as never);
installReadingIdentityPersistence(LegacyPlugin as never);

function getSessionCoordinator(plugin: ProductionPlugin): SessionCoordinator<object, ViewSession> {
  plugin.sessionCoordinator ??= new SessionCoordinator<object, ViewSession>();
  return plugin.sessionCoordinator;
}

/** Install typed per-view session ownership onto the legacy coordinator exactly once. */
function installTypedProductionSessions(): void {
  const prototype = LegacyPlugin.prototype as ProductionPlugin & {
    attachStepperToView?: (view: object) => Promise<void>;
    updateAllMarkdownViews?: () => void;
    onunload?: () => void;
  };
  const legacyAttach = prototype.attachStepperToView as
    | ((view: object) => Promise<LegacyRenderResult | undefined>)
    | undefined;
  if (!legacyAttach || (legacyAttach as { __typedSessionsInstalled?: boolean }).__typedSessionsInstalled) return;

  /** Attach one generation-guarded typed session after the compatibility renderer finishes. */
  const typedAttach = async function (this: ProductionPlugin, view: object): Promise<void> {
    const coordinator = getSessionCoordinator(this);
    const sessionGeneration = coordinator.begin(view);

    const rendered = await legacyAttach.call(this, view);
    if (!coordinator.isCurrent(view, sessionGeneration) || !rendered) return;

    const typedView = view as { contentEl?: HTMLElement; file?: unknown };
    const container = rendered.hostContainer;
    if (!typedView.file || typeof typedView.file !== 'object' || typedView.contentEl !== container) return;

    const {
      chapters,
      stepperElement,
      dashElements,
      tooltipElement,
      railIndicator,
      trackingContainer: scroller,
      releaseLegacyScrollTracking,
      isCurrentMount,
      mode
    } = rendered;
    if (!chapters.length || !scroller) return;

    releaseLegacyScrollTracking();

    const hierarchyMode = (this.settings?.hierarchyMode ?? 'all') as 'all' | 'hover-expand' | 'active-branch';
    const renderSignature = buildViewRenderSignature(this, view);

    const session = new ViewSession({
      view,
      mode,
      container: scroller,
      chapters,
      stepperElement,
      dashElements,
      tooltipElement,
      renderSignature,
      hierarchyMode,
      shouldTrack: () => this.isActiveMarkdownView?.(view) !== false,
      trackImmediately: false,
      isCurrentMount,
      findReadingHeading: mode === 'reading' && this.getReadingHeading
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
    if (typedView.contentEl !== container || !isMounted) {
      coordinator.detach(view);
      session.dispose();
      return;
    }
    coordinator.adopt(view, sessionGeneration, session);
  };
  (typedAttach as { __typedSessionsInstalled?: boolean }).__typedSessionsInstalled = true;
  prototype.attachStepperToView = typedAttach;

  const legacyUpdateAllMarkdownViews = prototype.updateAllMarkdownViews;
  if (legacyUpdateAllMarkdownViews) {
    prototype.updateAllMarkdownViews = function (this: ProductionPlugin): void {
      const coordinator = getSessionCoordinator(this);
      const leaves = this.app?.workspace?.getLeavesOfType?.('markdown') ?? [];
      const mountedViews = new Set<object>();
      leaves.forEach((leaf) => {
        if (leaf?.view && typeof leaf.view === 'object') mountedViews.add(leaf.view);
      });
      coordinator.disposeUnmounted(mountedViews);

      leaves.forEach((leaf) => {
        const view = leaf?.view;
        if (!view || typeof view !== 'object') return;
        const renderSignature = buildViewRenderSignature(this, view);
        if (canReuseRenderedSession(coordinator.get(view), renderSignature)) return;
        void prototype.attachStepperToView?.call(this, view);
      });
    };
  }

  const legacyUnload = prototype.onunload;
  prototype.onunload = function (this: ProductionPlugin): void {
    this.sessionCoordinator?.disposeAll();
    this.sessionCoordinator = undefined;
    this.fileChapterSnapshots?.clear();
    legacyUnload?.call(this);
  };
}

installTypedProductionSessions();

LegacyPlugin.ChapterParser = ChapterParser;
LegacyPlugin.SoundEngine = SoundEngine;
LegacyPlugin.updateHierarchyFolding = updateHierarchyFolding;

const PublicPlugin = LegacyPlugin as typeof LegacyPlugin & Record<string, unknown>;
PublicPlugin.ReadingStorage = ReadingStorage;
PublicPlugin.ReadingViewTracker = ReadingViewTracker;
PublicPlugin.LivePreviewTracker = LivePreviewTracker;
PublicPlugin.ViewSession = ViewSession;
PublicPlugin.SessionCoordinator = SessionCoordinator;
PublicPlugin.StepperView = StepperView;
PublicPlugin.TooltipManager = TooltipManager;
PublicPlugin.TypedChapterSuggestModal = TypedChapterSuggestModal;
PublicPlugin.TypedChapterPipelineSettingTab = TypedChapterPipelineSettingTab;
PublicPlugin.createChapterIdentity = createChapterIdentity;
PublicPlugin.createChapterMarkerKey = createChapterMarkerKey;
PublicPlugin.resolveChapterIdentity = resolveChapterIdentity;
PublicPlugin.normalizeChapterIdentity = normalizeChapterIdentity;

export = LegacyPlugin;
