import { DOM_CLASSES } from '../constants';
import type { ChapterNode, HierarchyMode } from '../types';

interface HierarchyElement {
  classList: {
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
  };
  setAttribute: (name: string, value: string) => void;
}

/** Apply hierarchy visibility while keeping keyboard focus and ARIA state in sync. */
export function updateHierarchyFolding(
  chapters: ChapterNode[],
  dashElements: HierarchyElement[],
  activeIdx: number,
  hierarchyMode: HierarchyMode | string = 'all',
  keyboardExpanded = false
): void {
  if (!chapters || !dashElements?.length) return;

  const setCollapsed = (element: HierarchyElement, collapsed: boolean): void => {
    if (collapsed) {
      element.classList.add(DOM_CLASSES.collapsed);
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-hidden', 'true');
    } else {
      element.classList.remove(DOM_CLASSES.collapsed);
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-hidden', 'false');
    }
  };

  if (hierarchyMode === 'all') {
    dashElements.forEach((element) => setCollapsed(element, false));
    return;
  }

  if (hierarchyMode === 'hover-expand') {
    dashElements.forEach((element, index) => {
      const isDeepHeading = chapters[index]?.level >= 3;
      setCollapsed(element, isDeepHeading && !keyboardExpanded);
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
    const collapsed = chapter?.level >= 3 && !(index >= branchStart && index < branchEnd);
    setCollapsed(element, collapsed);
  });
}

export interface StepperOptions {
  container: HTMLElement;
  chapters: ChapterNode[];
  onSelect: (chapter: ChapterNode) => void;
  hierarchyMode?: HierarchyMode;
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
  private activeIndex = -1;
  private hierarchyMode: HierarchyMode;
  private keyboardExpanded = false;

  private readonly handleFocusIn = (): void => {
    if (this.hierarchyMode !== 'hover-expand' || this.keyboardExpanded) return;
    this.keyboardExpanded = true;
    this.syncHierarchy();
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (this.hierarchyMode !== 'hover-expand' || !this.keyboardExpanded) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && this.element.contains?.(nextTarget as Node)) return;
    this.keyboardExpanded = false;
    this.syncHierarchy();
  };

  constructor(options: StepperOptions) {
    this.options = options;
    this.adopted = Boolean(options.existingElement);
    this.hierarchyMode = options.hierarchyMode ?? 'all';
    this.element = options.existingElement ?? document.createElement('nav');

    if (this.adopted) {
      this.dashElements.push(...(options.existingDashes ?? []));
    } else {
      this.element.className = DOM_CLASSES.stepper;
      this.element.setAttribute('aria-label', 'Chapter navigation');
      this.render();
    }

    this.element.addEventListener('focusin', this.handleFocusIn);
    this.element.addEventListener('focusout', this.handleFocusOut);
    this.syncHierarchy();
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
    this.activeIndex = index;
    if (this.hierarchyMode !== mode) {
      this.hierarchyMode = mode;
      this.keyboardExpanded = false;
    }
    this.syncHierarchy();
  }

  private syncHierarchy(): void {
    const focusMode = this.hierarchyMode === 'hover-expand';
    if (focusMode) {
      // The rail itself is the keyboard entry point. Focusing it expands H3+
      // before focus advances into those descendants, including documents that
      // contain only deep headings.
      this.element.setAttribute('tabindex', '0');
      this.element.setAttribute('aria-expanded', this.keyboardExpanded ? 'true' : 'false');
      if (this.keyboardExpanded) this.element.classList.add('is-keyboard-expanded');
      else this.element.classList.remove('is-keyboard-expanded');
    } else {
      this.element.removeAttribute?.('tabindex');
      this.element.removeAttribute?.('aria-expanded');
      this.element.classList.remove('is-keyboard-expanded');
    }

    updateHierarchyFolding(
      this.options.chapters,
      this.dashElements,
      this.activeIndex,
      this.hierarchyMode,
      this.keyboardExpanded
    );
  }

  dispose(): void {
    this.element.removeEventListener('focusin', this.handleFocusIn);
    this.element.removeEventListener('focusout', this.handleFocusOut);
    this.dashElements.length = 0;
    this.element.remove();
  }
}

export default StepperView;
