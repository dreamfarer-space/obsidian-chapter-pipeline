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
  hierarchyMode: HierarchyMode = 'all',
  keyboardExpanded = false,
  pointerExpanded = false
): void {
  if (!chapters || !dashElements?.length) return;

  const setReachable = (element: HierarchyElement, reachable: boolean): void => {
    element.setAttribute('tabindex', reachable ? '0' : '-1');
    element.setAttribute('aria-hidden', reachable ? 'false' : 'true');
  };

  const setCollapsed = (element: HierarchyElement, collapsed: boolean): void => {
    if (collapsed) {
      element.classList.add(DOM_CLASSES.collapsed);
      setReachable(element, false);
    } else {
      element.classList.remove(DOM_CLASSES.collapsed);
      setReachable(element, true);
    }
  };

  if (hierarchyMode === 'all') {
    dashElements.forEach((element) => setCollapsed(element, false));
    return;
  }

  if (hierarchyMode === 'hover-expand') {
    dashElements.forEach((element, index) => {
      const isDeepHeading = chapters[index]?.level >= 3;
      if (!isDeepHeading) {
        setCollapsed(element, false);
      } else if (keyboardExpanded) {
        // Keyboard expansion must remove the collapsed class because unlike
        // pointer hover it cannot rely on the existing :hover CSS selector.
        setCollapsed(element, false);
      } else {
        // Keep the collapsed class during pointer hover so the existing hover
        // transition/opacity remains unchanged, while exposing the item to the
        // tab order and accessibility tree for the duration of that expansion.
        element.classList.add(DOM_CLASSES.collapsed);
        setReachable(element, pointerExpanded);
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
  existingProgressIndicator?: HTMLElement | null;
}

/** Minimal DOM builder used by the main plugin and embedders. */
export class StepperView {
  readonly element: HTMLElement;
  private readonly options: StepperOptions;
  private readonly dashElements: HTMLElement[] = [];
  private readonly progressIndicator: HTMLElement | null;
  private readonly adopted: boolean;
  private activeIndex = -1;
  private hierarchyMode: HierarchyMode;
  private keyboardExpanded = false;
  private pointerExpanded = false;

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

  private readonly handlePointerOver = (): void => {
    if (this.hierarchyMode !== 'hover-expand' || this.pointerExpanded) return;
    this.pointerExpanded = true;
    this.syncHierarchy();
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    if (this.hierarchyMode !== 'hover-expand' || !this.pointerExpanded) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && this.element.contains?.(nextTarget as Node)) return;
    this.pointerExpanded = false;
    this.syncHierarchy();
  };

  constructor(options: StepperOptions) {
    this.options = options;
    this.adopted = Boolean(options.existingElement);
    this.hierarchyMode = options.hierarchyMode ?? 'all';
    this.element = options.existingElement ?? createEl('nav');
    this.progressIndicator = options.existingProgressIndicator ?? null;

    if (this.adopted) {
      this.dashElements.push(...(options.existingDashes ?? []));
    } else {
      this.element.className = DOM_CLASSES.stepper;
      this.element.setAttribute('aria-label', 'Chapter navigation');
      this.render();
    }

    this.element.addEventListener('focusin', this.handleFocusIn);
    this.element.addEventListener('focusout', this.handleFocusOut);
    this.element.addEventListener('pointerover', this.handlePointerOver);
    this.element.addEventListener('pointerout', this.handlePointerOut);
    this.syncHierarchy();
  }

  render(): void {
    if (this.adopted) return;
    this.element.replaceChildren();
    this.dashElements.length = 0;
    for (const chapter of this.options.chapters) {
      const dash = createEl('button');
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
    this.dashElements.forEach((element, elementIndex) => {
      if (elementIndex === index) element.classList.add('active');
      else element.classList.remove('active');
    });
    this.syncProgress();
    if (this.hierarchyMode !== mode) {
      this.hierarchyMode = mode;
      this.keyboardExpanded = false;
      this.pointerExpanded = false;
    }
    this.syncHierarchy();
  }

  private syncProgress(): void {
    if (!this.progressIndicator) return;
    let height: string;
    if (this.options.chapters.length <= 1) {
      height = `${100}%`;
    } else if (this.activeIndex < 0 || this.activeIndex >= this.options.chapters.length) {
      height = `${0}%`;
    } else {
      const activeItem = this.dashElements[this.activeIndex];
      const offsetTop = Number(activeItem?.offsetTop) || 0;
      const offsetHeight = Number(activeItem?.offsetHeight) || 10;
      height = offsetTop > 0
        ? `${offsetTop + (offsetHeight / 2)}px`
        : `${Math.round((this.activeIndex / (this.options.chapters.length - 1)) * 100)}%`;
    }
    this.progressIndicator.style.height = height;
  }

  private syncHierarchy(): void {
    const focusMode = this.hierarchyMode === 'hover-expand';
    if (focusMode) {
      // The rail itself is the keyboard entry point. Focusing it expands H3+
      // before focus advances into those descendants, including documents that
      // contain only deep headings.
      const expanded = this.keyboardExpanded || this.pointerExpanded;
      this.element.setAttribute('tabindex', '0');
      this.element.setAttribute('aria-expanded', expanded ? 'true' : 'false');
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
      this.keyboardExpanded,
      this.pointerExpanded
    );
  }

  dispose(): void {
    this.element.removeEventListener('focusin', this.handleFocusIn);
    this.element.removeEventListener('focusout', this.handleFocusOut);
    this.element.removeEventListener('pointerover', this.handlePointerOver);
    this.element.removeEventListener('pointerout', this.handlePointerOut);
    this.dashElements.length = 0;
    this.element.remove();
  }
}

export default StepperView;
