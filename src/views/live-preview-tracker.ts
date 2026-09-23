import type { ChapterNode } from '../types';

export interface LivePreviewTrackerOptions {
  container: HTMLElement;
  onActiveChapter: (index: number) => void;
  /** Prefer a CodeMirror-derived document line when the owning view exposes one. */
  getViewportLine?: () => number | null;
  /** Return false when this Markdown view is not the active pane. */
  shouldTrack?: () => boolean;
  /** Set false when an existing renderer already established the initial UI state. */
  trackImmediately?: boolean;
}

interface RenderedLineAnchor {
  element: Element;
  line: number;
}

interface ChapterLineEntry {
  line: number;
  chapterIndex: number;
}

const CANDIDATE_SELECTOR = '.cm-line, .cm-heading';
const CANDIDATE_CLASS_PATTERN = /(^|\s)(cm-line|cm-heading)(\s|$)/;

/**
 * CodeMirror 6 tracker. The editor viewport line is authoritative when it can
 * be read; rendered rows are only viewport-local fallback anchors. Active
 * chapter state is always resolved against the full parsed chapter list.
 * Geometry is read only inside a scheduled animation frame.
 */
export class LivePreviewTracker {
  private readonly options: LivePreviewTrackerOptions;
  private chapters: ChapterNode[] = [];
  private chapterLineOrder: ChapterLineEntry[] = [];
  private renderedLines: RenderedLineAnchor[] = [];
  private candidatesDirty = true;
  private frame: number | null = null;
  private disposed = false;
  private lastActiveIndex = -1;
  private readonly observer: MutationObserver | null;

