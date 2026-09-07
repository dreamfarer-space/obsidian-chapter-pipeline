import { MarkdownRenderer, SuggestModal } from 'obsidian';
import { DOM_CLASSES, translate } from '../constants';
import type { ChapterNode } from '../types';

interface ModalPlugin {
  settings?: { showExcerpt?: boolean; enableSound?: boolean; soundVolume?: number; activeColor?: string };
  soundEngine?: { playClick: (volume: number) => void };
  getChapterMarkers?: (file: unknown, chapter: ChapterNode) => { revisit?: boolean; important?: boolean } | null;
  getChapterStatusLabels?: (file: unknown, chapter: ChapterNode) => Array<{ className: string; label: string }>;
  resolveActiveColor?: (color: string | undefined) => string;
  resolveActiveForeground?: (color: string | undefined) => string;
  jumpToHeading?: (view: unknown, chapter: ChapterNode) => void;
}

/** Searchable chapter palette, kept independent from the main plugin lifecycle. */
export class ChapterSuggestModal extends SuggestModal<ChapterNode> {
  private readonly plugin: ModalPlugin;
  private readonly view: { file?: unknown };
  private readonly chapters: ChapterNode[];

  constructor(app: unknown, plugin: ModalPlugin, view: { file?: unknown }, chapters: ChapterNode[]) {
    super(app as never);
    this.plugin = plugin;
    this.view = view;
    this.chapters = chapters || [];
    this.setPlaceholder?.(translate('searchPlaceholder'));
    const modalElement = this.modalEl as HTMLElement & { addClass?: (...names: string[]) => void };
    modalElement?.addClass?.(DOM_CLASSES.modal);
    const activeColor = plugin.resolveActiveColor?.(plugin.settings?.activeColor) || '';
    modalElement?.style?.setProperty('--codex-active-color', activeColor);
    modalElement?.style?.setProperty('--codex-active-foreground', plugin.resolveActiveForeground?.(plugin.settings?.activeColor) || '#ffffff');
  }

  getItems(): ChapterNode[] { return this.chapters; }

  getItemText(item: ChapterNode): string { return `${item.title || ''} ${item.summaryMarkdown || ''}`; }

  getSuggestions(query: string): ChapterNode[] {
    if (!query?.trim()) return this.chapters;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.chapters.filter((chapter) => {
      const markers = this.plugin.getChapterMarkers?.(this.view.file, chapter) || {};
      const title = chapter.title.toLowerCase();
      const raw = chapter.rawHeading.toLowerCase();
      const excerpt = chapter.summaryMarkdown.toLowerCase();
      return tokens.every((token) => {
        const level = token.match(/^h([1-6])$/i) || token.match(/^(#{1,6})$/);
        if (level) return chapter.level === (level[1].startsWith('#') ? level[1].length : Number(level[1]));
        if (token === 'revisit' || token === '待复习') return markers.revisit === true;
        if (token === 'important' || token === '重点') return markers.important === true;
        return title.includes(token) || raw.includes(token) || excerpt.includes(token);
      });
    });
  }

  renderSuggestion(item: ChapterNode, element: HTMLElement): void {
    element.replaceChildren();
    const header = element.createDiv({ cls: 'codex-modal-header' });
    header.createSpan({ cls: `codex-level-badge level-${Math.min(item.level, 6)}`, text: `H${item.level}` });
    const title = header.createDiv({ cls: 'codex-modal-title' });
    void MarkdownRenderer.render(this.app, item.title, title, '', this.plugin as never);
    if (this.plugin.settings?.showExcerpt !== false && item.summaryMarkdown) {
      const excerpt = element.createDiv({ cls: 'codex-modal-excerpt' });
      void MarkdownRenderer.render(this.app, item.summaryMarkdown, excerpt, '', this.plugin as never);
    }
    const statuses = this.plugin.getChapterStatusLabels?.(this.view.file, item) || [];
    if (statuses.length) {
      const status = element.createDiv({ cls: 'codex-modal-bookmark-status' });
      statuses.forEach((entry) => status.createSpan({ cls: `codex-bookmark-label ${entry.className}`, text: entry.label }));
    }
  }

  onChooseSuggestion(item: ChapterNode): void {
    if (this.plugin.settings?.enableSound !== false) this.plugin.soundEngine?.playClick(this.plugin.settings?.soundVolume ?? 50);
    this.plugin.jumpToHeading?.(this.view, item);
  }

  onChooseItem(item: ChapterNode): void { this.onChooseSuggestion(item); }
}

export default ChapterSuggestModal;
