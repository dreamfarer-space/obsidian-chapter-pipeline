import type { ChapterNode, HierarchyMode } from '../types';
import { StepperView } from '../ui/stepper';
import { TooltipManager } from '../ui/tooltip';
import { LivePreviewTracker } from './live-preview-tracker';
import { ReadingViewTracker } from './reading-view-tracker';

export type ViewSessionMode = 'reading' | 'live-preview';
export type ViewSessionTracker = ReadingViewTracker | LivePreviewTracker;

interface CodeMirrorViewLike {
  lineBlockAtHeight?: (height: number) => { from?: number } | null;
  documentTop?: number;
  scaleY?: number;
  state?: {
    doc?: {
      lineAt?: (position: number) => { number?: number } | null;
    };
  };
}

/**
 * Resolve the document line that intersects the tracker's 70px screen-space
 * baseline using CodeMirror's document-relative vertical coordinate system.
 * This stays correct when the editor has top padding or a CSS vertical scale.
 */
export function getLivePreviewViewportLine(view: unknown, container: HTMLElement): number | null {
  const host = view as {
    editor?: unknown;
    editMode?: { editor?: unknown; cm?: unknown };
  };
  const editor = host.editor as { cm?: unknown } | undefined;
  const editModeEditor = host.editMode?.editor as { cm?: unknown } | undefined;
  const candidates = [
    editor?.cm,
    editModeEditor?.cm,
    host.editMode?.cm,
    host.editor,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const cm = candidate as CodeMirrorViewLike;
    if (
      typeof cm.lineBlockAtHeight !== 'function'
      || typeof cm.state?.doc?.lineAt !== 'function'
      || typeof cm.documentTop !== 'number'
      || !Number.isFinite(cm.documentTop)
    ) {
      continue;
    }

    const screenBaseline = container.getBoundingClientRect().top + 70;
    const scaleY = typeof cm.scaleY === 'number' && Number.isFinite(cm.scaleY) && cm.scaleY > 0
      ? cm.scaleY
      : 1;
    const documentHeight = Math.max(0, (screenBaseline - cm.documentTop) / scaleY);
    const lineBlock = cm.lineBlockAtHeight(documentHeight);
    if (!lineBlock || typeof lineBlock.from !== 'number') continue;

    const line = cm.state.doc.lineAt(lineBlock.from);
    const lineNumber = line?.number;
    if (typeof lineNumber === 'number' && Number.isInteger(lineNumber) && lineNumber > 0) {
      return lineNumber - 1;
    }
  }

  return null;
}

export interface ViewSessionOptions {
  view: unknown;
  mode: ViewSessionMode;
  container: HTMLElement;
  chapters: ChapterNode[];
  stepperElement: HTMLElement;
  dashElements: HTMLElement[];
  tooltipElement?: HTMLElement | null;
  renderSignature?: string;
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
  readonly renderSignature: string;
  readonly trackingContainer: HTMLElement;

  private chapters: ChapterNode[];
  private activeIndex = -1;
  private disposed = false;

  constructor(private readonly options: ViewSessionOptions) {
    this.view = options.view;
    this.mode = options.mode;
    this.renderSignature = options.renderSignature ?? '';
    this.trackingContainer = options.container;
    this.chapters = options.chapters;

    this.stepper = new StepperView({
      container: options.container,
      chapters: this.chapters,
      onSelect: options.onSelectChapter,
      hierarchyMode: options.hierarchyMode ?? 'all',
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
        getViewportLine: () => getLivePreviewViewportLine(options.view, options.container),
        trackImmediately: options.trackImmediately,
      });
    }

    this.tracker.setChapters(this.chapters);
  }

  /** Return the immutable chapter snapshot owned by this view session. */
  getChapters(): readonly ChapterNode[] {
    return this.chapters;
  }

  /** Return the currently active chapter index, or -1 before the first update. */
  getActiveIndex(): number {
    return this.activeIndex;
  }

  /** Release the tracker, UI adapters, and chapter snapshot for this view. */
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