  constructor(options: LivePreviewTrackerOptions) {
    this.options = options;
    this.options.container.addEventListener('scroll', this.schedule, { passive: true });

    this.observer = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
        let shouldSchedule = false;
        let shouldRefreshCandidates = false;

        for (const record of records) {
          const impact = this.getMutationImpact(record);
          if (impact === 'refresh') {
            shouldSchedule = true;
            shouldRefreshCandidates = true;
            break;
          }
          if (impact === 'layout') shouldSchedule = true;
        }

        if (!shouldSchedule) return;
        if (shouldRefreshCandidates) this.candidatesDirty = true;
        if (this.canTrack()) this.schedule();
      });
    this.observer?.observe(this.options.container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'data-line'],
    });
  }

  /** Replace the authoritative chapter sequence and reset viewport-derived state. */
  setChapters(chapters: ChapterNode[]): void {
    this.chapters = chapters;
    this.chapterLineOrder = chapters
      .map((chapter, chapterIndex) => ({ line: chapter.line, chapterIndex }))
      .filter((entry) => Number.isInteger(entry.line))
      .sort((left, right) => left.line - right.line || left.chapterIndex - right.chapterIndex);
    this.renderedLines = [];
    this.candidatesDirty = true;
    this.lastActiveIndex = -1;
    if (this.options.trackImmediately !== false) this.schedule();
  }

  private canTrack(): boolean {
    return this.options.shouldTrack?.() !== false;
  }

  private readonly schedule = (): void => {
    if (this.frame !== null || this.disposed || !this.canTrack()) return;
    let executedSynchronously = false;
    const frame = requestAnimationFrame(() => {
      executedSynchronously = true;
      this.frame = null;
      if (this.canTrack()) this.update();
    });
    this.frame = executedSynchronously ? null : frame;
  };

  private isCandidateElement(value: unknown): boolean {
    if (!value || typeof (value as Element).matches !== 'function') return false;
    return (value as Element).matches(CANDIDATE_SELECTOR);
  }

  private containsCandidate(value: unknown): boolean {
    if (!value) return false;
    const node = value as Element;
    if (typeof node.matches === 'function' && node.matches(CANDIDATE_SELECTOR)) return true;
    return typeof node.querySelector === 'function' && Boolean(node.querySelector(CANDIDATE_SELECTOR));
  }

  private isInsideCandidate(value: unknown): boolean {
    if (!value) return false;
    const node = value as Element;
    if (this.isCandidateElement(node)) return true;
    return typeof node.closest === 'function' && Boolean(node.closest(CANDIDATE_SELECTOR));
  }

  private getMutationImpact(record: MutationRecord): 'none' | 'layout' | 'refresh' {
    if (record.type === 'attributes') {
      if (record.attributeName === 'data-line') {
        return this.isCandidateElement(record.target) ? 'refresh' : 'none';
      }

      if (record.attributeName === 'class') {
        const wasCandidate = CANDIDATE_CLASS_PATTERN.test(record.oldValue || '');
        return this.isCandidateElement(record.target) || wasCandidate ? 'refresh' : 'none';
      }

      return 'none';
    }

    if (record.type !== 'childList') return 'none';

    for (const node of Array.from(record.addedNodes)) {
      if (this.containsCandidate(node)) return 'refresh';
    }
    for (const node of Array.from(record.removedNodes)) {
      if (this.containsCandidate(node)) return 'refresh';
    }

    return this.isInsideCandidate(record.target) ? 'layout' : 'none';
  }

  /** Refresh the cached viewport-local line anchors after relevant DOM mutations. */
  private refreshCandidates(): void {
    if (!this.candidatesDirty) return;

    const next: RenderedLineAnchor[] = [];
    const seen = new Set<number>();
    const rendered = this.options.container.querySelectorAll(CANDIDATE_SELECTOR);
    for (const element of rendered) {
      const line = Number(element.getAttribute('data-line'));
      if (!Number.isInteger(line) || seen.has(line)) continue;
      seen.add(line);
      next.push({ element, line });
    }

    next.sort((left, right) => left.line - right.line);
    this.renderedLines = next;
    this.candidatesDirty = false;
  }

  /** Infer the document line intersecting the active baseline from rendered anchors. */
  private findDocumentLineAtBaseline(baseline: number): number | null {
    if (this.renderedLines.length === 0) return null;

    let low = 0;
    let high = this.renderedLines.length - 1;
    let active = -1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const top = this.renderedLines[mid].element.getBoundingClientRect().top;
      if (top <= baseline) {
        active = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // When the baseline is above the first rendered row, that row still gives
    // us the viewport's document position. Mapping that line into chapters is
    // more accurate than jumping to the first visible heading.
    return this.renderedLines[Math.max(0, active)].line;
  }

  /** Resolve a document line to the latest chapter starting at or before it. */
  private findChapterAtLine(line: number): number {
    let low = 0;
    let high = this.chapterLineOrder.length - 1;
    let active = -1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (this.chapterLineOrder[mid].line <= line) {
        active = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return active < 0 ? -1 : this.chapterLineOrder[active].chapterIndex;
  }

  /** Prefer the editor viewport line, falling back to rendered DOM anchors. */
  private getDocumentLine(baseline: number): number | null {
    const viewportLine = this.options.getViewportLine?.();
    if (typeof viewportLine === 'number' && Number.isInteger(viewportLine) && viewportLine >= 0) {
      return viewportLine;
    }

    this.refreshCandidates();
    return this.findDocumentLineAtBaseline(baseline);
  }

  /** Recompute active chapter state for the current animation frame. */
  private update(): void {
    if (this.chapterLineOrder.length === 0) return;

    const baseline = this.options.container.getBoundingClientRect().top + 70;
    const documentLine = this.getDocumentLine(baseline);
    if (documentLine === null) return;

    const activeIndex = this.findChapterAtLine(documentLine);
    if (activeIndex < 0 || activeIndex === this.lastActiveIndex) return;
    this.lastActiveIndex = activeIndex;
    this.options.onActiveChapter(activeIndex);
  }

  /** Stop tracking and release observer, frame, and cached anchor state. */
  dispose(): void {
    this.disposed = true;
    this.options.container.removeEventListener('scroll', this.schedule);
    this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.renderedLines = [];
    this.chapterLineOrder = [];
  }
}

export default LivePreviewTracker;
