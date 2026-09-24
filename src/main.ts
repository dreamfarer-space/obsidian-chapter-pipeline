import { ChapterParser } from './core/parser';
import { SoundEngine } from './core/sound';
import { ReadingStorage } from './core/storage';
import {
  createChapterIdentity,
  createChapterMarkerKey,
  normalizeChapterIdentity,
  resolveChapterIdentity
} from './core/reading-identity';
import { ChapterPipelineCoordinator } from './plugin-coordinator';
import { ReadingPersistencePlugin, rememberFileChapterSnapshot } from './reading-persistence';
import { PerformanceCoordinatorPlugin } from './runtime-performance';
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

/**
 * Typed production entry point owning view session lifecycles via standard
 * TypeScript class inheritance without CommonJS coordinator bridges or prototype monkey-patching.
 */
class TypedProductionPlugin extends ReadingPersistencePlugin {
  sessionCoordinator?: SessionCoordinator<object, ViewSession>;

  private getSessionCoordinator(): SessionCoordinator<object, ViewSession> {
    this.sessionCoordinator ??= new SessionCoordinator<object, ViewSession>((view) => {
      this.disconnectReadingHeadingObserver(view);
    });
    return this.sessionCoordinator;
  }

  /** Attach one generation-guarded typed session after compatibility rendering finishes. */
  override async attachStepperToView(view: object): Promise<void> {
    const coordinator = this.getSessionCoordinator();
    const sessionGeneration = coordinator.begin(view);

    const rendered = (await super.attachStepperToView(view)) as LegacyRenderResult | undefined | void;
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
    const filePath = (typedView.file as { path?: string }).path;
    if (filePath && chapters.length) rememberFileChapterSnapshot(this, filePath, chapters);
    if (!chapters.length || !scroller) return;

    releaseLegacyScrollTracking();

    const hierarchyMode = (this.settings?.hierarchyMode ?? 'all') as 'all' | 'hover-expand' | 'active-branch';
    const renderSignature = buildViewRenderSignature(this, view);

    let session!: ViewSession;
    session = new ViewSession({
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
      onDispose: () => {
        if (!coordinator.get(view) || coordinator.get(view) === session) {
          this.disconnectReadingHeadingObserver(view);
        }
      },
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
    const isMounted = markdownLeaves === undefined || markdownLeaves.some((leaf: any) => leaf?.view === view);
    if (typedView.contentEl !== container || !isMounted) {
      coordinator.detach(view);
      session.dispose();
      return;
    }
    coordinator.adopt(view, sessionGeneration, session);
  }

  /** Read all chapters through the typed base while keeping identity snapshots in typed ownership. */
  override async getAllChaptersForView(view: object): Promise<ChapterNode[]> {
    const chapters = (await super.getAllChaptersForView(view)) as ChapterNode[];
    const filePath = (view as { file?: { path?: string } })?.file?.path;
    if (filePath && chapters.length) rememberFileChapterSnapshot(this, filePath, chapters);
    return chapters;
  }

  /** Refresh only views whose structural signature or mounted resources changed. */
  override updateAllMarkdownViews(): void {
    const coordinator = this.getSessionCoordinator();
    const leaves = this.app?.workspace?.getLeavesOfType?.('markdown') ?? [];
    const mountedViews = new Set<object>();
    leaves.forEach((leaf: any) => {
      const view = leaf?.view as { file?: { path?: unknown } } | undefined;
      if (view && typeof view === 'object' && view.file && typeof view.file === 'object' && typeof view.file.path === 'string') {
        mountedViews.add(view);
      }
    });
    coordinator.disposeUnmounted(mountedViews);

    leaves.forEach((leaf: any) => {
      const view = leaf?.view as { file?: { path?: unknown } } | undefined;
      if (!view || typeof view !== 'object' || !view.file || typeof view.file !== 'object' || typeof view.file.path !== 'string') {
        return;
      }
      const renderSignature = buildViewRenderSignature(this, view);
      if (canReuseRenderedSession(coordinator.get(view), renderSignature)) return;
      void this.attachStepperToView(view);
    });
  }

  /** Dispose typed session resources before delegating to the base coordinator unload. */
  override onunload(): void {
    this.sessionCoordinator?.disposeAll();
    this.sessionCoordinator = undefined;
    this.fileChapterSnapshots?.clear();
    super.onunload();
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
PublicPlugin.ChapterPipelineCoordinator = ChapterPipelineCoordinator;
PublicPlugin.PerformanceCoordinatorPlugin = PerformanceCoordinatorPlugin;
PublicPlugin.ReadingPersistencePlugin = ReadingPersistencePlugin;
PublicPlugin.createChapterIdentity = createChapterIdentity;
PublicPlugin.createChapterMarkerKey = createChapterMarkerKey;
PublicPlugin.resolveChapterIdentity = resolveChapterIdentity;
PublicPlugin.normalizeChapterIdentity = normalizeChapterIdentity;

export = TypedProductionPlugin;
