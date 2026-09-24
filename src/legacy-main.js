'use strict';

// Compatibility implementation retained while the TypeScript modules are migrated incrementally.

const { Plugin, MarkdownView, MarkdownRenderer, PluginSettingTab, Setting, SuggestModal, Menu, Notice } = require('obsidian');
// Typed core modules are loaded by esbuild during production bundling. The
// coordinator keeps its historical DOM workflow, while these boundaries let us
// migrate behavior without changing the plugin's public CommonJS surface.
const { ChapterParser: TypedChapterParser, ChapterParseCache: TypedChapterParseCache } = require('./core/parser.ts');
const { SoundEngine: TypedSoundEngine } = require('./core/sound.ts');

const DEFAULT_SETTINGS = {
  minHeadingLevel: 1,
  maxHeadingLevel: 2,
  ignoreFirstH1: false,
  showExcerpt: true,
  excerptLength: 140,
  activeColor: '#3b82f6',
  customActiveColor: '#3b82f6',
  narrowThreshold: 600,
  enableSound: true,
  soundVolume: 50,
  dockPosition: 'left',
  hierarchyMode: 'hover-expand',
  showProgressRail: false,
  tooltipGlassmorphism: true,
  showChapterOrder: false,
  readingBookmarksEnabled: false,
  readingState: {
    version: 1,
    files: {}
  }
};

const I18N = {
  en: {
    tabTitle: 'Chapter Pipeline Settings',
    showExcerptName: 'Show 3-Line Excerpt Preview',
    showExcerptDesc: 'Display a 3-line excerpt of the section with KaTeX formula rendering below the title in the hover popover card. When disabled, only the clean title is shown.',
    excerptLengthName: 'Excerpt length (characters)',
    excerptLengthDesc: 'Maximum length of excerpt text extracted for tooltip and palette previews (60 - 300).',
    ignoreH1Name: 'Ignore First H1 (# Note Title)',
    ignoreH1Desc: 'When enabled, the first H1 heading at the top of the note will not generate a dash bar, showing only sub-sections.',
    dockPositionName: 'Dock Position',
    dockPositionDesc: 'Choose whether to display the outline pipeline on the left or right margin of the note.',
    dockPositionOptions: {
      'left': 'Left Margin (Default)',
      'right': 'Right Margin'
    },
    hierarchyModeName: 'Heading Hierarchy Mode',
    hierarchyModeDesc: 'Control the display mode of subheadings (H3~H6).',
    hierarchyModeOptions: {
      'hover-expand': 'Focus Mode (Default / Hover Expand)',
      'all': 'All Headings Expanded',
      'active-branch': 'Active Branch Only (Expand current section branch)'
    },
    showProgressRailName: 'Show Vertical Progress Rail',
    showProgressRailDesc: 'Display a smooth magnetic vertical progress guide line indicating reading position.',
    tooltipGlassmorphismName: 'Tooltip Glassmorphism & Spring Physics',
    tooltipGlassmorphismDesc: 'Enable backdrop blur glassmorphism and spring overshoot animations for hover popovers.',
    showChapterOrderName: 'Show Active Chapter Number',
    showChapterOrderDesc: 'Display the active chapter order number beside its highlighted dash. Disabled by default for a cleaner outline.',
    maxLevelName: 'Max Heading Level',
    maxLevelDesc: 'Filter deeper subheadings (e.g. choose H1~H3 to hide H4~H6).',
    maxLevelOptions: {
      '2': 'H1 ~ H2 (Recommended / Default)',
      '3': 'H1 ~ H3',
      '4': 'H1 ~ H4',
      '6': 'All H1 ~ H6'
    },
    activeColorName: 'Active Indicator Color',
    activeColorDesc: 'Customize the highlight color for the currently active reading section.',
    activeColorOptions: {
      '#3b82f6': 'Azure Blue (Default / Linear)',
      '#8b5cf6': 'Violet (Geek)',
      '#f59e0b': 'Sunset Amber (Warm)',
      '#ec4899': 'Sakura Pink (Vibrant)',
      'var(--interactive-accent)': 'Theme Accent Color',
      'custom': 'Custom Color...'
    },
    customColorName: 'Custom Active Indicator Color',
    customColorDesc: 'Pick a custom color to highlight the currently active section.',
    narrowThresholdName: 'Narrow View Auto-Hide Threshold (px)',
    narrowThresholdDesc: 'Automatically hide the stepper when note pane width is below this threshold to prevent overlapping text.',
    soundSectionTitle: 'Tactile Sound Effects',
    enableSoundName: 'Enable Tactile Micro-Switch Sound',
    enableSoundDesc: 'Play subtle mechanical micro-switch sounds on clicking chapters and scrolling across headings.',
    soundVolumeName: 'Sound Volume (%)',
    soundVolumeDesc: 'Adjust the volume of interactive tactile sound effects (Default: 50%).',
    searchPlaceholder: 'Search chapter or formula...',
    readingSectionTitle: 'Reading Progress & Bookmarks',
    readingBookmarksEnabledName: 'Enable Reading Progress & Bookmarks',
    readingBookmarksEnabledDesc: 'Save the last chapter you read and add optional chapter bookmarks. Stored only in Chapter Pipeline plugin data; your Markdown files are never changed.',
    cleanupReadingBookmarksName: 'Clean Up Invalid Bookmark Records',
    cleanupReadingBookmarksDesc: 'Remove saved reading positions and bookmarks for deleted or moved files to keep storage clean.',
    cleanupButtonText: 'Clean up now',
    cleanupSuccessNotice: 'Cleaned up {count} invalid note record(s).',
    cleanupNoneNotice: 'No invalid records found. Everything is up to date.',
    revisitLabel: 'Revisit',
    importantLabel: 'Important',
    markForRevisit: 'Mark for revisit',
    removeRevisitMark: 'Remove revisit mark',
    markImportant: 'Mark as important',
    removeImportantMark: 'Remove important mark',
    clearChapterBookmarks: 'Clear chapter bookmarks',
    commandJumpPrev: 'Chapter Pipeline: Jump to previous chapter',
    commandJumpNext: 'Chapter Pipeline: Jump to next chapter',
    commandOpenPalette: 'Chapter Pipeline: Search & switch chapter (Palette)',
    commandResumeLastChapter: 'Chapter Pipeline: Resume last chapter',
    commandToggleRevisit: 'Chapter Pipeline: Toggle revisit bookmark for current chapter',
    commandToggleImportant: 'Chapter Pipeline: Toggle important bookmark for current chapter',
    commandClearReadingBookmarks: 'Chapter Pipeline: Clear reading progress & bookmarks for current note',
    commandCleanupReadingBookmarks: 'Chapter Pipeline: Clean up invalid reading progress & bookmarks',
    resumeAvailable: 'Resume available: {title}',
    resumeUnavailable: 'No saved reading position in this note.',
    resumeNotFound: 'The saved chapter is no longer available.',
    readingBookmarksCleared: 'Reading progress and bookmarks cleared for this note.',
    chapterStatus: '{title} — {statuses}'
  },
  zh: {
    tabTitle: 'Chapter Pipeline 设置',
    showExcerptName: '开启正文 3 行摘要预览',
    showExcerptDesc: '在悬浮气泡中换行展示正文开头的 3 行摘要（支持 LaTeX / KaTeX 公式渲染，超出 3 行自动显示 ... 省略号）。关闭后仅展示纯净标题。',
    excerptLengthName: '摘要字符长度',
    excerptLengthDesc: '浮层气泡与搜索面板中提取正文摘要的最大字符数（60 - 300，默认 140）。',
    ignoreH1Name: '忽略文档首个一级大标题 (# 篇名)',
    ignoreH1Desc: '开启后，文章最开头的第一个 H1 大标题不会生成横线，仅展示正文小节。',
    dockPositionName: '靠栏停靠位置',
    dockPositionDesc: '选择大纲横线流停靠在笔记编辑区的左侧或右侧边栏。',
    dockPositionOptions: {
      'left': '左侧边栏 (默认)',
      'right': '右侧边栏'
    },
    hierarchyModeName: '多级标题展示模式',
    hierarchyModeDesc: '控制 H3~H6 深层子小节的折叠与聚焦策略。',
    hierarchyModeOptions: {
      'hover-expand': '主干聚焦模式 (默认 / 悬停展开)',
      'all': '全部平铺展开',
      'active-branch': '当前分支聚焦 (仅展开当前阅读章节的子小节)'
    },
    showProgressRailName: '开启垂直进度导轨',
    showProgressRailDesc: '在横线左侧显示一条极简平滑的垂直微光导轨，实时指示当前章节阅读进度。',
    tooltipGlassmorphismName: '毛玻璃质感与弹簧动效',
    tooltipGlassmorphismDesc: '开启悬浮气泡毛玻璃模糊背景 (Backdrop Blur) 与拟物弹簧微动进场动效。',
    showChapterOrderName: '显示当前章节序号',
    showChapterOrderDesc: '在活动高亮横线旁显示当前章节在本笔记大纲中的序号。默认关闭，保持界面简洁。',
    maxLevelName: '最大展示标题层级',
    maxLevelDesc: '例如设为 2 则只展示 H1~H2 章节，过滤更深层级的子小节。',
    maxLevelOptions: {
      '2': '仅 H1 ~ H2 (默认 / 推荐)',
      '3': 'H1 ~ H3',
      '4': 'H1 ~ H4',
      '6': '全部 H1 ~ H6'
    },
    activeColorName: '激活高亮横线颜色',
    activeColorDesc: '自定义当前阅读位置的横线条加亮颜色。',
    activeColorOptions: {
      '#3b82f6': '天青蓝 (默认 / Linear 质感)',
      '#8b5cf6': '紫罗兰 (极客紫)',
      '#f59e0b': '日落琥珀 (温和橙)',
      '#ec4899': '樱花粉 (活力粉)',
      'var(--interactive-accent)': '跟随主题强调色',
      'custom': '自定义颜色…'
    },
    customColorName: '自定义激活高亮颜色',
    customColorDesc: '自由挑选任意色彩作为当前阅读章节的高亮颜色。',
    narrowThresholdName: '分屏/窄屏自动隐藏宽度阈值 (px)',
    narrowThresholdDesc: '当笔记窗口宽度小于该像素时，横线流自动隐藏以避免遮挡正文。',
    soundSectionTitle: '极简拟物微动音效',
    enableSoundName: '开启拟物微动音效',
    enableSoundDesc: '在点击横线跳转及页面滚动跨越章节时，播放轻微清脆的机械微动与转轮刻度音。',
    soundVolumeName: '音效音量 (%)',
    soundVolumeDesc: '调节交互音效的音量大小（默认 50% 柔和舒适音量）。',
    searchPlaceholder: '搜索章节或公式…',
    readingSectionTitle: '阅读断点与章节书签',
    readingBookmarksEnabledName: '开启阅读断点与章节书签',
    readingBookmarksEnabledDesc: '保存上次阅读章节，并可为章节添加书签。数据仅保存在 Chapter Pipeline 插件配置中，不会修改 Markdown 文件。',
    cleanupReadingBookmarksName: '清理已失效的笔记记录',
    cleanupReadingBookmarksDesc: '扫描并移除已删除或移出库的笔记所遗留的阅读断点与书签数据，保持配置数据轻量。',
    cleanupButtonText: '立即清理',
    cleanupSuccessNotice: '已清理 {count} 条失效笔记的记录。',
    cleanupNoneNotice: '未发现失效记录，当前配置非常整洁。',
    revisitLabel: '稍后回看',
    importantLabel: '重点',
    markForRevisit: '标记为稍后回看',
    removeRevisitMark: '移除稍后回看标记',
    markImportant: '标记为重点',
    removeImportantMark: '移除重点标记',
    clearChapterBookmarks: '清除本章节书签',
    commandJumpPrev: 'Chapter Pipeline：跳转至上一章节',
    commandJumpNext: 'Chapter Pipeline：跳转至下一章节',
    commandOpenPalette: 'Chapter Pipeline：搜索并快速跳转章节',
    commandResumeLastChapter: 'Chapter Pipeline：恢复上次阅读章节',
    commandToggleRevisit: 'Chapter Pipeline：切换当前章节的稍后回看书签',
    commandToggleImportant: 'Chapter Pipeline：切换当前章节的重点书签',
    commandClearReadingBookmarks: 'Chapter Pipeline：清除当前笔记的阅读断点与书签',
    commandCleanupReadingBookmarks: 'Chapter Pipeline：清理已失效的阅读断点与书签',
    resumeAvailable: '可恢复上次阅读：{title}',
    resumeUnavailable: '这篇笔记没有保存的阅读位置。',
    resumeNotFound: '保存的章节已不存在，无法恢复。',
    readingBookmarksCleared: '已清除本笔记的阅读断点与书签。',
    chapterStatus: '{title} — {statuses}'
  }
};

