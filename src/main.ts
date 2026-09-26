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
import type { WorkspaceLeaf, MarkdownView, TFile } from 'obsidian';
import type { ChapterNode, LegacyRenderResult } from './types';

/**
 * Typed production entry point owning view session lifecycles via standard
 * TypeScript class inheritance without CommonJS coordinator bridges or prototype monkey-patching.
 */
class TypedProductionPlugin extends ReadingPersistencePlugin {
  sessionCoordinator?: SessionCoordinator<object, ViewSession>;

  /** Lazily initialize and return the session coordinator with unmount and tooltip cleanup. */
  private getSessionCoordinator(): SessionCoordinator<object, ViewSession> {
    this.sessionCoordinator ??= new SessionCoordinator<object, ViewSession>((view) => {
      this.disconnectReadingHeadingObserver(view);
      this.cleanupViewTooltip?.(view);
    });
    return this.sessionCoordinator;
  }

  /** Attach one generation-guarded typed session after compatibility rendering finishes. */
  override async attachStepperToView(
    view: MarkdownView | (object & { file?: TFile; contentEl?: HTMLElement })
  ): Promise<LegacyRenderResult | undefined> {
    const coordinator = this.getSessionCoordinator();
    const sessionGeneration = coordinator.begin(view);

    const rendered = await super.attachStepperToView(view);
    if (!coordinator.isCurrent(view, sessionGeneration) || !rendered) return rendered;

    const typedView = view as { contentEl?: HTMLElement; file?: unknown };
    const container = rendered.hostContainer;
    if (!typedView.file || typeof typedView.file !== 'object' || typedView.contentEl !== container) return rendered;

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
    if (!chapters.length || !scroller) return rendered;

    releaseLegacyScrollTracking();

    const hierarchyMode = this.settings?.hierarchyMode ?? 'all';
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
      findReadingHeading: mode === 'reading' && typeof this.getReadingHeading === 'function'
        ? (chapter: ChapterNode): Element | null => this.getReadingHeading(view, chapter) ?? null
        : undefined,
      onSelectChapter: (chapter: ChapterNode): void => {
        this.jumpToHeading(view, chapter);
      },
      onActiveChapter: (index, previousIndex) => {
        if (previousIndex >= 0 && previousIndex !== index) {
          const volume = typeof this.settings?.soundVolume === 'number' ? this.settings.soundVolume : 50;
          this.soundEngine?.playScrollTick?.(volume);
          this.recordReadingPosition?.(view, chapters[index]);
        }
      },
    });

    const markdownLeaves = this.app?.workspace?.getLeavesOfType?.('markdown');
    const isMounted = markdownLeaves === undefined || markdownLeaves.some((leaf: WorkspaceLeaf) => leaf?.view === view);
    if (typedView.contentEl !== container || !isMounted) {
      coordinator.detach(view);
      session.dispose();
      return rendered;
    }
    coordinator.adopt(view, sessionGeneration, session);
    return rendered;
  }

  /** Read all chapters through the typed base while keeping identity snapshots in typed ownership. */
  override async getAllChaptersForView(view?: MarkdownView | (object & { file?: TFile }) | null): Promise<ChapterNode[]> {
    const chapters = await super.getAllChaptersForView(view);
    const filePath = (view as { file?: { path?: string } })?.file?.path;
    if (filePath && chapters.length) rememberFileChapterSnapshot(this, filePath, chapters);
    return chapters;
  }

  /** Refresh only views whose structural signature or mounted resources changed. */
  override updateAllMarkdownViews(): void {
    const coordinator = this.getSessionCoordinator();
    const leaves = this.app?.workspace?.getLeavesOfType?.('markdown') ?? [];
    const mountedViews = new Set<object>();
    leaves.forEach((leaf: WorkspaceLeaf) => {
      const view = leaf?.view as { file?: { path?: unknown } } | undefined;
      if (view && typeof view === 'object' && view.file && typeof view.file === 'object' && typeof view.file.path === 'string') {
        mountedViews.add(view);
      }
    });
    coordinator.disposeUnmounted(mountedViews);

    leaves.forEach((leaf: WorkspaceLeaf) => {
      const view = leaf?.view as (MarkdownView | (object & { file?: TFile; contentEl?: HTMLElement })) | undefined;
      if (!view || typeof view !== 'object' || !view.file || typeof view.file !== 'object' || typeof (view.file as { path?: unknown }).path !== 'string') {
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
PublicPlugin.updateHierarchyFolding = updateHierarchyFolding as unknown as typeof ChapterPipelineCoordinator.updateHierarchyFolding;
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
