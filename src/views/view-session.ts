import type { ChapterNode, HierarchyMode } from '../types';
import { StepperView } from '../ui/stepper';
import { TooltipManager } from '../ui/tooltip';
import { LivePreviewTracker } from './live-preview-tracker';
import { ReadingViewTracker } from './reading-view-tracker';

export type ViewSessionMode = 'reading' | 'live-preview';
export type ViewSessionTracker = ReadingViewTracker | LivePreviewTracker;

export interface ViewSessionOptions {
  view: unknown;
  mode: ViewSessionMode;
  container: HTMLElement;
  chapters: ChapterNode[];
  stepperElement: HTMLElement;
  dashElements: HTMLElement[];
  tooltipElement?: HTMLElement | null;
  hierarchyMode?: HierarchyMode;
  findReadingHeading?: (chapter: ChapterNode) => Element | null;
  onSelectChapter: (chapter: ChapterNode) => void;
  onActiveChapter: (index: number, previousIndex: number) => void;
  onScrollTick?: () => void;
  /** Disable the first geometry pass when adopting UI already initialized by a compatibility renderer. */
  trackImmediately?: boolean;
}

/**
 * Owns all per-MarkdownView production resources that should disappear together.
 * The legacy coordinator may still build the current DOM while migration is in
 * progress, but the typed session is the production owner of tracking and UI
 * lifetime.
 */
export class ViewSession {
  readonly view: unknown;
  readonly mode: ViewSessionMode;
  readonly stepper: StepperView;
  readonly tooltip: TooltipManager | null;
  readonly tracker: ViewSessionTracker;

  private chapters: ChapterNode[];
  private activeIndex = -1;
  private disposed = false;

  constructor(private readonly options: ViewSessionOptions) {
    this.view = options.view;
    this.mode = options.mode;
    this.chapters = options.chapters;

    this.stepper = new StepperView({
      container: options.container,
      chapters: this.chapters,
      onSelect: options.onSelectChapter,
      existingElement: options.stepperElement,
      existingDashes: options.dashElements,
    });

    this.tooltip = options.tooltipElement
      ? new TooltipManager(options.container, { existingTooltip: options.tooltipElement })
      : null;

    const handleActiveChapter = (index: number): void => {
      if (this.disposed || index < 0 || index >= this.chapters.length) return;
      const previousIndex = this.activeIndex;
      this.activeIndex = index;
      this.stepper.setActive(index, options.hierarchyMode ?? 'all');
      options.onActiveChapter(index, previousIndex);
    };

    if (options.mode === 'reading') {
      if (!options.findReadingHeading) {
        throw new Error('Reading ViewSession requires findReadingHeading');
      }
      this.tracker = new ReadingViewTracker({
        container: options.container,
        findHeadings: options.findReadingHeading,
        onActiveChapter: handleActiveChapter,
        onScrollTick: options.onScrollTick,
        trackImmediately: options.trackImmediately,
      });
    } else {
      this.tracker = new LivePreviewTracker({
        container: options.container,
        onActiveChapter: handleActiveChapter,
        trackImmediately: options.trackImmediately,
      });
    }

    this.tracker.setChapters(this.chapters);
  }

  getChapters(): readonly ChapterNode[] {
    return this.chapters;
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.tracker.dispose();
    this.tooltip?.dispose();
    this.stepper.dispose();
    this.chapters = [];
  }
}

export default ViewSession;