function getLocale() {
  const lang = (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('language') : null) || (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en';
  return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function t(key, variables = {}) {
  const localeStrings = I18N[getLocale()] || I18N.en;
  const value = localeStrings[key] !== undefined ? localeStrings[key] : I18N.en[key];
  if (typeof value !== 'string') return value === undefined ? key : value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (
    variables[name] === undefined || variables[name] === null ? match : String(variables[name])
  ));
}

function resolveReadableForeground(color) {
  const value = String(color || '').trim();
  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return '#ffffff';
  const hex = match[1].length === 3
    ? match[1].split('').map((part) => part + part).join('')
    : match[1];
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  ));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastDark = (luminance + 0.05) / 0.05;
  return contrastDark >= contrastWhite ? '#111827' : '#ffffff';
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.lastScrollTime = 0;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))
        || (typeof global !== 'undefined' && (global.AudioContext || global.webkitAudioContext))
        || SoundEngine.lastAudioContextClass;
      if (AudioCtx) {
        SoundEngine.lastAudioContextClass = AudioCtx;
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  destroy() {
    if (this.ctx) {
      try {
        if (typeof this.ctx.close === 'function') {
          this.ctx.close().catch(() => {});
        }
      } catch (e) {
        // ignore
      }
      this.ctx = null;
    }
  }

  playClick(volumePct = 50) {
    if (volumePct <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const vol = (Math.max(0, Math.min(100, volumePct)) / 100) * 0.12;
      masterGain.gain.setValueAtTime(vol, now);
      masterGain.connect(ctx.destination);

      // 1. 拟物微动清脆短脉冲（~1850Hz 带通瞬态）
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1850, now);
      filter.Q.setValueAtTime(3.5, now);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.022);

      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.027);

      // 2. 极短微撞声（~450Hz 触底瞬态）
      const oscLow = ctx.createOscillator();
      const gainLow = ctx.createGain();
      oscLow.type = 'sine';
      oscLow.frequency.setValueAtTime(450, now);
      oscLow.frequency.exponentialRampToValueAtTime(180, now + 0.016);

      gainLow.gain.setValueAtTime(0.6, now);
      gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      oscLow.connect(gainLow);
      gainLow.connect(masterGain);

      oscLow.start(now);
      oscLow.stop(now + 0.021);
    } catch (e) {
      // ignore
    }
  }

  playScrollTick(volumePct = 50) {
    if (volumePct <= 0) return;
    const nowMs = Date.now();
    if (nowMs - this.lastScrollTime < 75) return;
    this.lastScrollTime = nowMs;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const vol = (Math.max(0, Math.min(100, volumePct)) / 100) * 0.045;
      masterGain.gain.setValueAtTime(vol, now);
      masterGain.connect(ctx.destination);

      // 机械转轮刻度轻音（~920Hz 短促柔和）
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.014);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.018);
    } catch (e) {
      // ignore
    }
  }
}

function findMathRanges(text) {
  const ranges = [];
  let openIndex = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$') {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) {
        backslashes++;
      }
      if (backslashes % 2 === 0) {
        if (openIndex === -1) {
          openIndex = i;
        } else {
          ranges.push({ start: openIndex, end: i + 1 });
          openIndex = -1;
        }
      }
    }
  }
  return { ranges, unclosedIndex: openIndex };
}

function truncateExcerpt(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text || '';
  const { ranges } = findMathRanges(text);
  let cutIndex = maxLength;
  const insideRange = ranges.find((r) => cutIndex > r.start && cutIndex < r.end);
  if (insideRange) {
    const textBefore = text.substring(0, insideRange.start).trim();
    if (textBefore.length === 0 || insideRange.end <= maxLength + 25) {
      cutIndex = insideRange.end;
    } else {
      cutIndex = insideRange.start;
    }
  }
  let truncated = text.substring(0, cutIndex).trim();
  const { unclosedIndex } = findMathRanges(truncated);
  if (unclosedIndex !== -1) {
    truncated = truncated.substring(0, unclosedIndex).trim();
  }
  truncated = truncated.replace(/[\s\.,;:!?，。！？]+$/, '');
  return truncated ? truncated + '...' : '...';
}

class ChapterParser {
  static parse(content, headings, settings) {
    if (!headings || headings.length === 0) return [];
    const chapters = [];

    const minLevel = settings ? settings.minHeadingLevel : 1;
    const maxLevel = settings ? settings.maxHeadingLevel : 6;
    const ignoreFirstH1 = settings ? settings.ignoreFirstH1 : false;
    const showExcerpt = settings ? (settings.showExcerpt !== false) : true;

    const lines = content ? content.split(/\r?\n/) : [];
    const totalLines = lines.length;

    let skippedFirstH1 = false;
    const chapterIdOccurrences = new Map();

    for (let i = 0; i < headings.length; i++) {
      const currentH = headings[i];
      const nextH = headings[i + 1];
      const normalizedHeading = normalizeHeadingText(currentH.heading) || `line${currentH.position?.start?.line ?? i}`;
      const chapterIdBase = `h${currentH.level}:${normalizedHeading}`;
      const chapterIdOccurrence = chapterIdOccurrences.get(chapterIdBase) || 0;
      chapterIdOccurrences.set(chapterIdBase, chapterIdOccurrence + 1);
      const chapterId = `${chapterIdBase}:${chapterIdOccurrence}`;

      if (ignoreFirstH1 && !skippedFirstH1 && currentH.level === 1) {
        skippedFirstH1 = true;
        continue;
      }

      if (currentH.level < minLevel || currentH.level > maxLevel) {
        continue;
      }

      // 清理标题中的注释、Tag 和属性标记
      let cleanTitle = currentH.heading
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/#([\w\u4e00-\u9fa5-]+)/g, '')
        .replace(/\[status::.*?\]/gi, '')
        .trim();

      if (!cleanTitle) cleanTitle = currentH.heading;

      // 纯净提取正文前 3 行摘要（早期退出 O(1) 扫描，过滤 Callout，保留 LaTeX 数学公式）
      let summaryMarkdown = '';
      if (showExcerpt && lines.length > 0) {
        const startLine = currentH.position?.start?.line ?? 0;
        const rawEndLine = nextH ? nextH.position.start.line - 1 : totalLines - 1;
        const endLine = Math.min(rawEndLine, totalLines - 1);
        const maxExcerptLen = (settings && typeof settings.excerptLength === 'number' && settings.excerptLength > 0)
          ? settings.excerptLength
          : 140;

        const candidateLines = [];
        let inMathBlock = false;
        let inCodeBlock = false;
        let collectedChars = 0;
        let validVisualLines = 0;

        for (let lineIdx = startLine + 1; lineIdx <= endLine && lineIdx < totalLines; lineIdx++) {
          const rawLine = lines[lineIdx];
          if (typeof rawLine !== 'string') continue;
          let s = rawLine.replace(/<!--[\s\S]*?-->/g, '').trim();

          // Code fence handling
          if (s.startsWith('```') || s.startsWith('~~~')) {
            inCodeBlock = !inCodeBlock;
            continue;
          }
          if (inCodeBlock) continue;

          // Callout markers handling
          while (s.startsWith('>')) {
            s = s.substring(1).trim();
          }
          s = s.replace(/^\[![\w-]+\]\s*/i, '');
          s = s.replace(/\[\[.*?\|(.*?)\]\]/g, '$1').replace(/\[\[(.*?)\]\]/g, '$1');

          // Math block detection ($$)
          const mathDelims = s.match(/\$\$/g);
          if (mathDelims && mathDelims.length % 2 !== 0) {
            inMathBlock = !inMathBlock;
          }

          if (!s || s.startsWith('#') || s.startsWith('---')) {
            continue;
          }

          candidateLines.push(s);
          collectedChars += s.length;

          if (!inMathBlock) {
            if (!s.endsWith(':') && !s.endsWith('：')) {
              validVisualLines++;
            }
          }

          // Early-exit: stop immediately once 3 valid visual lines or sufficient characters are gathered (outside of open math blocks)
          if (!inMathBlock && (validVisualLines >= 3 || collectedChars >= maxExcerptLen + 50)) {
            break;
          }
        }

        if (candidateLines.length > 0) {
          let fullText = candidateLines.join('\n');
          fullText = fullText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match, math) => {
            const compact = math.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
            return '$' + compact + '$';
          });

          let singleLine = fullText.split(/\r?\n/).join(' ').replace(/\s+/g, ' ').trim();
          if (singleLine.length > maxExcerptLen) {
            singleLine = truncateExcerpt(singleLine, maxExcerptLen);
          }

          if (singleLine) {
            summaryMarkdown = singleLine;
          }
        }
      }

      chapters.push({
        title: cleanTitle,
        rawHeading: currentH.heading,
        level: currentH.level,
        line: currentH.position.start.line,
        headingIndex: i,
        id: chapterId,
        summaryMarkdown
      });
    }

    return chapters;
  }
}

ChapterParser.findMathRanges = findMathRanges;
ChapterParser.truncateExcerpt = truncateExcerpt;
ChapterParser.parse = TypedChapterParser.parse;
ChapterParser.findMathRanges = TypedChapterParser.findMathRanges;
ChapterParser.truncateExcerpt = TypedChapterParser.truncateExcerpt;

function updateHierarchyFolding(chapters, dashElements, activeIdx, hierarchyMode) {
  if (!chapters || !dashElements || dashElements.length === 0) return;
  const mode = hierarchyMode || 'all';

  if (mode === 'all') {
    for (let i = 0; i < dashElements.length; i++) {
      dashElements[i].classList.remove('is-collapsed');
      dashElements[i].setAttribute('tabindex', '0');
    }
    return;
  }

  if (mode === 'hover-expand') {
    for (let i = 0; i < dashElements.length; i++) {
      const chap = chapters[i];
      if (chap && chap.level >= 3) {
        dashElements[i].classList.add('is-collapsed');
        dashElements[i].setAttribute('tabindex', '-1');
      } else {
        dashElements[i].classList.remove('is-collapsed');
        dashElements[i].setAttribute('tabindex', '0');
      }
    }
    return;
  }

  if (mode === 'active-branch') {
    let branchStart = -1;
    let branchEnd = -1;

    if (activeIdx >= 0 && activeIdx < chapters.length) {
      let parentIdx = activeIdx;
      while (parentIdx >= 0 && chapters[parentIdx].level > 2) {
        parentIdx--;
      }

      if (parentIdx >= 0) {
        branchStart = parentIdx + 1;
        branchEnd = chapters.length;
        for (let i = parentIdx + 1; i < chapters.length; i++) {
          if (chapters[i].level <= 2) {
            branchEnd = i;
            break;
          }
        }
      } else {
        branchStart = 0;
        branchEnd = chapters.length;
        for (let i = 0; i < chapters.length; i++) {
          if (chapters[i].level <= 2) {
            branchEnd = i;
            break;
          }
        }
      }
    }

    for (let i = 0; i < dashElements.length; i++) {
      const chap = chapters[i];
      if (chap && chap.level >= 3) {
        const inActiveBranch = (i >= branchStart && i < branchEnd);
        if (inActiveBranch) {
          dashElements[i].classList.remove('is-collapsed');
          dashElements[i].setAttribute('tabindex', '0');
        } else {
          dashElements[i].classList.add('is-collapsed');
          dashElements[i].setAttribute('tabindex', '-1');
        }
      } else {
        dashElements[i].classList.remove('is-collapsed');
        dashElements[i].setAttribute('tabindex', '0');
      }
    }
  }
}

class ChapterSuggestModal extends SuggestModal {
  constructor(app, plugin, view, chapters) {
    super(app);
    this.plugin = plugin;
    this.view = view;
    this.chapters = chapters || [];
    if (typeof this.setPlaceholder === 'function') {
      this.setPlaceholder(t('searchPlaceholder'));
    }
    if (this.modalEl) {
      if (typeof this.modalEl.addClass === 'function') {
        this.modalEl.addClass('codex-suggest-modal');
      } else if (this.modalEl.classList && typeof this.modalEl.classList.add === 'function') {
        this.modalEl.classList.add('codex-suggest-modal');
      }
      if (this.modalEl.style && typeof this.modalEl.style.setProperty === 'function') {
        const activeColor = this.plugin?.resolveActiveColor?.(this.plugin?.settings?.activeColor);
        this.modalEl.style.setProperty('--codex-active-color', activeColor);
        this.modalEl.style.setProperty('--codex-active-foreground', this.plugin?.resolveActiveForeground?.(this.plugin?.settings?.activeColor) || '#ffffff');
      }
    }
  }

  getItems() {
    return this.chapters;
  }

  getItemText(item) {
    return (item.title || '') + ' ' + (item.summaryMarkdown || '');
  }

