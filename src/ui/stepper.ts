import { DOM_CLASSES } from '../constants';
import type { ChapterNode, HierarchyMode } from '../types';

/** Apply hierarchy visibility while keeping keyboard focus targets in sync. */
export function updateHierarchyFolding(
  chapters: ChapterNode[],
  dashElements: Array<{ classList: { add: (...names: string[]) => void; remove: (...names: string[]) => void }; setAttribute: (name: string, value: string) => void }>,
  activeIdx: number,
  hierarchyMode: HierarchyMode | string = 'all'
): void {
  if (!chapters || !dashElements?.length) return;
  if (hierarchyMode === 'all') {
    dashElements.forEach((element) => {
      element.classList.remove(DOM_CLASSES.collapsed);
      element.setAttribute('tabindex', '0');
    });
    return;
  }
  if (hierarchyMode === 'hover-expand') {
    dashElements.forEach((element, index) => {
      if (chapters[index]?.level >= 3) {
        element.classList.add(DOM_CLASSES.collapsed);
        element.setAttribute('tabindex', '-1');
      } else {
        element.classList.remove(DOM_CLASSES.collapsed);
        element.setAttribute('tabindex', '0');
      }
    });
    return;
  }
  if (hierarchyMode !== 'active-branch') return;

  let branchStart = -1;
  let branchEnd = -1;
  if (activeIdx >= 0 && activeIdx < chapters.length) {
    let parentIdx = activeIdx;
    while (parentIdx >= 0 && chapters[parentIdx].level > 2) parentIdx -= 1;
    if (parentIdx >= 0) {
      branchStart = parentIdx + 1;
      branchEnd = chapters.length;
      for (let index = parentIdx + 1; index < chapters.length; index += 1) {
        if (chapters[index].level <= 2) {
          branchEnd = index;
          break;
        }
      }
    } else {
      branchStart = 0;
      branchEnd = chapters.findIndex((chapter) => chapter.level <= 2);
      if (branchEnd < 0) branchEnd = chapters.length;
    }
  }

  dashElements.forEach((element, index) => {
    const chapter = chapters[index];
    if (chapter?.level >= 3 && !(index >= branchStart && index < branchEnd)) {
      element.classList.add(DOM_CLASSES.collapsed);
      element.setAttribute('tabindex', '-1');
    } else {
      element.classList.remove(DOM_CLASSES.collapsed);
      element.setAttribute('tabindex', '0');
    }
  });
}

export interface StepperOptions {
  container: HTMLElement;
  chapters: ChapterNode[];
  onSelect: (chapter: ChapterNode) => void;
  /** Existing production DOM to adopt during the legacy-to-typed migration. */
  existingElement?: HTMLElement;
  existingDashes?: HTMLElement[];
}

/** Minimal DOM builder used by the main plugin and embedders. */
export class StepperView {
  readonly element: HTMLElement;
  private readonly options: StepperOptions;
  private readonly dashElements: HTMLElement[] = [];
  private readonly adopted: boolean;

  constructor(options: StepperOptions) {
    this.options = options;
    this.adopted = Boolean(options.existingElement);
    this.element = options.existingElement ?? document.createElement('nav');

    if (this.adopted) {
      this.dashElements.push(...(options.existingDashes ?? []));
      return;
    }

    this.element.className = DOM_CLASSES.stepper;
    this.element.setAttribute('aria-label', 'Chapter navigation');
    this.render();
  }

  render(): void {
    if (this.adopted) return;
    this.element.replaceChildren();
    this.dashElements.length = 0;
    for (const chapter of this.options.chapters) {
      const dash = document.createElement('button');
      dash.type = 'button';
      dash.className = `${DOM_CLASSES.dash} level-${Math.min(6, Math.max(1, chapter.level))}`;
      dash.setAttribute('aria-label', `Chapter: ${chapter.title}`);
      dash.addEventListener('click', () => this.options.onSelect(chapter));
      this.element.append(dash);
      this.dashElements.push(dash);
    }
  }

  setActive(index: number, mode: HierarchyMode = 'all'): void {
    updateHierarchyFolding(this.options.chapters, this.dashElements, index, mode);
  }

  dispose(): void {
    this.dashElements.length = 0;
    this.element.remove();
  }
}

export default StepperView;
