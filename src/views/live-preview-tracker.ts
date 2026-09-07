import type { ChapterNode } from '../types';

export interface LivePreviewTrackerOptions {
  container: HTMLElement;
  onActiveChapter: (index: number) => void;
}

/** CodeMirror 6 tracker. It only reads geometry inside a scheduled frame. */
export class LivePreviewTracker {
  private readonly options: LivePreviewTrackerOptions;
  private chapters: ChapterNode[] = [];
  private frame: number | null = null;
  private disposed = false;

  constructor(options: LivePreviewTrackerOptions) {
    this.options = options;
    this.options.container.addEventListener('scroll', this.schedule, { passive: true });
  }

  setChapters(chapters: ChapterNode[]): void {
    this.chapters = chapters;
    this.schedule();
  }

  private readonly schedule = (): void => {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  };

  private update(): void {
    const baseline = this.options.container.getBoundingClientRect().top + 70;
    const headings = Array.from(this.options.container.querySelectorAll('.cm-line, .cm-heading'));
    let activeLine = -1;
    for (const element of headings) {
      if (element.getBoundingClientRect().top > baseline) continue;
      const line = Number(element.getAttribute('data-line'));
      if (Number.isInteger(line)) activeLine = line;
    }
    if (activeLine < 0) return;
    const index = this.chapters.findIndex((chapter) => chapter.line === activeLine);
    if (index >= 0) this.options.onActiveChapter(index);
  }

  dispose(): void {
    this.disposed = true;
    this.options.container.removeEventListener('scroll', this.schedule);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

export default LivePreviewTracker;