  getSuggestions(query) {
    if (!query || !query.trim()) {
      return this.chapters;
    }

    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const file = this.view?.file;

    return this.chapters.filter((chap) => {
      const markers = (this.plugin?.getChapterMarkers && file)
        ? (this.plugin.getChapterMarkers(file, chap) || {})
        : {};

      const titleLower = (chap.title || '').toLowerCase();
      const rawLower = (chap.rawHeading || '').toLowerCase();
      const excerptLower = (chap.summaryMarkdown || '').toLowerCase();

      return tokens.every((token) => {
        const hMatch = token.match(/^h([1-6])$/i);
        if (hMatch) {
          return chap.level === parseInt(hMatch[1], 10);
        }
        const hashMatch = token.match(/^(#{1,6})$/);
        if (hashMatch) {
          return chap.level === hashMatch[1].length;
        }

        if (token === 'revisit' || token === '待复习') {
          return markers.revisit === true;
        }

        if (token === 'important' || token === '重点') {
          return markers.important === true;
        }

        return titleLower.includes(token) || rawLower.includes(token) || excerptLower.includes(token);
      });
    });
  }

  renderSuggestion(item, el) {
    if (typeof el.empty === 'function') el.empty();
    if (typeof el.addClass === 'function') {
      el.addClass('codex-suggest-item', 'codex-modal-item');
    } else if (el.classList && typeof el.classList.add === 'function') {
      el.classList.add('codex-suggest-item', 'codex-modal-item');
    }

    const headerEl = (typeof el.createDiv === 'function')
      ? el.createDiv({ cls: 'codex-modal-header' })
      : el;

    const badgeCls = `codex-level-badge level-${Math.min(item.level, 6)}`;
    if (typeof headerEl.createSpan === 'function') {
      headerEl.createSpan({
        cls: badgeCls,
        text: `H${item.level}`
      });
    }

    const titleEl = (typeof headerEl.createDiv === 'function')
      ? headerEl.createDiv({ cls: 'codex-modal-title' })
      : null;
    if (titleEl) {
      MarkdownRenderer.render(this.app, formatTitleForRender(item.title), titleEl, '', this.plugin);
    }

    if (this.plugin?.settings?.showExcerpt !== false && item.summaryMarkdown) {
      const excerptEl = (typeof el.createDiv === 'function')
        ? el.createDiv({ cls: 'codex-modal-excerpt' })
        : null;
      if (excerptEl) {
        MarkdownRenderer.render(this.app, item.summaryMarkdown, excerptEl, '', this.plugin);
      }
    }

    const statuses = this.plugin?.getChapterStatusLabels?.(this.view?.file, item) || [];
    if (statuses.length > 0 && typeof el.createDiv === 'function') {
      const statusEl = el.createDiv({ cls: 'codex-modal-bookmark-status' });
      statuses.forEach((status) => {
        statusEl.createSpan({ cls: `codex-bookmark-label ${status.className}`, text: status.label });
      });
    }
  }

  onChooseItem(item, evt) {
    if (!item) return;
    if (this.plugin?.settings?.enableSound !== false) {
      const vol = this.plugin?.settings?.soundVolume !== undefined ? this.plugin.settings.soundVolume : 50;
      this.plugin?.soundEngine?.playClick(vol);
    }
    this.plugin?.jumpToHeading(this.view, item);
  }
}

class ChapterPipelineSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    const strings = I18N[getLocale()] || I18N.en;

    containerEl.createEl('h2', { text: strings.tabTitle });

    new Setting(containerEl)
      .setName(strings.showExcerptName)
      .setDesc(strings.showExcerptDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showExcerpt !== false)
          .onChange(async (value) => {
            this.plugin.settings.showExcerpt = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );

    if (this.plugin.settings.showExcerpt !== false) {
      new Setting(containerEl)
        .setName(strings.excerptLengthName || 'Excerpt length (characters)')
        .setDesc(strings.excerptLengthDesc || 'Maximum length of excerpt text extracted for tooltip and palette previews (60 - 300).')
        .addSlider((slider) =>
          slider
            .setLimits(60, 300, 10)
            .setValue(this.plugin.settings.excerptLength || 140)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.excerptLength = value;
              await this.plugin.saveSettings();
              this.plugin.updateAllMarkdownViews();
            })
        );
    }

    new Setting(containerEl)
      .setName(strings.ignoreH1Name)
      .setDesc(strings.ignoreH1Desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ignoreFirstH1)
          .onChange(async (value) => {
            this.plugin.settings.ignoreFirstH1 = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );

    new Setting(containerEl)
      .setName(strings.dockPositionName)
      .setDesc(strings.dockPositionDesc)
      .addDropdown((drop) => {
        for (const [key, val] of Object.entries(strings.dockPositionOptions)) {
          drop.addOption(key, val);
        }
        drop
          .setValue(this.plugin.settings.dockPosition || 'left')
          .onChange(async (value) => {
            this.plugin.settings.dockPosition = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          });
      });

    new Setting(containerEl)
      .setName(strings.hierarchyModeName)
      .setDesc(strings.hierarchyModeDesc)
      .addDropdown((drop) => {
        for (const [key, val] of Object.entries(strings.hierarchyModeOptions)) {
          drop.addOption(key, val);
        }
        drop
          .setValue(this.plugin.settings.hierarchyMode || 'hover-expand')
          .onChange(async (value) => {
            this.plugin.settings.hierarchyMode = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          });
      });

    new Setting(containerEl)
      .setName(strings.showProgressRailName)
      .setDesc(strings.showProgressRailDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showProgressRail === true)
          .onChange(async (value) => {
            this.plugin.settings.showProgressRail = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );

    new Setting(containerEl)
      .setName(strings.tooltipGlassmorphismName)
      .setDesc(strings.tooltipGlassmorphismDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tooltipGlassmorphism !== false)
          .onChange(async (value) => {
            this.plugin.settings.tooltipGlassmorphism = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );

    new Setting(containerEl)
      .setName(strings.showChapterOrderName)
      .setDesc(strings.showChapterOrderDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showChapterOrder === true)
          .onChange(async (value) => {
            this.plugin.settings.showChapterOrder = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );

    containerEl.createEl('h3', { text: strings.readingSectionTitle });

    new Setting(containerEl)
      .setName(strings.readingBookmarksEnabledName)
      .setDesc(strings.readingBookmarksEnabledDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.readingBookmarksEnabled === true)
          .onChange(async (value) => {
            this.plugin.settings.readingBookmarksEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
            this.display();
          })
      );

    if (this.plugin.settings.readingBookmarksEnabled === true) {
      new Setting(containerEl)
        .setName(strings.cleanupReadingBookmarksName)
        .setDesc(strings.cleanupReadingBookmarksDesc)
        .addButton((btn) =>
          btn
            .setButtonText(strings.cleanupButtonText)
            .onClick(() => {
              const count = this.plugin.cleanupOrphanedReadingState();
              this.plugin.showNotice(count > 0 ? t('cleanupSuccessNotice', { count }) : t('cleanupNoneNotice'));
            })
        );
    }

    const levelSetting = new Setting(containerEl)
      .setName(strings.maxLevelName)
      .setDesc(strings.maxLevelDesc)
      .addDropdown((drop) => {
        for (const [key, val] of Object.entries(strings.maxLevelOptions)) {
          drop.addOption(key, val);
        }
        drop
          .setValue(String(this.plugin.settings.maxHeadingLevel))
          .onChange(async (value) => {
            this.plugin.settings.maxHeadingLevel = parseInt(value, 10);
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          });
      });

    const colorSetting = new Setting(containerEl)
      .setName(strings.activeColorName)
      .setDesc(strings.activeColorDesc)
      .addDropdown((drop) => {
        for (const [key, val] of Object.entries(strings.activeColorOptions)) {
          drop.addOption(key, val);
        }
        const isKnown = Object.keys(strings.activeColorOptions).includes(this.plugin.settings.activeColor);
        drop
          .setValue(isKnown ? this.plugin.settings.activeColor : 'custom')
          .onChange(async (value) => {
            this.plugin.settings.activeColor = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
            this.display();
          });
      });

    const isCustomColor = this.plugin.settings.activeColor === 'custom' || !Object.keys(strings.activeColorOptions).includes(this.plugin.settings.activeColor);
    if (isCustomColor && typeof colorSetting.addColorPicker === 'function') {
      colorSetting.addColorPicker((picker) =>
        picker
          .setValue(this.plugin.settings.customActiveColor || '#3b82f6')
          .onChange(async (value) => {
            this.plugin.settings.customActiveColor = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );
    }

    new Setting(containerEl)
      .setName(strings.narrowThresholdName)
      .setDesc(strings.narrowThresholdDesc)
      .addSlider((slider) =>
        slider
          .setLimits(350, 700, 10)
          .setValue(this.plugin.settings.narrowThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.narrowThreshold = value;
            await this.plugin.saveSettings();
            this.plugin.updateAllMarkdownViews();
          })
      );

    containerEl.createEl('h3', { text: strings.soundSectionTitle });

    new Setting(containerEl)
      .setName(strings.enableSoundName)
      .setDesc(strings.enableSoundDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSound !== false)
          .onChange(async (value) => {
            this.plugin.settings.enableSound = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(strings.soundVolumeName)
      .setDesc(strings.soundVolumeDesc)
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 5)
          .setValue(this.plugin.settings.soundVolume !== undefined ? this.plugin.settings.soundVolume : 50)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.soundVolume = value;
            await this.plugin.saveSettings();
            if (this.plugin.settings.enableSound !== false) {
              this.plugin.soundEngine.playClick(value);
            }
          })
      );
  }
}

function formatTitleForRender(title) {
  if (!title) return '';
  return String(title)
    .replace(/^(\s*\d+)\.\s+/g, '$1\\. ')
    .replace(/^(\s*\d+)\)\s+/g, '$1\\) ')
    .replace(/^(\s*[-*+])\s+/g, '\\$1 ');
}

