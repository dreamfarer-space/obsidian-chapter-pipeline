import type { ChapterNode } from '../types';

export interface ReadingTrackerOptions {
  container: HTMLElement;
  findHeadings: (chapter: ChapterNode) => Element | null;
  onActiveChapter: (index: number) => void;
  onScrollTick?: () => void;
  /** Return false when this Markdown view is not the active pane. */
  shouldTrack?: () => boolean;
  /** Set false when an existing renderer already established the initial UI state. */
  trackImmediately?: boolean;
}

/** Reading View tracker with one passive listener and rAF coalescing. */
export class ReadingViewTracker {
  private readonly options: ReadingTrackerOptions;
  private frame: number | null = null;
  private disposed = false;
  private lastScrollTop = -1;
  private lastActiveIndex = -1;
  private chapters: ChapterNode[] = [];
  private headingCache: Array<Element | null | undefined> = [];

  constructor(options: ReadingTrackerOptions) {
    this.options = options;
    this.options.container.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  setChapters(chapters: ChapterNode[]): void {
    this.chapters = chapters;
    this.headingCache = new Array<Element | null | undefined>(chapters.length);
    this.lastActiveIndex = -1;
    if (this.options.trackImmediately !== false) this.schedule();
  }

  private canTrack(): boolean {
    return this.options.shouldTrack?.() !== false;
  }

  private readonly handleScroll = (): void => {
    if (this.disposed || !this.canTrack()) return;
    const top = this.options.container.scrollTop;
    if (Math.abs(top - this.lastScrollTop) < 1) return;
    this.lastScrollTop = top;
    this.schedule();
  };

  private schedule(): void {
    if (this.frame !== null || this.disposed || !this.canTrack()) return;
    let executedSynchronously = false;
    const frame = window.requestAnimationFrame(() => {
      executedSynchronously = true;
      this.frame = null;
      if (this.canTrack()) this.update();
    });
    this.frame = executedSynchronously ? null : frame;
  }

  private resolveHeading(index: number): Element | null {
    const cached = this.headingCache[index];
    if (cached && cached.isConnected !== false) return cached;

    const chapter = this.chapters[index];
    if (!chapter) return null;
    const heading = this.options.findHeadings(chapter);
    this.headingCache[index] = heading;
    return heading;
  }

  private headingTop(index: number): number | null {
    const heading = this.resolveHeading(index);
    if (!heading) return null;
    const top = heading.getBoundingClientRect().top;
    return Number.isFinite(top) ? top : null;
  }

  private scanFromStart(baseline: number): number {
    let active = -1;
    for (let index = 0; index < this.chapters.length; index += 1) {
      const top = this.headingTop(index);
      if (top === null) continue;
      if (top <= baseline) active = index;
      else break;
    }
    // Before the first heading reaches the baseline, the document is still in
    // the first chapter rather than in a synthetic "no active chapter" state.
    return active >= 0 ? active : (this.chapters.length > 0 ? 0 : -1);
  }

  private findActiveIndex(baseline: number): number {
    if (this.lastActiveIndex < 0 || this.lastActiveIndex >= this.chapters.length) {
      return this.scanFromStart(baseline);
    }

    const currentTop = this.headingTop(this.lastActiveIndex);
    if (currentTop === null) return this.scanFromStart(baseline);

    if (currentTop <= baseline) {
      let active = this.lastActiveIndex;
      for (let index = this.lastActiveIndex + 1; index < this.chapters.length; index += 1) {
        const top = this.headingTop(index);
        if (top === null) continue;
        if (top <= baseline) active = index;
        else break;
      }
      return active;
    }

    for (let index = this.lastActiveIndex - 1; index >= 0; index -= 1) {
      const top = this.headingTop(index);
      if (top !== null && top <= baseline) return index;
    }
    return this.chapters.length > 0 ? 0 : -1;
  }

  private update(): void {
    const baseline = this.options.container.getBoundingClientRect().top + 70;
    const active = this.findActiveIndex(baseline);
    if (active >= 0 && active !== this.lastActiveIndex) {
      this.lastActiveIndex = active;
      this.options.onActiveChapter(active);
    }
    this.options.onScrollTick?.();
  }

  dispose(): void {
    this.disposed = true;
    this.options.container.removeEventListener('scroll', this.handleScroll);
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.headingCache = [];
  }
}

export default ReadingViewTracker;
