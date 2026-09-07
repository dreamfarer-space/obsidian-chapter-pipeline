import { DOM_CLASSES } from '../constants';
import type { ChapterNode } from '../types';

export interface TooltipPosition {
  top: number;
  left: number;
}

/** Keep a tooltip's center inside the viewport with a small breathing margin. */
export function clampTooltipPosition(
  anchor: DOMRect,
  tooltip: DOMRect,
  viewport: { width: number; height: number },
  gap = 12
): TooltipPosition {
  const idealTop = anchor.top + (anchor.height / 2) - (tooltip.height / 2);
  const idealLeft = anchor.right + gap;
  const top = Math.min(Math.max(gap, idealTop), Math.max(gap, viewport.height - tooltip.height - gap));
  const left = idealLeft + tooltip.width <= viewport.width
    ? idealLeft
    : Math.max(gap, anchor.left - tooltip.width - gap);
  return { top, left };
}

/** Per-view tooltip owner. A view owns exactly one node and can dispose safely. */
export class TooltipManager {
  private readonly tooltip: HTMLElement;
  private disposed = false;

  constructor(private readonly owner: HTMLElement) {
    this.tooltip = document.createElement('div');
    this.tooltip.className = DOM_CLASSES.tooltip;
    this.tooltip.hidden = true;
    owner.ownerDocument.body.append(this.tooltip);
  }

  show(chapter: ChapterNode, anchor: HTMLElement): void {
    if (this.disposed) return;
    this.tooltip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = chapter.title;
    this.tooltip.append(title);
    if (chapter.summaryMarkdown) {
      const summary = document.createElement('div');
      summary.textContent = chapter.summaryMarkdown;
      this.tooltip.append(summary);
    }
    this.tooltip.hidden = false;
    const position = clampTooltipPosition(
      anchor.getBoundingClientRect(),
      this.tooltip.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight }
    );
    this.tooltip.style.top = `${position.top}px`;
    this.tooltip.style.left = `${position.left}px`;
  }

  hide(): void {
    if (!this.disposed) this.tooltip.hidden = true;
  }

  dispose(): void {
    this.disposed = true;
    this.tooltip.remove();
  }
}

export default TooltipManager;