function normalizeHeadingText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[.*?\|(.*?)\]\]/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/\[status::.*?\]/gi, '')
    .replace(/[\$#\*=`~_\[\]\(\)（）:：·、\.,，。!！\?？\\/+\-—\s\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

function createEmptyReadingState() {
  return { version: 1, files: {} };
}

function normalizeReadingState(readingState) {
  const normalized = createEmptyReadingState();
  const files = readingState && typeof readingState === 'object' && !Array.isArray(readingState)
    ? readingState.files
    : null;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return normalized;

  for (const [path, rawFileState] of Object.entries(files)) {
    if (!path || !rawFileState || typeof rawFileState !== 'object' || Array.isArray(rawFileState)) continue;

    const fileState = { markers: {} };
    const rawResume = rawFileState.resume;
    if (rawResume && typeof rawResume === 'object' && typeof rawResume.chapterId === 'string' && rawResume.chapterId) {
      fileState.resume = {
        chapterId: rawResume.chapterId,
        title: typeof rawResume.title === 'string' ? rawResume.title : '',
        updatedAt: Number.isFinite(rawResume.updatedAt) ? rawResume.updatedAt : 0
      };
    }

    const rawMarkers = rawFileState.markers;
    if (rawMarkers && typeof rawMarkers === 'object' && !Array.isArray(rawMarkers)) {
      for (const [chapterId, rawMarker] of Object.entries(rawMarkers)) {
        if (!chapterId || !rawMarker || typeof rawMarker !== 'object' || Array.isArray(rawMarker)) continue;
        const marker = {
          revisit: rawMarker.revisit === true,
          important: rawMarker.important === true
        };
        if (marker.revisit || marker.important) {
          fileState.markers[chapterId] = marker;
        }
      }
    }

    if (fileState.resume || Object.keys(fileState.markers).length > 0) {
      normalized.files[path] = fileState;
    }
  }

  return normalized;
}

class ChapterPipelinePlugin extends Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.observers = new Map();
    this.viewObservers = new Map();
    this.renderVersions = new Map();
    this.scrollBindings = new Map();
    this.viewTooltips = new Map();
    this.viewChapterSnapshots = new WeakMap();
    this.soundEngine = new TypedSoundEngine();
    this.chapterCache = new TypedChapterParseCache(32);
    this.documentRevisions = new Map();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, { readingState: createEmptyReadingState() });
    this.refreshFrame = null;
    this.refreshTimer = null;
    this.readingSaveTimer = null;
    this.resumePromptedPaths = new Set();
    this.pendingFrames = new Set();
    this.tooltipCounter = 0;
  }

  /** Track every deferred frame so split views can be torn down without stale callbacks. */
  scheduleFrame(callback) {
    let frameId = null;
    frameId = requestAnimationFrame(() => {
      if (frameId !== null) this.pendingFrames.delete(frameId);
      callback();
    });
    if (frameId !== null) this.pendingFrames.add(frameId);
    return frameId;
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ChapterPipelineSettingTab(this.app, this));

    if (this.app.vault && typeof this.app.vault.on === 'function') {
      this.registerEvent(
        this.app.vault.on('rename', (file, oldPath) => {
          if (file?.path && oldPath) {
            this.chapterCache.deleteByPrefix(`${oldPath}|`);
            const revision = this.documentRevisions.get(oldPath);
            this.documentRevisions.delete(oldPath);
            if (revision !== undefined) this.documentRevisions.set(file.path, revision);
            this.migrateReadingState(oldPath, file.path);
          }
        })
      );
      this.registerEvent(
        this.app.vault.on('delete', (file) => {
          if (file?.path) {
            this.chapterCache.deleteByPrefix(`${file.path}|`);
            this.documentRevisions.delete(file.path);
            this.chapterCache.deleteByPrefix(`${file.path}/`);
            for (const path of this.documentRevisions.keys()) {
              if (path.startsWith(`${file.path}/`)) this.documentRevisions.delete(path);
            }
            this.pruneDeletedReadingState(file.path);
          }
        })
      );
    }

    // 监听工作区事件
    if (this.app.workspace && typeof this.app.workspace.on === 'function') {
      this.registerEvent(
        this.app.workspace.on('active-leaf-change', () => {
          this.scheduleUpdateAllMarkdownViews();
        })
      );

      // 监听文件打开（确保编辑与阅读模式开篇即加载横线流）
      this.registerEvent(
        this.app.workspace.on('file-open', () => {
          this.scheduleUpdateAllMarkdownViews();
        })
      );

      // 监听视图布局与视图模式切换（如 Ctrl+E 编辑/阅读视图切换）
      this.registerEvent(
        this.app.workspace.on('layout-change', () => {
          this.scheduleUpdateAllMarkdownViews();
        })
      );

      // 监听编辑模式输入（防抖实时刷新章节大纲）
      let editorChangeTimeout = null;
      this.registerEvent(
        this.app.workspace.on('editor-change', (editor, info) => {
          if (info?.file?.path) {
            this.documentRevisions.set(info.file.path, (this.documentRevisions.get(info.file.path) || 0) + 1);
            this.chapterCache.deleteByPrefix(`${info.file.path}|`);
          }
          if (editorChangeTimeout) clearTimeout(editorChangeTimeout);
          editorChangeTimeout = setTimeout(() => {
            if (info && info.file) {
              const activeView = this.app.workspace?.getActiveViewOfType ? this.app.workspace.getActiveViewOfType(MarkdownView) : null;
              if (activeView && activeView.file && activeView.file.path === info.file.path) {
                this.attachStepperToView(activeView);
              }
            }
          }, 300);
        })
      );
    }

    // 监听元数据缓存更新
    if (this.app.metadataCache && typeof this.app.metadataCache.on === 'function') {
      this.registerEvent(
        this.app.metadataCache.on('changed', (file) => {
          if (file?.path) {
            this.documentRevisions.set(file.path, (this.documentRevisions.get(file.path) || 0) + 1);
            this.chapterCache.deleteByPrefix(`${file.path}|`);
          }
          const activeView = this.app.workspace?.getActiveViewOfType ? this.app.workspace.getActiveViewOfType(MarkdownView) : null;
          if (activeView && activeView.file && activeView.file.path === file.path) {
            this.attachStepperToView(activeView);
          }
        })
      );
    }

    // 注册快捷跳转与章节搜索命令
    this.addCommand({
      id: 'chapter-pipeline-jump-prev',
      name: t('commandJumpPrev'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            this.jumpToPreviousChapter(view);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-jump-next',
      name: t('commandJumpNext'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            this.jumpToNextChapter(view);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-open-palette',
      name: t('commandOpenPalette'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            this.openChapterPalette(view);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-resume-last-chapter',
      name: t('commandResumeLastChapter'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || this.settings.readingBookmarksEnabled !== true) return false;
        if (!checking) {
          this.resumeLastChapter(view);
        }
        return true;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-toggle-revisit-current',
      name: t('commandToggleRevisit'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || this.settings.readingBookmarksEnabled !== true) return false;
        if (!checking) {
          this.toggleCurrentChapterMarker('revisit', view);
        }
        return true;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-toggle-important-current',
      name: t('commandToggleImportant'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || this.settings.readingBookmarksEnabled !== true) return false;
        if (!checking) {
          this.toggleCurrentChapterMarker('important', view);
        }
        return true;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-clear-reading-bookmarks-current',
      name: t('commandClearReadingBookmarks'),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || this.settings.readingBookmarksEnabled !== true) return false;
        if (!checking) {
          this.clearReadingBookmarks(view);
        }
        return true;
      }
    });

    this.addCommand({
      id: 'chapter-pipeline-cleanup-reading-bookmarks',
      name: t('commandCleanupReadingBookmarks'),
      checkCallback: (checking) => {
        if (this.settings.readingBookmarksEnabled !== true) return false;
        if (!checking) {
          const count = this.cleanupOrphanedReadingState();
          this.showNotice(count > 0 ? t('cleanupSuccessNotice', { count }) : t('cleanupNoneNotice'));
        }
        return true;
      }
    });

    if (this.app.workspace && typeof this.app.workspace.onLayoutReady === 'function') {
      this.app.workspace.onLayoutReady(() => {
        this.scheduleUpdateAllMarkdownViews();
      });
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.settings.showExcerpt === undefined) {
      this.settings.showExcerpt = true;
    }
    if (typeof this.settings.excerptLength !== 'number' || this.settings.excerptLength < 60 || this.settings.excerptLength > 300) {
      this.settings.excerptLength = 140;
    }
    if (this.settings.activeColor === '#10b981') {
      this.settings.activeColor = '#3b82f6';
    }
    if (!this.settings.customActiveColor) {
      this.settings.customActiveColor = '#3b82f6';
    }
    if (this.settings.enableSound === undefined) {
      this.settings.enableSound = true;
    }
    if (this.settings.soundVolume === undefined) {
      this.settings.soundVolume = 50;
    }
    if (!this.settings.dockPosition) {
      this.settings.dockPosition = 'left';
    }
    if (!this.settings.hierarchyMode) {
      this.settings.hierarchyMode = 'hover-expand';
    }
    if (this.settings.showProgressRail === undefined) {
      this.settings.showProgressRail = false;
    }
    if (this.settings.tooltipGlassmorphism === undefined) {
      this.settings.tooltipGlassmorphism = true;
    }
    if (this.settings.showChapterOrder === undefined) {
      this.settings.showChapterOrder = false;
    }
    if (this.settings.readingBookmarksEnabled === undefined) {
      this.settings.readingBookmarksEnabled = false;
    }
    this.settings.readingState = normalizeReadingState(this.settings.readingState);
    await this.saveSettings();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  ensureReadingState() {
    const state = this.settings?.readingState;
    if (!state || typeof state !== 'object' || Array.isArray(state) || !state.files || typeof state.files !== 'object' || Array.isArray(state.files)) {
      this.settings.readingState = createEmptyReadingState();
    }
    return this.settings.readingState;
  }

  cleanupOrphanedReadingState() {
    const readingState = this.ensureReadingState();
    if (!readingState?.files) return 0;
    let cleanedCount = 0;
    const paths = Object.keys(readingState.files);
    for (const path of paths) {
      const file = this.app?.vault?.getAbstractFileByPath ? this.app.vault.getAbstractFileByPath(path) : null;
      if (!file) {
        delete readingState.files[path];
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.saveSettings().catch(() => {});
    }
    return cleanedCount;
  }

  async pruneDeletedReadingState(deletedPath) {
    if (!deletedPath || typeof deletedPath !== 'string') return 0;
    const readingState = this.ensureReadingState();
    if (!readingState?.files) return 0;

    let removedCount = 0;
    const prefix = deletedPath.endsWith('/') ? deletedPath : `${deletedPath}/`;
    for (const path of Object.keys(readingState.files)) {
      if (path === deletedPath || path.startsWith(prefix)) {
        delete readingState.files[path];
        if (this.resumePromptedPaths && typeof this.resumePromptedPaths.delete === 'function') {
          this.resumePromptedPaths.delete(path);
        }
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.saveSettings();
    }
    return removedCount;
  }

  isReadingBookmarksEnabled() {
    return this.settings?.readingBookmarksEnabled === true;
  }

  resolveActiveColor(activeColor) {
    const color = typeof activeColor === 'string' ? activeColor.trim() : '';
    if (!color) return '#3b82f6';
    if (color === 'custom') {
      return this.settings?.customActiveColor || '#3b82f6';
    }
    if (/^var\(\s*--interactive-accent\s*\)$/i.test(color)) {
      return 'var(--interactive-accent, #3b82f6)';
    }
    return color;
  }

  resolveActiveForeground(activeColor) {
    return resolveReadableForeground(this.resolveActiveColor(activeColor));
  }

  getReadingFileState(fileOrPath, create = false) {
    const path = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath?.path;
    if (!path) return null;

    const readingState = this.ensureReadingState();
    let fileState = readingState.files[path];
    if (!fileState && create) {
      fileState = { markers: {} };
      readingState.files[path] = fileState;
    }
    return fileState || null;
  }

  pruneReadingFileState(fileOrPath) {
    const path = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath?.path;
    if (!path) return;
    const readingState = this.ensureReadingState();
    const fileState = readingState.files[path];
    if (fileState && !fileState.resume && Object.keys(fileState.markers || {}).length === 0) {
      delete readingState.files[path];
    }
  }

  getChapterMarkers(file, chapter) {
    if (!file || !chapter?.id) return null;
    return this.getReadingFileState(file, false)?.markers?.[chapter.id] || null;
  }

  getChapterStatusLabels(file, chapter) {
    if (!this.isReadingBookmarksEnabled()) return [];
    const markers = this.getChapterMarkers(file, chapter);
    if (!markers) return [];

    const labels = [];
    if (markers.revisit) labels.push({ className: 'is-revisit', label: t('revisitLabel') });
    if (markers.important) labels.push({ className: 'is-important', label: t('importantLabel') });
    return labels;
  }

  scheduleReadingStateSave() {
    if (this.readingSaveTimer !== null) {
      clearTimeout(this.readingSaveTimer);
    }
    this.readingSaveTimer = setTimeout(() => {
      this.readingSaveTimer = null;
      this.saveSettings().catch(() => {});
    }, 350);
  }

  isActiveMarkdownView(view) {
    if (!view || !this.app?.workspace?.getActiveViewOfType) return false;
    return this.app.workspace.getActiveViewOfType(MarkdownView) === view;
  }

  isScrollEventRelevant(event, view, container) {
    if (!event || !event.target) return true;
    const target = event.target;

    // Check direct equality
    if (target === container) return true;
    if (view?.containerEl && target === view.containerEl) return true;

    // Check standard DOM contains
    if (container && typeof container.contains === 'function') {
      try {
        if (container.contains(target)) return true;
      } catch (e) {}
    }
    if (view?.containerEl && typeof view.containerEl.contains === 'function') {
      try {
        if (view.containerEl.contains(target)) return true;
      } catch (e) {}
    }

    // Tree walk fallback via parentElement
    let curr = target.parentElement;
    while (curr) {
      if (curr === container || (view?.containerEl && curr === view.containerEl)) {
        return true;
      }
      curr = curr.parentElement;
    }

    // Global target check: only active markdown view processes document/window scroll
    const isGlobalTarget = (
      (typeof document !== 'undefined' && (target === document || target === document.documentElement || target === document.body)) ||
      (typeof window !== 'undefined' && target === window)
    );
    if (isGlobalTarget) {
      return this.isActiveMarkdownView(view);
    }

    // Check if target is an ancestor containing container
    if (typeof target.contains === 'function') {
      try {
        if (target.contains(container)) return true;
      } catch (e) {}
    }

    return false;
  }

  recordReadingPosition(view, chapter) {
    if (!this.isReadingBookmarksEnabled() || !this.isActiveMarkdownView(view) || !view?.file || !chapter?.id) return false;

    const fileState = this.getReadingFileState(view.file, true);
    if (fileState.resume?.chapterId === chapter.id) return false;

    fileState.resume = {
      chapterId: chapter.id,
      title: chapter.title || chapter.rawHeading || '',
      updatedAt: Date.now()
    };
    this.scheduleReadingStateSave();
    return true;
  }

  async getAllChaptersForView(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView?.file) return [];

    const content = await this.app.vault.cachedRead(targetView.file);
    return this.extractAllChapters(content, targetView.file);
  }

  async resumeLastChapter(view) {
    if (!this.isReadingBookmarksEnabled()) return false;
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView?.file) return false;

    const savedResume = this.getReadingFileState(targetView.file, false)?.resume;
    if (!savedResume?.chapterId) {
      this.showNotice(t('resumeUnavailable'));
      return false;
    }

    const chapters = await this.getAllChaptersForView(targetView);
    const targetChapter = chapters.find((chapter) => chapter.id === savedResume.chapterId);
    if (!targetChapter) {
      const fileState = this.getReadingFileState(targetView.file, false);
      if (fileState) {
        delete fileState.resume;
        this.pruneReadingFileState(targetView.file);
        await this.saveSettings();
      }
      this.showNotice(t('resumeNotFound'));
      return false;
    }

    if (this.settings.enableSound !== false) {
      const volume = this.settings.soundVolume !== undefined ? this.settings.soundVolume : 50;
      this.soundEngine.playClick(volume);
    }
    this.jumpToHeading(targetView, targetChapter);
    return true;
  }

  async toggleChapterMarker(view, chapter, markerName) {
    if (!this.isReadingBookmarksEnabled() || !view?.file || !chapter?.id || !['revisit', 'important'].includes(markerName)) return false;

    const fileState = this.getReadingFileState(view.file, true);
    const markers = fileState.markers || (fileState.markers = {});
    const current = markers[chapter.id] || { revisit: false, important: false };
    current[markerName] = !current[markerName];

    if (current.revisit || current.important) {
      markers[chapter.id] = current;
    } else {
      delete markers[chapter.id];
      this.pruneReadingFileState(view.file);
    }

    await this.saveSettings();
    this.updateAllMarkdownViews();
    return current[markerName];
  }

  async toggleCurrentChapterMarker(markerName, view) {
    if (!this.isReadingBookmarksEnabled()) return false;
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView?.file) return false;

    const chapters = await this.getChaptersForView(targetView);
    const activeIndex = this.getActiveChapterIndex(targetView, chapters);
    return activeIndex >= 0 ? this.toggleChapterMarker(targetView, chapters[activeIndex], markerName) : false;
  }

  async clearReadingBookmarks(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView?.file) return false;

    const readingState = this.ensureReadingState();
    delete readingState.files[targetView.file.path];
    await this.saveSettings();
    this.updateAllMarkdownViews();
    this.showNotice(t('readingBookmarksCleared'));
    return true;
  }

  showChapterContextMenu(event, view, chapter) {
    if (!this.isReadingBookmarksEnabled() || !chapter) return;
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();

    const markers = this.getChapterMarkers(view?.file, chapter) || {};
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(markers.revisit ? t('removeRevisitMark') : t('markForRevisit'))
      .onClick(() => this.toggleChapterMarker(view, chapter, 'revisit')));
    menu.addItem((item) => item
      .setTitle(markers.important ? t('removeImportantMark') : t('markImportant'))
      .onClick(() => this.toggleChapterMarker(view, chapter, 'important')));
    if (markers.revisit || markers.important) {
      menu.addItem((item) => item
        .setTitle(t('clearChapterBookmarks'))
        .onClick(() => this.clearChapterMarkers(view, chapter)));
    }
    menu.showAtMouseEvent(event);
  }

  async clearChapterMarkers(view, chapter) {
    if (!view?.file || !chapter?.id) return false;
    const fileState = this.getReadingFileState(view.file, false);
    if (!fileState?.markers?.[chapter.id]) return false;
    delete fileState.markers[chapter.id];
    this.pruneReadingFileState(view.file);
    await this.saveSettings();
    this.updateAllMarkdownViews();
    return true;
  }

  mergeReadingFileStates(destinationState, sourceState) {
    const merged = { markers: {} };
    const states = [destinationState, sourceState].filter(Boolean);
    for (const state of states) {
      for (const [chapterId, marker] of Object.entries(state.markers || {})) {
        const current = merged.markers[chapterId] || { revisit: false, important: false };
        current.revisit = current.revisit || marker.revisit === true;
        current.important = current.important || marker.important === true;
        merged.markers[chapterId] = current;
      }
    }

    const destinationResume = destinationState?.resume;
    const sourceResume = sourceState?.resume;
    if (destinationResume || sourceResume) {
      const newerSource = sourceResume && (!destinationResume || sourceResume.updatedAt > destinationResume.updatedAt);
      merged.resume = newerSource ? sourceResume : destinationResume;
    }
    return merged;
  }

  async migrateReadingState(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return false;
    const readingState = this.ensureReadingState();
    const sourceState = readingState.files[oldPath];
    if (!sourceState) return false;

    readingState.files[newPath] = this.mergeReadingFileStates(readingState.files[newPath], sourceState);
    delete readingState.files[oldPath];
    await this.saveSettings();
    return true;
  }

  maybeShowResumeNotice(view, content, file) {
    if (!this.isReadingBookmarksEnabled() || !this.isActiveMarkdownView(view) || !file?.path || this.resumePromptedPaths.has(file.path)) return;
    const savedResume = this.getReadingFileState(file, false)?.resume;
    if (!savedResume?.chapterId) return;

    this.resumePromptedPaths.add(file.path);
    const chapter = this.extractAllChapters(content, file).find((item) => item.id === savedResume.chapterId);
    if (chapter) {
      this.showNotice(t('resumeAvailable', { title: chapter.title || savedResume.title }));
    }
  }

  showNotice(message, timeout = 6000) {
    if (typeof Notice === 'function') {
      new Notice(message, timeout);
    }
  }

  scheduleUpdateAllMarkdownViews() {
    this.updateAllMarkdownViews();

    if (this.refreshFrame !== null) {
      cancelAnimationFrame(this.refreshFrame);
    }
    this.refreshFrame = this.scheduleFrame(() => {
      this.refreshFrame = null;
      this.updateAllMarkdownViews();
    });

    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.updateAllMarkdownViews();
    }, 180);
  }

  updateAllMarkdownViews() {
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    leaves.forEach((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        this.attachStepperToView(leaf.view);
      }
    });
  }

  extractChapters(content, file, parserSettings = this.settings) {
    const fileCache = this.app.metadataCache.getFileCache(file);
    let headings = fileCache ? fileCache.headings || [] : [];

    // 若缓存尚未就绪，使用正则极速从正文提取标题作为保底，确保任何模式百分百加载
    if (!headings || headings.length === 0) {
      headings = [];
      const lines = content ? content.split(/\r?\n/) : [];
      let inCodeBlock = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
          inCodeBlock = !inCodeBlock;
          continue;
        }
        if (inCodeBlock) continue;
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headings.push({
            heading: match[2].trim(),
            level: match[1].length,
            position: {
              start: { line: i, col: 0, offset: 0 },
              end: { line: i, col: line.length, offset: 0 }
            }
          });
        }
      }
    }

    const filePath = file?.path || '';
    const revision = this.documentRevisions.get(filePath) || 0;
    const mtime = Number(file?.stat?.mtime) || 0;
    const signatureIndexes = headings.length <= 64
      ? headings.map((_heading, index) => index)
      : [0, Math.floor(headings.length / 2), headings.length - 1];
    const headingSignature = signatureIndexes
      .map((index) => {
        const heading = headings[index];
        return `${heading.level}:${heading.heading}:${heading.position?.start?.line}`;
      })
      .join('\u0001');
    const cacheKey = [
      filePath,
      mtime,
      revision,
      parserSettings?.minHeadingLevel,
      parserSettings?.maxHeadingLevel,
      parserSettings?.ignoreFirstH1,
      parserSettings?.showExcerpt,
      parserSettings?.excerptLength,
      headings.length,
      headingSignature,
      content?.length || 0
    ].join('|');
    const cached = this.chapterCache?.get(cacheKey);
    if (cached) return cached;
    const parsed = ChapterParser.parse(content, headings, parserSettings);
    this.chapterCache?.set(cacheKey, parsed);
    return parsed;
  }

  extractAllChapters(content, file) {
    const allHeadingSettings = Object.assign({}, this.settings, {
      minHeadingLevel: 1,
      maxHeadingLevel: 6,
      ignoreFirstH1: false
    });
    return this.extractChapters(content, file, allHeadingSettings);
  }

  async getChaptersForView(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView || !targetView.file) return [];

    const file = targetView.file;
    const content = await this.app.vault.cachedRead(file);
    return this.extractChapters(content, file);
  }

  getActiveChapterIndex(view, chapters) {
    if (!chapters || chapters.length === 0) return -1;
    const container = view?.contentEl;
    const currentLine = this.getCurrentEditorTopLine(view, container, chapters);
    let activeIdx = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].line <= currentLine + 2) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }

  async jumpToPreviousChapter(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView) return;

    const chapters = await this.getChaptersForView(targetView);
    if (!chapters || chapters.length === 0) return;

    const activeIdx = this.getActiveChapterIndex(targetView, chapters);
    const prevIdx = Math.max(0, activeIdx - 1);
    const targetChapter = chapters[prevIdx];
    if (targetChapter) {
      if (this.settings.enableSound !== false) {
        const vol = this.settings.soundVolume !== undefined ? this.settings.soundVolume : 50;
        this.soundEngine.playClick(vol);
      }
      this.jumpToHeading(targetView, targetChapter);
    }
  }

  async jumpToNextChapter(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView) return;

    const chapters = await this.getChaptersForView(targetView);
    if (!chapters || chapters.length === 0) return;

    const activeIdx = this.getActiveChapterIndex(targetView, chapters);
    const nextIdx = Math.min(chapters.length - 1, activeIdx + 1);
    const targetChapter = chapters[nextIdx];
    if (targetChapter) {
      if (this.settings.enableSound !== false) {
        const vol = this.settings.soundVolume !== undefined ? this.settings.soundVolume : 50;
        this.soundEngine.playClick(vol);
      }
      this.jumpToHeading(targetView, targetChapter);
    }
  }

  async openChapterPalette(view) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView) return null;

    const chapters = await this.getChaptersForView(targetView);
    if (!chapters || chapters.length === 0) return null;

    const modal = new ChapterSuggestModal(this.app, this, targetView, chapters);
    modal.open();
    return modal;
  }

  async attachStepperToView(view) {
    if (!view || !view.file) return;

    const container = view.contentEl;
    if (!container) return;

    const renderVersion = (this.renderVersions.get(view) || 0) + 1;
    this.renderVersions.set(view, renderVersion);

    this.observeViewContainer(view, container);

    const existing = container.querySelector('.codex-stepper-container');
    if (existing) existing.remove();

    const oldTooltip = this.viewTooltips.get(view);
    if (oldTooltip) {
      oldTooltip.remove();
      this.viewTooltips.delete(view);
    }

    if (this.observers.has(container)) {
      this.observers.get(container).disconnect();
      this.observers.delete(container);
    }

    if (this.scrollBindings.has(container)) {
      const binding = this.scrollBindings.get(container);
      const boundScrollers = binding?.scrollers || (binding?.scroller ? [binding.scroller] : []);
      if (binding?.handler) {
        boundScrollers.forEach((scroller) => scroller?.removeEventListener?.('scroll', binding.handler, true));
      }
      this.scrollBindings.delete(container);
    }

    const file = view.file;
    const content = await this.app.vault.cachedRead(file);
    if (this.renderVersions.get(view) !== renderVersion) {
      return;
    }
    const chapters = this.extractChapters(content, file);
    this.viewChapterSnapshots.set(view, chapters);
    this.maybeShowResumeNotice(view, content, file);
    if (chapters.length === 0) return;

    // 1. 创建散落横线容器
    const stepperContainer = container.createDiv({ cls: 'codex-stepper-container' });
    stepperContainer.setAttribute('role', 'navigation');
    stepperContainer.setAttribute('aria-label', 'Chapter navigation');
    if (this.settings.dockPosition === 'right') {
      stepperContainer.classList.add('dock-right');
    }
    const hierarchyMode = this.settings.hierarchyMode || 'all';
    stepperContainer.classList.add(`hierarchy-mode-${hierarchyMode}`);
    if (this.settings.showChapterOrder === true) {
      stepperContainer.classList.add('show-chapter-order');
    }
    const activeColor = this.resolveActiveColor(this.settings.activeColor);
    stepperContainer.style.setProperty('--codex-active-color', activeColor);
    stepperContainer.style.setProperty('--codex-active-foreground', this.resolveActiveForeground(this.settings.activeColor));
    const track = stepperContainer.createDiv({ cls: 'codex-stepper-track' });
    track.classList.add(`hierarchy-mode-${hierarchyMode}`);

    let railEl = null;
    let railIndicator = null;
    if (this.settings.showProgressRail === true) {
      railEl = track.createDiv({ cls: 'codex-progress-rail' });
      railIndicator = railEl.createDiv({ cls: 'codex-progress-indicator' });
    }

    const count = chapters.length;

    // 2. 创建悬浮章节名独立气泡浮层（挂载到当前容器所在文档的 body，多窗口/多分屏完美隔离）
    const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const targetBody = doc ? (doc.body || doc) : (typeof document !== 'undefined' ? document.body : null);
    const floatingTooltip = (targetBody && typeof targetBody.createDiv === 'function')
      ? targetBody.createDiv({ cls: 'codex-floating-tooltip' })
      : ((doc && typeof doc.createElement === 'function')
        ? (() => {
            const el = doc.createElement('div');
            el.className = 'codex-floating-tooltip';
            if (targetBody && typeof targetBody.appendChild === 'function') {
              targetBody.appendChild(el);
            }
            return el;
          })()
        : (typeof document !== 'undefined' && document.body?.createDiv ? document.body.createDiv({ cls: 'codex-floating-tooltip' }) : null));

    let tooltipId = null;
    if (floatingTooltip) {
      this.viewTooltips.set(view, floatingTooltip);
      tooltipId = `codex-tooltip-${++this.tooltipCounter}`;
      floatingTooltip.setAttribute('id', tooltipId);
      floatingTooltip.setAttribute('role', 'tooltip');
      floatingTooltip.setAttribute('aria-hidden', 'true');
      floatingTooltip.style.setProperty('--codex-active-color', activeColor);
      floatingTooltip.style.setProperty('--codex-active-foreground', this.resolveActiveForeground(this.settings.activeColor));
      if (this.settings.tooltipGlassmorphism === false) {
        floatingTooltip.classList.add('is-solid');
      }
    }

    // 3. 动态留白空间感知与绝对防触碰正文计算
    const updateGutterDimensions = () => {
      const containerWidth = container.clientWidth || 0;
      const threshold = Number.isFinite(this.settings.narrowThreshold) ? this.settings.narrowThreshold : 600;

      if (containerWidth > 0 && containerWidth < threshold) {
        stepperContainer.classList.add('is-narrow');
        if (floatingTooltip) floatingTooltip.classList.remove('is-visible');
        return;
      }

      stepperContainer.classList.remove('is-narrow');

      // 寻找实际正文 Sizer（编辑视图 .cm-sizer 或阅读视图 .markdown-preview-sizer）
      const sizer = container.querySelector('.cm-sizer') || container.querySelector('.markdown-preview-sizer');
      let gutter = 0;
      const isRightDock = this.settings.dockPosition === 'right';

      if (sizer && typeof sizer.getBoundingClientRect === 'function') {
        const containerRect = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : { left: 0, right: containerWidth };
        const sizerRect = sizer.getBoundingClientRect();
        if (isRightDock) {
          const containerRight = (containerRect.right !== undefined) ? containerRect.right : (containerRect.left + containerWidth);
          gutter = Math.max(0, containerRight - sizerRect.right);
        } else {
          gutter = Math.max(0, sizerRect.left - containerRect.left);
        }
      }

      // 如果未探测到有效正文 Sizer（例如 0），基于容器宽度估算留白
      if (gutter <= 0 && containerWidth > 0) {
        gutter = Math.max(30, (containerWidth - 650) / 2);
      }

      // 留白越大横线越长（范围 16px ~ 38px，悬浮 22px ~ 44px）
      const h1Width = Math.max(16, Math.min(38, Math.round(gutter * 0.35) || 18));
      const h1Hover = Math.min(h1Width + 5, Math.max(20, (gutter > 30 ? gutter - 12 : 24)));

      const w1 = h1Width;
      const w2 = Math.max(9, Math.round(h1Width * 0.60));
      const w3 = Math.max(5, Math.round(h1Width * 0.35));
      const w4 = Math.max(3, Math.round(h1Width * 0.20));

      const hw1 = h1Hover;
      const hw2 = Math.max(12, Math.round(h1Hover * 0.65));
      const hw3 = Math.max(8, Math.round(h1Hover * 0.45));
      const hw4 = Math.max(4, Math.round(h1Hover * 0.25));

      stepperContainer.style.setProperty('--dash-w1', `${w1}px`);
      stepperContainer.style.setProperty('--dash-w2', `${w2}px`);
      stepperContainer.style.setProperty('--dash-w3', `${w3}px`);
      stepperContainer.style.setProperty('--dash-w4', `${w4}px`);

      // 动态垂直空间感知与自适应紧凑度计算（防止大量章节或 hover 展开时超出视口）
      const containerHeight = container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);
      const availableHeight = Math.max(100, containerHeight - 64);
      const totalCount = count || 1;
      const nominalItemHeight = 18;
      let itemGap = 5;
      let itemPaddingY = 3;
      let itemMinHeight = 10;

      if (totalCount * nominalItemHeight > availableHeight) {
        const itemBudget = availableHeight / totalCount;
        itemGap = Math.max(1, Math.min(3, Math.floor(itemBudget * 0.2)));
        itemPaddingY = Math.max(0.5, Math.min(2.5, (itemBudget - itemGap - 4) / 2));
        itemMinHeight = Math.max(3, Math.min(8, Math.floor(itemBudget - itemGap - itemPaddingY * 2)));
      } else {
        if (totalCount > 30) itemGap = 2;
        else if (totalCount > 20) itemGap = 3;
        else if (totalCount > 10) itemGap = 4;
        else itemGap = 5;
        itemPaddingY = 3;
        itemMinHeight = 10;
      }

      stepperContainer.style.setProperty('--dash-item-gap', `${itemGap}px`);
      stepperContainer.style.setProperty('--dash-item-padding-y', `${itemPaddingY}px`);
      stepperContainer.style.setProperty('--dash-item-min-height', `${itemMinHeight}px`);
      track.style.gap = `${itemGap}px`;

      stepperContainer.style.setProperty('--dash-hover-w1', `${hw1}px`);
      stepperContainer.style.setProperty('--dash-hover-w2', `${hw2}px`);
      stepperContainer.style.setProperty('--dash-hover-w3', `${hw3}px`);
      stepperContainer.style.setProperty('--dash-hover-w4', `${hw4}px`);
    };

    updateGutterDimensions();

    let resizeRaf = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) return;
      resizeRaf = this.scheduleFrame(() => {
        updateGutterDimensions();
        resizeRaf = null;
      });
    });
    resizeObserver.observe(container);
    this.observers.set(container, resizeObserver);

    const dashElements = [];
    let isClickScrolling = false;
    let clickTimeout = null;

    const measureRailIndicator = (idx) => {
      if (!railIndicator) return null;
      const total = chapters.length;
      if (total <= 1) {
        return '100%';
      }
      const activeItem = dashElements[idx];
      if (activeItem && typeof activeItem.offsetTop === 'number' && activeItem.offsetTop > 0) {
        const targetHeight = activeItem.offsetTop + (activeItem.offsetHeight || 10) / 2;
        return `${targetHeight}px`;
      }
      const pct = Math.round((idx / (total - 1)) * 100);
      return `${pct}%`;
    };

    const applyRailIndicator = (height) => {
      if (railIndicator && height) railIndicator.style.height = height;
    };

    const updateRailIndicator = (idx) => {
      // Keep the legacy helper for callers, but perform its geometry read before
      // the next batch of class/style writes whenever possible.
      applyRailIndicator(measureRailIndicator(idx));
    };

    chapters.forEach((chap, i) => {
      const dashItem = track.createDiv({
        cls: `codex-dash-item level-${Math.min(chap.level, 6)}`,
        attr: {
          'data-line': chap.line,
          'data-chapter-order': String(i + 1)
        }
      });

      // 散落横线条
      dashItem.createSpan({ cls: 'codex-dash-bar' });

      const bookmarkStatuses = this.getChapterStatusLabels(file, chap);
      if (bookmarkStatuses.length > 0) {
        dashItem.classList.add('has-bookmarks');
        const statusText = bookmarkStatuses.map((status) => status.label).join(', ');
        dashItem.setAttribute('aria-label', t('chapterStatus', { title: chap.title, statuses: statusText }));
        const markerEl = dashItem.createSpan({ cls: 'codex-bookmark-markers', attr: { 'aria-hidden': 'true' } });
        bookmarkStatuses.forEach((status) => {
          markerEl.createSpan({ cls: `codex-bookmark-marker ${status.className}` });
        });
      } else {
        dashItem.setAttribute('aria-label', chap.title || chap.rawHeading || `H${chap.level}`);
      }

      // 鼠标悬浮与键盘焦点：横线屏幕绝对中心点 100% 对齐气泡垂直几何中心
      const showTooltip = () => {
        if (!floatingTooltip) return;

        // 1. 先清空并完整渲染气泡 DOM，确保获取真实的几何尺寸（尤其是包含长公式或摘要时）
        floatingTooltip.empty();

        // 标题区（头部容器：Linear 风格微胶囊徽章 + 加粗标题，当前激活章节高亮，支持行内公式）
        const headerEl = floatingTooltip.createDiv({ cls: 'codex-tooltip-header' });
        const isActive = dashItem.classList.contains('active');
        const badgeCls = `codex-level-badge level-${Math.min(chap.level, 6)}${isActive ? ' is-active' : ''}`;
        headerEl.createSpan({
          cls: badgeCls,
          text: `H${chap.level}`
        });
        const titleEl = headerEl.createDiv({ cls: 'codex-tooltip-title' });
        MarkdownRenderer.render(this.app, formatTitleForRender(chap.title), titleEl, '', this);

        // 正文 3 行纯文本摘要（支持 KaTeX 公式渲染，彻底过滤 Callout 容器）
        if (this.settings.showExcerpt !== false && chap.summaryMarkdown) {
          const excerptEl = floatingTooltip.createDiv({ cls: 'codex-tooltip-excerpt' });
          MarkdownRenderer.render(this.app, chap.summaryMarkdown, excerptEl, '', this);
        }

        const statuses = this.getChapterStatusLabels(file, chap);
        if (statuses.length > 0) {
          const statusEl = floatingTooltip.createDiv({ cls: 'codex-tooltip-bookmark-status' });
          statuses.forEach((status) => {
            statusEl.createSpan({ cls: `codex-bookmark-label ${status.className}`, text: status.label });
          });
        }

        // 2. 在渲染完成后测量元素真实尺寸
        const tooltipWidth = floatingTooltip.offsetWidth || 290;
        const tooltipHeight = floatingTooltip.offsetHeight || 140;

        // 3. 计算横线条几何中点及视口边界限制
        const itemRect = dashItem.getBoundingClientRect();
        const centerY = itemRect.top + (itemRect.height / 2);
        const isRightDock = this.settings.dockPosition === 'right';

        const targetWindow = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
        const winWidth = (targetWindow && targetWindow.innerWidth) ? targetWindow.innerWidth : 1200;
        const winHeight = (targetWindow && targetWindow.innerHeight) ? targetWindow.innerHeight : 800;

        let leftX;
        if (isRightDock) {
          floatingTooltip.classList.add('dock-right');
          leftX = Math.max(10, itemRect.left - tooltipWidth - 12);
        } else {
          floatingTooltip.classList.remove('dock-right');
          leftX = Math.min(winWidth - tooltipWidth - 10, itemRect.right + 12);
        }

        const minCenterY = tooltipHeight / 2 + 12;
        const maxCenterY = winHeight - tooltipHeight / 2 - 12;
        let clampedY;
        if (minCenterY > maxCenterY) {
          clampedY = winHeight / 2;
        } else {
          clampedY = Math.max(minCenterY, Math.min(maxCenterY, centerY));
        }

        // 4. 设置最终坐标并展现气泡
        floatingTooltip.style.top = `${clampedY}px`;
        floatingTooltip.style.left = `${leftX}px`;

        if (this.settings.tooltipGlassmorphism === false) {
          floatingTooltip.classList.add('is-solid');
        } else {
          floatingTooltip.classList.remove('is-solid');
        }

        floatingTooltip.classList.add('is-visible');
        floatingTooltip.setAttribute('aria-hidden', 'false');
      };

      const hideTooltip = () => {
        if (floatingTooltip) {
          floatingTooltip.classList.remove('is-visible');
          floatingTooltip.setAttribute('aria-hidden', 'true');
        }
      };

      dashItem.addEventListener('mouseenter', showTooltip);
      dashItem.addEventListener('mouseleave', hideTooltip);
      dashItem.addEventListener('focus', showTooltip);
      dashItem.addEventListener('blur', hideTooltip);
      dashItem.addEventListener('pointerdown', (event) => {
        if (event?.pointerType === 'touch') showTooltip();
      }, { passive: true });
      dashItem.addEventListener('touchstart', showTooltip, { passive: true });
      if (tooltipId) dashItem.setAttribute('aria-describedby', tooltipId);

      const navigateToChapter = () => {
        isClickScrolling = true;
        if (clickTimeout) clearTimeout(clickTimeout);

        const railHeight = measureRailIndicator(i);
        dashElements.forEach(d => d.classList.remove('active'));
        dashItem.classList.add('active');
        updateHierarchyFolding(chapters, dashElements, i, this.settings.hierarchyMode);
        applyRailIndicator(railHeight);

        // 触发清脆机械微动按键音
        if (this.settings.enableSound !== false) {
          const vol = this.settings.soundVolume !== undefined ? this.settings.soundVolume : 50;
          this.soundEngine.playClick(vol);
        }

        this.recordReadingPosition(view, chap);
        this.jumpToHeading(view, chap);

        clickTimeout = setTimeout(() => {
          isClickScrolling = false;
        }, 600);
      };

      // 点击横线：拟物微动音效 + 纯净置顶平滑跳转
      dashItem.addEventListener('click', (e) => {
        if (e?.stopPropagation) e.stopPropagation();
        navigateToChapter();
      });

      dashItem.setAttribute('role', 'button');
      dashItem.setAttribute('tabindex', '0');
      dashItem.addEventListener('keydown', (e) => {
        if (e?.key === 'Escape') {
          hideTooltip();
          return;
        }
        if (e?.key !== 'Enter' && e?.key !== ' ') return;
        if (e?.preventDefault) e.preventDefault();
        navigateToChapter();
      });

      dashItem.addEventListener('contextmenu', (e) => {
        this.showChapterContextMenu(e, view, chap);
      });

      dashElements.push(dashItem);
    });

    // 4. 基于真实行号与 120 FPS rAF 硬件加速节流
    let rAF = null;
    let previousActiveIdx = -1;
    let lastScrollTop = null;
    const scrollThreshold = 2;
    const updateActiveByRealLine = () => {
      if (isClickScrolling) return;

      const currentLine = this.getCurrentEditorTopLine(view, container, chapters);
      
      let activeIdx = 0;
      for (let i = 0; i < chapters.length; i++) {
        if (chapters[i].line <= currentLine + 2) {
          activeIdx = i;
        } else {
          break;
        }
      }
      // 滚动跨越新章节时触发机械转轮刻度轻音
      if (activeIdx !== previousActiveIdx) {
        if (previousActiveIdx !== -1) {
          if (this.settings.enableSound !== false) {
            const vol = this.settings.soundVolume !== undefined ? this.settings.soundVolume : 50;
            this.soundEngine.playScrollTick(vol);
          }
          this.recordReadingPosition(view, chapters[activeIdx]);
        }
        previousActiveIdx = activeIdx;
      }

      const railHeight = measureRailIndicator(activeIdx);
      dashElements.forEach((el, i) => {
        if (i === activeIdx) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });

      updateHierarchyFolding(chapters, dashElements, activeIdx, this.settings.hierarchyMode);
      applyRailIndicator(railHeight);
    };

    const throttledScroll = (event) => {
      if (!this.isScrollEventRelevant(event, view, container)) {
        return;
      }
      if (this.app?.workspace?.getActiveViewOfType
        && this.app.workspace.getActiveViewOfType(MarkdownView)
        && !this.isActiveMarkdownView(view)) {
        return;
      }
      const eventScrollTop = Number(event?.target?.scrollTop);
      if (Number.isFinite(eventScrollTop)) {
        if (lastScrollTop !== null && Math.abs(eventScrollTop - lastScrollTop) < scrollThreshold) return;
        lastScrollTop = eventScrollTop;
      }
      if (rAF) return;
      let executed = false;
      rAF = this.scheduleFrame(() => {
        executed = true;
        updateActiveByRealLine();
        rAF = null;
      });
      if (executed) {
        rAF = null;
      }
    };

    updateActiveByRealLine();

    const scrollers = this.getViewScrollers(container, view);
    if (scrollers.length > 0) {
      // `scroll` does not bubble. Capture it from every known view ancestor so
      // active tracking still updates when a theme or Obsidian version moves
      // the actual scroll owner inside that chain.
      scrollers.forEach((scroller) => scroller.addEventListener('scroll', throttledScroll, { passive: true, capture: true }));
      this.scrollBindings.set(container, { scrollers, handler: throttledScroll });
    }

    // Explicit compatibility contract for the typed production session. Keep
    // legacy rendering internals private instead of making typed code recover
    // the same resources through maps and DOM selectors.
    return {
      hostContainer: container,
      chapters,
      stepperElement: stepperContainer,
      dashElements,
      tooltipElement: floatingTooltip,
      railIndicator,
      trackingContainer: scrollers[0] || this.getViewScroller(container, view) || null,
      releaseLegacyScrollTracking: () => {
        scrollers.forEach((scroller) => scroller?.removeEventListener?.('scroll', throttledScroll, true));
        const currentBinding = this.scrollBindings.get(container);
        if (currentBinding?.handler === throttledScroll) this.scrollBindings.delete(container);
      },
      mode: this.isReadingMode(view, container) ? 'reading' : 'live-preview'
    };
  }

  isReadingMode(view, container = null) {
    const mode = view?.getMode ? view.getMode() : view?.currentMode?.type;
    if (mode === 'preview' || mode === 'reading' || mode === 'read') return true;
    if (mode) return false;
    // Keep working across Obsidian releases that rename the public mode while
    // retaining the Reading View DOM structure.
    return Boolean(container?.querySelector?.('.markdown-preview-view')) && !container?.querySelector?.('.cm-editor');
  }

  getViewScrollers(container, view = null) {
    if (!container) return [];
    const scrollers = [];
    const addScroller = (element) => {
      if (element && typeof element.addEventListener === 'function' && !scrollers.includes(element)) {
        scrollers.push(element);
      }
    };

    if (!this.isReadingMode(view, container)) {
      addScroller(container.querySelector('.cm-scroller'));
      return scrollers;
    }

    const preview = container.querySelector('.markdown-preview-view');
    const readingView = container.querySelector('.markdown-reading-view');
    addScroller(preview);
    addScroller(readingView);
    addScroller(container);

    // Obsidian has used both the preview element and its view-content parent as
    // the scroll owner. Bind the short ancestor chain so a theme/layout change
    // cannot leave the active dash stuck on the opening chapter.
    let ancestor = container.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth += 1) {
      addScroller(ancestor);
      ancestor = ancestor.parentElement;
    }

    // Reading View may be re-parented by a layout/theme plugin. In that case
    // the scroll owner can sit outside the short view ancestor chain. A
    // capture listener on the document sees those native scroll events too,
    // while the rAF throttle in attachStepperToView keeps the work bounded.
    if (typeof document !== 'undefined') addScroller(document);

    return scrollers;
  }

  getViewScroller(container, view = null) {
    const scrollers = this.getViewScrollers(container, view);
    if (scrollers.length === 0) return null;
    const activeScroller = scrollers.find((scroller) => (Number(scroller.scrollTop) || 0) > 0);
    if (activeScroller) return activeScroller;
    return scrollers.find((scroller) => {
      const scrollHeight = Number(scroller.scrollHeight) || 0;
      const clientHeight = Number(scroller.clientHeight) || 0;
      return scrollHeight > clientHeight + 1;
    }) || scrollers[0];
  }

  clearFlashHighlights(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    const flashEls = container.querySelectorAll('.is-flashing, .flashing, .is-highlighted, .highlighted, .mod-highlighted');
    for (let i = 0; i < flashEls.length; i++) {
      const el = flashEls[i];
      if (!el || !el.classList) continue;
      // Protect user <mark> and .cm-highlight elements (and any elements inside them)
      const isMark = (el.tagName && el.tagName.toLowerCase() === 'mark') || el.classList.contains('cm-highlight');
      const insideMark = typeof el.closest === 'function' && (el.closest('mark') || el.closest('.cm-highlight'));
      if (isMark || insideMark) {
        continue;
      }
      el.classList.remove('is-flashing', 'flashing', 'is-highlighted', 'highlighted', 'mod-highlighted');
    }
  }

  observeViewContainer(view, container) {
    if (this.viewObservers.has(container) || typeof MutationObserver === 'undefined') return;

    let refreshQueued = false;
    let clearFlashQueued = false;
    const observer = new MutationObserver(() => {
      if (!clearFlashQueued) {
        clearFlashQueued = true;
        this.scheduleFrame(() => {
          clearFlashQueued = false;
          this.clearFlashHighlights(container);
        });
      }
      if (refreshQueued || container.querySelector('.codex-stepper-container')) return;
      if (!this.getViewScroller(container, view)) return;

      refreshQueued = true;
      this.scheduleFrame(() => {
        refreshQueued = false;
        if (!container.querySelector('.codex-stepper-container')) {
          this.attachStepperToView(view);
        }
      });
    });

    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    this.viewObservers.set(container, observer);
  }

  getReadingHeading(view, chap) {
    if (!view || !chap) return null;
    const scroller = view.contentEl?.querySelector('.markdown-preview-view');
    if (!scroller) return null;

    const renderedHeadings = Array.from(scroller.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter((el) => {
        if (el.classList && el.classList.contains('inline-title')) return false;
        if (typeof el.closest === 'function') {
          return !el.closest('.internal-embed, .markdown-embed, .markdown-embed-content, .popover, .codex-floating-tooltip, .mod-header');
        }
        return true;
      });

    const targetTag = chap.level ? `H${chap.level}`.toUpperCase() : null;
    const cleanNorm = normalizeHeadingText(chap.title);
    const rawNorm = normalizeHeadingText(chap.rawHeading || chap.title);

    // 1. 优先：通过包含目标行号的 section 精确匹配
    if (chap.line !== undefined) {
      const section = scroller.querySelector(`.markdown-preview-section[data-line="${chap.line}"]`);
      if (section) {
        const headingsInSection = Array.from(section.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .filter(h => !h.classList.contains('inline-title') && !h.closest('.internal-embed, .markdown-embed'));
        if (headingsInSection.length > 0) {
          const exact = headingsInSection.find(h => {
            const tagMatch = !targetTag || h.tagName.toUpperCase() === targetTag;
            const dataNorm = normalizeHeadingText(h.getAttribute('data-heading'));
            const textNorm = normalizeHeadingText(h.textContent);
            return tagMatch && ((dataNorm && (dataNorm === cleanNorm || dataNorm === rawNorm)) ||
                                (textNorm && (textNorm === cleanNorm || textNorm === rawNorm)));
          });
          if (exact) return exact;
          const tagOnly = targetTag ? headingsInSection.find(h => h.tagName.toUpperCase() === targetTag) : null;
          if (tagOnly) return tagOnly;
          return headingsInSection[0];
        }
        return section;
      }

      const byLine = renderedHeadings.find((heading) => {
        const lineAttr = heading.getAttribute('data-line') || heading.getAttribute('data-heading-line') || (typeof heading.closest === 'function' ? heading.closest('[data-line]')?.getAttribute('data-line') : null);
        return lineAttr !== null && parseInt(lineAttr, 10) === chap.line;
      });
      if (byLine) return byLine;
    }

    // 2. 层级严格匹配 (H2/H3/...) + 归一化文本完全对齐
    if (targetTag && (cleanNorm || rawNorm)) {
      const matchExact = renderedHeadings.find((h) => {
        const tag = (h.tagName || '').toUpperCase();
        if (tag !== targetTag) return false;
        const dataNorm = normalizeHeadingText(h.getAttribute('data-heading'));
        const textNorm = normalizeHeadingText(h.textContent);
        return (dataNorm && (dataNorm === cleanNorm || dataNorm === rawNorm)) ||
               (textNorm && (textNorm === cleanNorm || textNorm === rawNorm));
      });
      if (matchExact) return matchExact;
    }

    // 3. 层级严格匹配 + 子串包含对齐
    if (targetTag && cleanNorm) {
      const matchPartial = renderedHeadings.find((h) => {
        const tag = (h.tagName || '').toUpperCase();
        if (tag !== targetTag) return false;
        const dataNorm = normalizeHeadingText(h.getAttribute('data-heading'));
        const textNorm = normalizeHeadingText(h.textContent);
        const matchData = Boolean(dataNorm) && (dataNorm.includes(cleanNorm) || cleanNorm.includes(dataNorm));
        const matchText = Boolean(textNorm) && (textNorm.includes(cleanNorm) || cleanNorm.includes(textNorm));
        return matchData || matchText;
      });
      if (matchPartial) return matchPartial;
    }

    // 4. 不限层级的归一化文本完全匹配
    if (cleanNorm || rawNorm) {
      const byExactText = renderedHeadings.find((h) => {
        const dataNorm = normalizeHeadingText(h.getAttribute('data-heading'));
        const textNorm = normalizeHeadingText(h.textContent);
        return (dataNorm && (dataNorm === cleanNorm || dataNorm === rawNorm)) ||
               (textNorm && (textNorm === cleanNorm || textNorm === rawNorm));
      });
      if (byExactText) return byExactText;
    }

    // 5. 不限层级的子串包含匹配
    if (cleanNorm) {
      const byPartialText = renderedHeadings.find((h) => {
        const dataNorm = normalizeHeadingText(h.getAttribute('data-heading'));
        const textNorm = normalizeHeadingText(h.textContent);
        return (Boolean(dataNorm) && (dataNorm.includes(cleanNorm) || cleanNorm.includes(dataNorm))) ||
               (Boolean(textNorm) && (textNorm.includes(cleanNorm) || cleanNorm.includes(textNorm)));
      });
      if (byPartialText) return byPartialText;
    }

    // 6. 保底：headingIndex 匹配
    if (Number.isInteger(chap.headingIndex) && renderedHeadings[chap.headingIndex]) {
      return renderedHeadings[chap.headingIndex];
    }

    return null;
  }

  getReadingSectionLineAtBaseline(view, container, chapters = []) {
    const previewRoot = view?.contentEl?.querySelector('.markdown-preview-view');
    const scroller = this.getViewScroller(container, view) || previewRoot;
    const domDocument = typeof document !== 'undefined' ? document : null;
    if (!previewRoot || !scroller || !domDocument || typeof domDocument.elementsFromPoint !== 'function') return null;

    const viewportRect = scroller.getBoundingClientRect();
    const previewRect = previewRoot.getBoundingClientRect();
    const left = Math.max(viewportRect.left + 16, previewRect.left + 40);
    const right = Math.min(viewportRect.right - 16, previewRect.right - 40);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;

    const y = viewportRect.top + 70;
    const xPositions = [0.2, 0.5, 0.8].map((ratio) => left + ((right - left) * ratio));
    const isInsidePreview = (element) => {
      let current = element;
      while (current) {
        if (current === previewRoot) return true;
        current = current.parentElement;
      }
      return false;
    };
    const findSection = (element) => {
      let current = element;
      while (current && current !== previewRoot) {
        const isPreviewSection = current.classList?.contains?.('markdown-preview-section');
        const line = isPreviewSection ? parseInt(current.getAttribute?.('data-line'), 10) : NaN;
        if (Number.isInteger(line)) return line;
        current = current.parentElement;
      }
      return null;
    };

    for (const x of xPositions) {
      const elements = domDocument.elementsFromPoint(x, y) || [];
      for (const element of elements) {
        if (!isInsidePreview(element)) continue;
        const sectionLine = findSection(element);
        if (!Number.isInteger(sectionLine)) continue;

        let chapterLine = null;
        for (const chapter of chapters) {
          if (chapter.line <= sectionLine) chapterLine = chapter.line;
          else break;
        }
        return chapterLine;
      }
    }

    return null;
  }

  getVisibleReadingHeadingLine(view, container, chapters = []) {
    const previewRoot = view?.contentEl?.querySelector('.markdown-preview-view');
    const scroller = this.getViewScroller(container, view) || previewRoot;
    if (!previewRoot || !scroller || !chapters.length) return null;

    const scrollerRect = scroller.getBoundingClientRect?.();
    if (!scrollerRect || !Number.isFinite(scrollerRect.top)) return null;
    const activeBaseline = scrollerRect.top + 70;
    const seenHeadings = new Set();
    let visibleLine = null;

    // A markdown-preview-section's data-line is only its rendered chunk's
    // start line. Long notes can keep that value at 0 even after scrolling
    // far into the note. Real heading geometry is authoritative whenever the
    // heading is mounted, so use it before the chunk-line fallback.
    for (const chapter of chapters) {
      const heading = this.getReadingHeading(view, chapter);
      if (!heading || seenHeadings.has(heading)) continue;
      seenHeadings.add(heading);

      const headingRect = heading.getBoundingClientRect?.();
      if (!headingRect || !Number.isFinite(headingRect.top)) continue;
      if (headingRect.top <= activeBaseline + 2) {
        visibleLine = chapter.line;
      }
    }

    return visibleLine;
  }

  getCurrentEditorTopLine(view, container, chapters = []) {
    try {
      if (!this.isReadingMode(view, container)) {
        const visualHeadingLine = this.getLivePreviewHeadingLine(container, chapters);
        if (visualHeadingLine !== null) return visualHeadingLine;

        const cmCandidates = [
          view.editor?.cm,
          view.editMode?.editor?.cm,
          view.editMode?.cm,
          view.editor
        ].filter(Boolean);
        for (const cm of cmCandidates) {
          if (typeof cm.lineBlockAtHeight !== 'function' || !cm.state?.doc?.lineAt) continue;
          const scrollDOM = cm.scrollDOM || container?.querySelector('.cm-scroller');
          if (!scrollDOM) continue;
          const topOffset = Math.max(0, (scrollDOM.scrollTop || 0) + 50);
          const lineBlock = cm.lineBlockAtHeight(topOffset);
          if (!lineBlock) continue;
          const line = cm.state.doc.lineAt(lineBlock.from);
          if (line && Number.isInteger(line.number)) {
            return line.number - 1;
          }
        }

        const editor = view.editor || view.editMode?.editor;
        if (editor && typeof editor.getCursor === 'function') {
          const cursor = editor.getCursor('from');
          if (cursor && Number.isInteger(cursor.line)) return cursor.line;
        }
      } else {
        const previewRoot = view.contentEl?.querySelector('.markdown-preview-view');
        const scroller = this.getViewScroller(container, view) || previewRoot;
        if (!previewRoot || !scroller) return 0;
        const visibleHeadingLine = this.getVisibleReadingHeadingLine(view, container, chapters);
        if (visibleHeadingLine !== null) return visibleHeadingLine;
        const sectionLine = this.getReadingSectionLineAtBaseline(view, container, chapters);
        if (sectionLine !== null) return sectionLine;
        const scrollerRect = scroller.getBoundingClientRect();
        const activeBaseline = scrollerRect.top + 70;

        let closestLine = 0;
        for (const chap of chapters) {
          const heading = this.getReadingHeading(view, chap);
          if (heading) {
            if (heading.getBoundingClientRect().top <= activeBaseline) {
              closestLine = chap.line;
            } else {
              break;
            }
          } else {
            const section = previewRoot.querySelector(`.markdown-preview-section[data-line="${chap.line}"]`);
            if (section) {
              if (section.getBoundingClientRect().top <= activeBaseline) {
                closestLine = chap.line;
              } else {
                break;
              }
            }
          }
        }
        return closestLine;
      }
    } catch (e) {
      // ignore
    }
    return 0;
  }

  getLivePreviewHeadingLine(container, chapters = []) {
    const scroller = container?.querySelector('.cm-scroller');
    if (!scroller || !chapters.length) return null;
    const scrollerRect = scroller.getBoundingClientRect();
    const activeBaseline = scrollerRect.top + 70;
    const renderedLines = Array.from(container.querySelectorAll('.cm-line, .cm-heading'));
    let closestLine = null;
    let closestTop = -Infinity;

    for (const lineEl of renderedLines) {
      const classNames = lineEl.classList
        ? (typeof lineEl.classList[Symbol.iterator] === 'function'
          ? Array.from(lineEl.classList)
          : (lineEl.classList.values ? Array.from(lineEl.classList.values) : []))
        : String(lineEl.className || '').split(/\s+/);
      const levelMatch = classNames.map((name) => String(name).match(/^HyperMD-header-([1-6])$/)).find(Boolean);
      const isHeading = Boolean(levelMatch) || classNames.includes('HyperMD-header') || classNames.includes('cm-heading');
      if (!isHeading) continue;

      const rect = lineEl.getBoundingClientRect();
      if (rect.top > activeBaseline || rect.top < closestTop) continue;

      const dataLine = lineEl.getAttribute?.('data-line');
      const lineNumber = dataLine === null || dataLine === undefined ? NaN : parseInt(dataLine, 10);
      let matchedChapter = Number.isInteger(lineNumber)
        ? chapters.find((chapter) => chapter.line === lineNumber)
        : null;

      if (!matchedChapter) {
        const level = levelMatch ? parseInt(levelMatch[1], 10) : null;
        const renderedTitle = normalizeHeadingText(lineEl.textContent);
        matchedChapter = chapters.find((chapter) => {
          if (level && chapter.level !== level) return false;
          const title = normalizeHeadingText(chapter.title);
          const rawTitle = normalizeHeadingText(chapter.rawHeading || chapter.title);
          return renderedTitle && (renderedTitle === title || renderedTitle === rawTitle || renderedTitle.includes(title) || title.includes(renderedTitle));
        });
      }

      if (matchedChapter) {
        closestTop = rect.top;
        closestLine = matchedChapter.line;
      }
    }

    return closestLine;
  }

  jumpToHeading(view, chap) {
    const targetView = (view && view.file)
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!targetView) return;

    const line = (typeof chap === 'number') ? chap : chap.line;
    if (line === undefined) return;

    const headingText = (typeof chap === 'object' && chap) ? (chap.rawHeading || chap.title) : '';
    const subpath = headingText ? `#${headingText}` : '';

    // 0. 调用 Obsidian 原生状态机制（自动解除折叠、唤醒虚拟DOM、跨模式对齐，focus: false 彻底避免选中文字与背景高亮）
    try {
      if (typeof targetView.setEphemeralState === 'function') {
        targetView.setEphemeralState(subpath ? { subpath, line, focus: false } : { line, focus: false });
      }
      this.clearFlashHighlights(targetView.contentEl);
    } catch (e) {
      // ignore
    }

    if (this.isReadingMode(targetView, targetView.contentEl)) {
      const previewScroller = targetView.contentEl?.querySelector('.markdown-preview-view');
      const previewMode = targetView.currentMode || targetView.previewMode;

      if (previewMode && typeof previewMode.applyScroll === 'function') {
        previewMode.applyScroll(line);
      }

      if (previewScroller) {
        const topMargin = 20;
        let targetHeading = typeof chap === 'object' ? this.getReadingHeading(targetView, chap) : null;

        if (targetHeading) {
          const scrollerRect = previewScroller.getBoundingClientRect();
          const headingRect = targetHeading.getBoundingClientRect();
          const targetTop = Math.max(
            0,
            previewScroller.scrollTop + headingRect.top - scrollerRect.top - topMargin
          );
          previewScroller.scrollTo({ top: targetTop, behavior: 'smooth' });
        }

        let frames = 0;
        const maxFrames = 24;
        const calibratePreview = () => {
          frames++;
          if (!targetHeading && typeof chap === 'object') {
            targetHeading = this.getReadingHeading(targetView, chap);
            if (targetHeading) {
              const scrollerRect = previewScroller.getBoundingClientRect();
              const headingRect = targetHeading.getBoundingClientRect();
              const targetTop = Math.max(
                0,
                previewScroller.scrollTop + headingRect.top - scrollerRect.top - topMargin
              );
              previewScroller.scrollTo({ top: targetTop, behavior: 'smooth' });
            }
          }

          if (targetHeading) {
            const freshScrollerRect = previewScroller.getBoundingClientRect();
            const freshHeadingRect = targetHeading.getBoundingClientRect();
            const delta = freshHeadingRect.top - freshScrollerRect.top - topMargin;
            if (Math.abs(delta) > 1) {
              previewScroller.scrollTop = Math.max(0, previewScroller.scrollTop + delta);
            }
          }
          if (frames < maxFrames) {
            this.scheduleFrame(calibratePreview);
          }
        };
        this.scheduleFrame(calibratePreview);
        return;
      }
    }

    const editor = targetView.editor;
    const cm = editor?.cm || editor?.editor?.cm || targetView.editMode?.editor?.cm || targetView.editMode?.cm;
    const scroller = targetView.contentEl?.querySelector('.cm-scroller');

    if (editor?.setCursor) {
      editor.setCursor({ line, ch: 0 });
    }

    if (editor?.scrollIntoView) {
      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, false);
    }

    if (cm && cm.state && cm.state.doc) {
      const doc = cm.state.doc;
      const targetLineNum = Math.min(Math.max(1, line + 1), doc.lines);
      const lineObj = doc.line(targetLineNum);
      const targetPos = lineObj.from;

      try {
        const EditorViewClass = cm.constructor;
        if (EditorViewClass && typeof EditorViewClass.scrollIntoView === 'function') {
          cm.dispatch({
            effects: EditorViewClass.scrollIntoView(targetPos, { y: 'start', yMargin: 20 })
          });
        } else {
          const block = cm.lineBlockAt(targetPos);
          if (scroller && block) {
            scroller.scrollTop = Math.max(0, block.top - 20);
          }
        }
      } catch (e) {
        if (editor) {
          editor.scrollIntoView({ from: { line: line, ch: 0 }, to: { line: line, ch: 0 } }, false);
        }
      }

      // 2. 毫秒级多帧高精物理像素校准（消除 LaTeX 公式/卡片渲染重排导致的微小位移）
      if (scroller) {
        let frames = 0;
        const calibrate = () => {
          frames++;
          const scrollerRect = scroller.getBoundingClientRect();
          const coords = cm.coordsAtPos ? cm.coordsAtPos(targetPos) : null;

          if (coords) {
            const delta = coords.top - scrollerRect.top - 20;
            if (Math.abs(delta) > 1) {
              scroller.scrollTop += delta;
            }
          } else {
            try {
              const freshBlock = cm.lineBlockAt(targetPos);
              if (freshBlock) {
                const delta = freshBlock.top - scroller.scrollTop - 20;
                if (Math.abs(delta) > 1) {
                  scroller.scrollTop = Math.max(0, freshBlock.top - 20);
                }
              }
            } catch (err) {
              // ignore
            }
          }

          if (frames < 12) {
            this.scheduleFrame(calibrate);
          }
        };
        this.scheduleFrame(calibrate);
      }
      return;
    }

    // 降级保底
    if (editor) {
      editor.scrollIntoView({ from: { line: line, ch: 0 }, to: { line: line, ch: 0 } }, false);
    }
  }

  onunload() {
    if (this.soundEngine && typeof this.soundEngine.destroy === 'function') {
      this.soundEngine.destroy();
    }
    if (this.refreshFrame !== null) {
      cancelAnimationFrame(this.refreshFrame);
      this.refreshFrame = null;
    }
    if (this.pendingFrames) {
      this.pendingFrames.forEach((frameId) => cancelAnimationFrame(frameId));
      this.pendingFrames.clear();
    }
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.readingSaveTimer !== null) {
      clearTimeout(this.readingSaveTimer);
      this.readingSaveTimer = null;
      this.saveSettings().catch(() => {});
    }
    this.observers.forEach(obs => obs.disconnect());
    this.observers.clear();
    this.viewObservers.forEach(obs => obs.disconnect());
    this.viewObservers.clear();
    this.renderVersions.clear();
    this.chapterCache?.clear?.();
    this.documentRevisions?.clear?.();
    this.scrollBindings.forEach(({ scrollers, scroller, handler }) => {
      (scrollers || (scroller ? [scroller] : [])).forEach((boundScroller) => {
        boundScroller?.removeEventListener?.('scroll', handler, true);
      });
    });
    this.scrollBindings.clear();
    if (this.viewTooltips) {
      this.viewTooltips.forEach((tooltip) => tooltip?.remove?.());
      this.viewTooltips.clear();
    }
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.codex-stepper-container').forEach(el => el.remove());
      document.querySelectorAll('.codex-floating-tooltip').forEach(el => el.remove());
    } else if (typeof document !== 'undefined' && document.body && typeof document.body.querySelectorAll === 'function') {
      document.body.querySelectorAll('.codex-stepper-container').forEach(el => el.remove());
      document.body.querySelectorAll('.codex-floating-tooltip').forEach(el => el.remove());
    }
  }
}

ChapterPipelinePlugin.ChapterSuggestModal = ChapterSuggestModal;
ChapterPipelinePlugin.ChapterParser = ChapterParser;
ChapterPipelinePlugin.SoundEngine = SoundEngine;
ChapterPipelinePlugin.updateHierarchyFolding = updateHierarchyFolding;
ChapterPipelinePlugin.prototype.updateHierarchyFolding = updateHierarchyFolding;

module.exports = ChapterPipelinePlugin;
module.exports.default = ChapterPipelinePlugin;
module.exports.ChapterSuggestModal = ChapterSuggestModal;
module.exports.ChapterParser = ChapterParser;
module.exports.SoundEngine = SoundEngine;
module.exports.updateHierarchyFolding = updateHierarchyFolding;
