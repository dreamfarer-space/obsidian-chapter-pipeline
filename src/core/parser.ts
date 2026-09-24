import type {
  ChapterNode,
  HeadingCacheEntry,
  MathScanResult,
  PluginSettings
} from '../types';

/** Find balanced, non-escaped inline math ranges in a string. */
export function findMathRanges(text: string): MathScanResult {
  const ranges = [] as MathScanResult['ranges'];
  let openIndex = -1;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '$') continue;
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && text[j] === '\\'; j -= 1) backslashes += 1;
    if (backslashes % 2 !== 0) continue;
    if (openIndex === -1) openIndex = i;
    else {
      ranges.push({ start: openIndex, end: i + 1 });
      openIndex = -1;
    }
  }

  return { ranges, unclosedIndex: openIndex };
}

/** Truncate prose without leaving a dangling `$` delimiter. */
export function truncateExcerpt(text: string, maxLength = 200): string {
  if (!text || text.length <= maxLength) return text || '';
  const { ranges } = findMathRanges(text);
  let cutIndex = maxLength;
  const insideRange = ranges.find((range) => cutIndex > range.start && cutIndex < range.end);

  if (insideRange) {
    const textBefore = text.substring(0, insideRange.start).trim();
    cutIndex = textBefore.length === 0 || insideRange.end <= maxLength + 25
      ? insideRange.end
      : insideRange.start;
  }

  let truncated = text.substring(0, cutIndex).trim();
  const { unclosedIndex } = findMathRanges(truncated);
  if (unclosedIndex !== -1) truncated = truncated.substring(0, unclosedIndex).trim();
  truncated = truncated.replace(/[\s\.,;:!?，。！？]+$/, '');
  return truncated ? `${truncated}...` : '...';
}

function stripHtmlComments(input: string): string {
  let current = input;
  let previous: string;
  do {
    previous = current;
    current = current.replace(/<!--[\s\S]*?-->/g, '');
  } while (current !== previous);
  return current.replace(/<!--|-->/g, '');
}

export function normalizeHeadingText(text: unknown): string {
  if (!text) return '';
  return stripHtmlComments(String(text))
    .replace(/\[\[.*?\|(.*?)\]\]/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/\[status::.*?\]/gi, '')
    .replace(/[\$#\*=`~_\[\]\(\)（）:：·、\.,，。!！\?？\\/+\-—\s\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

function cleanHeadingTitle(heading: string): string {
  const cleaned = stripHtmlComments(heading)
    .replace(/#([\w\u4e00-\u9fa5-]+)/g, '')
    .replace(/\[status::.*?\]/gi, '')
    .trim();
  return cleaned || heading;
}

/**
 * Parse metadata-cache headings and collect a small, safe preview of each
 * section. The scan exits as soon as three visual lines or the configured
 * character budget is reached, which keeps large notes fast.
 */
export class ChapterParser {
  static parse(
    content: string,
    headings: HeadingCacheEntry[] | null | undefined,
    settings?: Partial<PluginSettings>
  ): ChapterNode[] {
    if (!headings?.length) return [];
    const chapters: ChapterNode[] = [];
    const minLevel = settings?.minHeadingLevel ?? 1;
    const maxLevel = settings?.maxHeadingLevel ?? 6;
    const ignoreFirstH1 = settings?.ignoreFirstH1 ?? false;
    const showExcerpt = settings?.showExcerpt !== false;
    const lines = content ? content.split(/\r?\n/) : [];
    const totalLines = lines.length;
    const idOccurrences = new Map<string, number>();
    let skippedFirstH1 = false;

    for (let index = 0; index < headings.length; index += 1) {
      const current = headings[index];
      const next = headings[index + 1];
      const normalized = normalizeHeadingText(current.heading) || `line${current.position?.start?.line ?? index}`;
      const baseId = `h${current.level}:${normalized}`;
      const occurrence = idOccurrences.get(baseId) ?? 0;
      idOccurrences.set(baseId, occurrence + 1);

      if (ignoreFirstH1 && !skippedFirstH1 && current.level === 1) {
        skippedFirstH1 = true;
        continue;
      }
      if (current.level < minLevel || current.level > maxLevel) continue;

      let summaryMarkdown = '';
      if (showExcerpt && lines.length > 0) {
        const startLine = current.position?.start?.line ?? 0;
        const rawEndLine = next ? next.position.start.line - 1 : totalLines - 1;
        const endLine = Math.min(rawEndLine, totalLines - 1);
        const maxExcerptLen = typeof settings?.excerptLength === 'number' && settings.excerptLength > 0
          ? settings.excerptLength
          : 140;
        const candidateLines: string[] = [];
        let inMathBlock = false;
        let inCodeBlock = false;
        let collectedChars = 0;
        let validVisualLines = 0;

        for (let lineIndex = startLine + 1; lineIndex <= endLine && lineIndex < totalLines; lineIndex += 1) {
          const rawLine = lines[lineIndex];
          if (typeof rawLine !== 'string') continue;
          let line = stripHtmlComments(rawLine).trim();

          if (line.startsWith('```') || line.startsWith('~~~')) {
            inCodeBlock = !inCodeBlock;
            continue;
          }
          if (inCodeBlock) continue;

          while (line.startsWith('>')) line = line.substring(1).trim();
          line = line.replace(/^\[![\w-]+\]\s*/i, '');
          line = line.replace(/\[\[.*?\|(.*?)\]\]/g, '$1').replace(/\[\[(.*?)\]\]/g, '$1');

          const mathDelimiters = line.match(/\$\$/g);
          if (mathDelimiters && mathDelimiters.length % 2 !== 0) inMathBlock = !inMathBlock;
          if (!line || line.startsWith('#') || line.startsWith('---')) continue;

          candidateLines.push(line);
          collectedChars += line.length;
          if (!inMathBlock && !line.endsWith(':') && !line.endsWith('：')) validVisualLines += 1;
          if (!inMathBlock && (validVisualLines >= 3 || collectedChars >= maxExcerptLen + 50)) break;
        }

        if (candidateLines.length > 0) {
          let fullText = candidateLines.join('\n');
          fullText = fullText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_match, math: string) => {
            const compact = math.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
            return `$${compact}$`;
          });
          let singleLine = fullText.split(/\r?\n/).join(' ').replace(/\s+/g, ' ').trim();
          if (singleLine.length > maxExcerptLen) singleLine = truncateExcerpt(singleLine, maxExcerptLen);
          if (singleLine) summaryMarkdown = singleLine;
        }
      }

      chapters.push({
        title: cleanHeadingTitle(current.heading),
        rawHeading: current.heading,
        level: current.level,
        line: current.position.start.line,
        headingIndex: index,
        id: `${baseId}:${occurrence}`,
        summaryMarkdown
      });
    }

    return chapters;
  }

  static findMathRanges = findMathRanges;
  static truncateExcerpt = truncateExcerpt;
  static normalizeHeadingText = normalizeHeadingText;
}

/** Small insertion-ordered cache for repeated hover/refresh parses. */
export class ChapterParseCache {
  private readonly entries = new Map<string, ChapterNode[]>();

  constructor(private readonly maxEntries = 32) {}

  get(key: string): ChapterNode[] | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    // Touch the key so the map remains least-recently-used ordered.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: ChapterNode[]): void {
    if (!key) return;
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > Math.max(1, this.maxEntries)) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void { this.entries.clear(); }
  delete(key: string): void { this.entries.delete(key); }
  deleteByPrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
  get size(): number { return this.entries.size; }
}
