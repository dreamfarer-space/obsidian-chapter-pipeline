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

// The legacy class remains a temporary compatibility base for product/UI
// behavior. Typed production lifecycle now uses normal subclass overrides
// instead of mutating that base prototype for session ownership.
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Keep the legacy coordinator as the CommonJS compatibility base until its migration is complete.
const LegacyPlugin = require('./legacy-main.js') as {
  new (...args: unknown[]): ProductionPlugin;
  prototype: ProductionPlugin & {
    attachStepperToView?: (view: object) => Promise<LegacyRenderResult | undefined | void>;
    onunload?: () => void;
  };
};

applyRuntimePerformancePatches(LegacyPlugin as never);
installReadingIdentityPersistence(LegacyPlugin as never);

const legacyAttach = LegacyPlugin.prototype.attachStepperToView;
const legacyUnload = LegacyPlugin.prototype.onunload;

function getSessionCoordinator(plugin: ProductionPlugin): SessionCoordinator<object, ViewSession> {
  plugin.sessionCoordinator ??= new SessionCoordinator<object, ViewSession>();
  return plugin.sessionCoordinator;
}

/** Typed production subclass layered over the shrinking legacy compatibility base. */
class TypedProductionPlugin extends LegacyPlugin {
  /** Attach one generation-guarded typed session after compatibility rendering finishes. */
  async attachStepperToView(view: object): Promise<void> {
    if (!legacyAttach) return;

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
      progressIndicator: railIndicator,
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
  }

  /** Refresh only views whose structural signature or mounted resources changed. */
  updateAllMarkdownViews(): void {
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
      void this.attachStepperToView(view);
    });
  }

  /** Dispose typed session resources before delegating to the compatibility base unload. */
  onunload(): void {
    this.sessionCoordinator?.disposeAll();
    this.sessionCoordinator = undefined;
    this.fileChapterSnapshots?.clear();
    legacyUnload?.call(this);
  }
}

const PublicPlugin = TypedProductionPlugin as typeof TypedProductionPlugin & Record<string, unknown>;
PublicPlugin.ChapterParser = ChapterParser;
PublicPlugin.SoundEngine = SoundEngine;
PublicPlugin.updateHierarchyFolding = updateHierarchyFolding;
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

export = TypedProductionPlugin;
