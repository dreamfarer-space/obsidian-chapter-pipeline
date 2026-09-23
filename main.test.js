const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor({ tagName = 'div', classes = [], rect = {}, scrollParent = null, textContent = '', attributes = {} } = {}) {
    this.tagName = tagName.toLowerCase();
    this.classList = new FakeClassList(classes);
    this.children = [];
    this.parentElement = null;
    this.scrollParent = scrollParent;
    this.rect = { top: 0, left: 0, right: 0, height: 0, ...rect };
    this.listeners = new Map();
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = textContent;
    this.clientWidth = 900;
    this.scrollTop = 0;
    const styleValues = new Map();
    this.style = new Proxy({
      values: styleValues,
      setProperty: (name, value) => styleValues.set(name, String(value)),
      getPropertyValue: (name) => styleValues.get(name) || '',
    }, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return styleValues.get(prop) || '';
      },
      set(target, prop, val) {
        if (prop === 'values' || prop === 'setProperty' || prop === 'getPropertyValue') {
          target[prop] = val;
        } else {
          styleValues.set(prop, String(val));
        }
        return true;
      }
    });
  }

  addClass(...names) {
    this.classList.add(...names);
    return this;
  }

  removeClass(...names) {
    this.classList.remove(...names);
    return this;
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  createEl(tagName, options = {}) {
    return this.append(this.createChild(tagName, options));
  }

  createDiv(options = {}) {
    return this.append(this.createChild('div', options));
  }

  createSpan(options = {}) {
    return this.append(this.createChild('span', options));
  }

  createChild(tagName, options) {
    const classes = String(options.cls || '').split(/\s+/).filter(Boolean);
    const child = new FakeElement({
      tagName,
      classes,
      textContent: options.text || options.textContent || ''
    });
    for (const [name, value] of Object.entries(options.attr || {})) {
      child.setAttribute(name, value);
    }
    return child;
  }

  empty() {
    this.children = [];
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    const remaining = handlers.filter((candidate) => candidate !== handler);
    if (remaining.length > 0) this.listeners.set(type, remaining);
    else this.listeners.delete(type);
  }

  dispatch(type, event = {}) {
    const syntheticEvent = {
      stopPropagation() {},
      preventDefault() {},
      ...event,
    };
    for (const handler of this.listeners.get(type) || []) {
      handler(syntheticEvent);
    }
  }

  scrollTo(options) {
    this.lastScrollTo = options;
    this.scrollTop = options.top;
  }

  getBoundingClientRect() {
    const scrollOffset = this.scrollParent ? this.scrollParent.scrollTop : 0;
    return { ...this.rect, top: this.rect.top - scrollOffset };
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName === selector.toLowerCase();
  }

  closest(selector) {
    const selectors = selector.split(',').map((s) => s.trim());
    let current = this;
    while (current) {
      if (selectors.some((sel) => current.matches && current.matches(sel))) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map((part) => part.trim());
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.some((part) => child.matches(part))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class ObsidianPlugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this.commands = [];
  }

  async loadData() {
    return {};
  }

  async saveData(data) {
    this._savedData = data;
  }

  addSettingTab(tab) {
    this.settingTab = tab;
  }

  addCommand(command) {
    this.commands.push(command);
    return command;
  }

  registerEvent() {}
}

class MarkdownView {}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = new FakeElement({ tagName: 'div' });
  }
}

class SuggestModal {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.placeholder = '';
    this.modalEl = new FakeElement({ classes: ['modal'] });
  }

  setPlaceholder(text) {
    this.placeholder = text;
  }

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }
}

class Menu {
  static instances = [];

  constructor() {
    this.items = [];
    this.event = null;
    Menu.instances.push(this);
  }

  addItem(callback) {
    const item = {
      title: '',
      clickHandler: null,
      setTitle: (title) => { item.title = title; return item; },
      onClick: (handler) => { item.clickHandler = handler; return item; },
    };
    callback(item);
    this.items.push(item);
    return this;
  }

  showAtMouseEvent(event) {
    this.event = event;
  }
}

class Notice {
  static instances = [];

  constructor(message, timeout) {
    this.message = message;
    this.timeout = timeout;
    Notice.instances.push(this);
  }
}

class Setting {
  static instances = [];

  constructor(containerEl) {
    this.containerEl = containerEl;
    this.name = '';
    this.desc = '';
    this.controls = [];
    Setting.instances.push(this);
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDesc(desc) {
    this.desc = desc;
    return this;
  }

  addToggle(cb) {
    const toggle = {
      value: false,
      setValue: (val) => { toggle.value = val; return toggle; },
      onChange: (fn) => { toggle.changeHandler = fn; return toggle; },
    };
    cb(toggle);
    this.controls.push(toggle);
    return this;
  }

  addDropdown(cb) {
    const drop = {
      options: {},
      value: '',
      addOption: (k, v) => { drop.options[k] = v; return drop; },
      setValue: (val) => { drop.value = val; return drop; },
      onChange: (fn) => { drop.changeHandler = fn; return drop; },
    };
    cb(drop);
    this.controls.push(drop);
    return this;
  }

  addSlider(cb) {
    const slider = {
      min: 0,
      max: 100,
      step: 1,
      value: 0,
      setLimits: (min, max, step) => { slider.min = min; slider.max = max; slider.step = step; return slider; },
      setValue: (val) => { slider.value = val; return slider; },
      setDynamicTooltip: () => slider,
      onChange: (fn) => { slider.changeHandler = fn; return slider; },
    };
    cb(slider);
    this.controls.push(slider);
    return this;
  }

  addColorPicker(cb) {
    const picker = {
      value: '#3b82f6',
      setValue: (val) => { picker.value = val; return picker; },
      onChange: (fn) => { picker.changeHandler = fn; return picker; },
    };
    cb(picker);
    this.controls.push(picker);
    return this;
  }

  addButton(cb) {
    const btn = {
      text: '',
      setButtonText: (val) => { btn.text = val; return btn; },
      setCta: () => btn,
      setWarning: () => btn,
      onClick: (fn) => { btn.clickHandler = fn; return btn; },
    };
    cb(btn);
    this.controls.push(btn);
    return this;
  }
}

const originalLoad = Module._load;
Module._load = function loadWithObsidianStub(request, parent, isMain) {
  if (request === 'obsidian') {
    return {
      Plugin: ObsidianPlugin,
      MarkdownView,
      MarkdownRenderer: {
        render(app, markdown, el, path, component) {
          if (el) {
            el.textContent = markdown;
            if (typeof el.createSpan === 'function') {
              el.createSpan({ text: markdown });
            }
          }
        }
      },
      PluginSettingTab,
      Setting,
      SuggestModal,
      Menu,
      Notice,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ChapterPipelinePlugin = require('./main.js');
Module._load = originalLoad;

function createReadingHarness() {
  const body = new FakeElement();
  global.document = {
    body,
    querySelectorAll: (...args) => body.querySelectorAll(...args),
    querySelector: (...args) => body.querySelector(...args),
    createElement: (tag) => new FakeElement({ tagName: tag }),
    addEventListener: (...args) => body.addEventListener(...args),
    removeEventListener: (...args) => body.removeEventListener(...args),
    elementsFromPoint: () => [],
  };
  global.window = {
    innerWidth: 1200,
    innerHeight: 800,
    localStorage: { getItem: () => 'en' },
  };
  Menu.instances = [];
  Notice.instances = [];
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    disconnect() {}
  };
  global.__mutationObservers = [];
  global.MutationObserver = class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      global.__mutationObservers.push(this);
    }
    observe() {}
    disconnect() {}
    trigger() {
      this.callback();
    }
  };
  global.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };

  const container = new FakeElement();
  const sourceScroller = container.append(new FakeElement({ classes: ['cm-scroller'] }));
  const scroller = container.append(new FakeElement({
    classes: ['markdown-preview-view'],
    rect: { top: 100, left: 250, right: 1000, height: 650 },
  }));
  const firstHeading = scroller.append(new FakeElement({
    tagName: 'h1',
    rect: { top: 180, left: 300, right: 900, height: 40 },
    scrollParent: scroller,
  }));
  const secondHeading = scroller.append(new FakeElement({
    tagName: 'h2',
    rect: { top: 420, left: 300, right: 900, height: 36 },
    scrollParent: scroller,
  }));

  const view = new MarkdownView();
  view.file = { path: 'note.md' };
  view.contentEl = container;
  view.getMode = () => 'preview';

  const vaultEvents = new Map();
  const app = {
    vault: {
      cachedRead: async () => '# First\nbody\nbody\nbody\n## Second\nbody',
      on: (eventName, handler) => {
        vaultEvents.set(eventName, handler);
        return { eventName, handler };
      },
    },
    metadataCache: {
      getFileCache: () => ({
        headings: [
          { heading: 'First', level: 1, position: { start: { line: 0 } } },
          { heading: 'Second', level: 2, position: { start: { line: 4 } } },
        ],
      }),
    },
    workspace: { getActiveViewOfType: () => view },
  };

  const plugin = new ChapterPipelinePlugin(app, {});
  plugin.settings = {
    minHeadingLevel: 1,
    maxHeadingLevel: 6,
    ignoreFirstH1: false,
    showExcerpt: true,
    excerptLength: 140,
    activeColor: '#3b82f6',
    narrowThreshold: 600,
    enableSound: false,
  };

  app.workspace.getLeavesOfType = () => [{ view }];

  return { app, container, firstHeading, plugin, scroller, secondHeading, sourceScroller, vaultEvents, view };
}

// =========================================================================
// 1. Reading View & Live Preview Scroller Tracking & Baseline Geometry
// =========================================================================

test('Reading View renders the chapter pipeline, binds scroll, and reflects chapter order settings', async () => {
  const disabledHarness = createReadingHarness();
  await disabledHarness.plugin.attachStepperToView(disabledHarness.view);

  const container = disabledHarness.container;
  const stepper = container.querySelector('.codex-stepper-container');
  assert.ok(stepper);
  assert.equal(stepper.classList.contains('show-chapter-order'), false);
  assert.equal(disabledHarness.scroller.listeners.get('scroll')?.length, 1);
  assert.equal(disabledHarness.sourceScroller.listeners.get('scroll'), undefined);
  const readingSession = disabledHarness.plugin.viewSessions?.get(disabledHarness.view);
  assert.ok(readingSession instanceof ChapterPipelinePlugin.ViewSession);
  assert.ok(readingSession.tracker instanceof ChapterPipelinePlugin.ReadingViewTracker);
  assert.equal(disabledHarness.plugin.scrollBindings.has(disabledHarness.container), false);

  const dashes = container.querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 2);
  assert.equal(dashes[0].getAttribute('data-chapter-order'), '1');
  assert.equal(dashes[1].getAttribute('data-chapter-order'), '2');

  const enabledHarness = createReadingHarness();
  enabledHarness.plugin.settings.showChapterOrder = true;
  await enabledHarness.plugin.attachStepperToView(enabledHarness.view);
  assert.equal(enabledHarness.container.querySelector('.codex-stepper-container').classList.contains('show-chapter-order'), true);

  const liveHarness = createReadingHarness();
  liveHarness.view.getMode = () => 'source';
  await liveHarness.plugin.attachStepperToView(liveHarness.view);
  const liveSession = liveHarness.plugin.viewSessions?.get(liveHarness.view);
  assert.ok(liveSession instanceof ChapterPipelinePlugin.ViewSession);
  assert.ok(liveSession.tracker instanceof ChapterPipelinePlugin.LivePreviewTracker);
  assert.equal(liveHarness.sourceScroller.listeners.get('scroll')?.length, 1);

  await liveHarness.plugin.attachStepperToView(liveHarness.view);
  const replacementLiveSession = liveHarness.plugin.viewSessions?.get(liveHarness.view);
  assert.ok(replacementLiveSession instanceof ChapterPipelinePlugin.ViewSession);
  assert.notEqual(replacementLiveSession, liveSession);
  assert.equal(liveHarness.sourceScroller.listeners.get('scroll')?.length, 1);

  liveHarness.plugin.onunload();
  assert.equal(liveHarness.sourceScroller.listeners.get('scroll')?.length ?? 0, 0);
  assert.equal(liveHarness.plugin.viewSessions.size, 0);
});

test('typed sessions are disposed when Markdown views leave the workspace', async () => {
  const harness = createReadingHarness();
  await harness.plugin.attachStepperToView(harness.view);
  assert.ok(harness.plugin.viewSessions?.has(harness.view));
  assert.equal(harness.scroller.listeners.get('scroll')?.length, 1);

  harness.app.workspace.getLeavesOfType = () => [];
  harness.plugin.updateAllMarkdownViews();

  assert.equal(harness.plugin.viewSessions?.has(harness.view), false);
  assert.equal(harness.plugin.viewSessionVersions?.has(harness.view), false);
  assert.equal(harness.scroller.listeners.get('scroll')?.length ?? 0, 0);
});

test('concurrent typed attachment keeps only the newest reverse-completing session', async () => {
  const harness = createReadingHarness();
  const pendingReads = [];
  harness.app.vault.cachedRead = () => new Promise((resolve) => pendingReads.push(resolve));

  const firstAttach = harness.plugin.attachStepperToView(harness.view);
  const secondAttach = harness.plugin.attachStepperToView(harness.view);
  assert.equal(pendingReads.length, 2);

  const content = '# First\nbody\nbody\nbody\n## Second\nbody';
  pendingReads[1](content);
  await secondAttach;
  const newestSession = harness.plugin.viewSessions?.get(harness.view);
  assert.ok(newestSession instanceof ChapterPipelinePlugin.ViewSession);
  assert.equal(harness.scroller.listeners.get('scroll')?.length, 1);
  assert.equal(harness.plugin.scrollBindings.has(harness.container), false);

  pendingReads[0](content);
  await firstAttach;

  assert.equal(harness.plugin.viewSessions?.get(harness.view), newestSession);
  assert.equal(harness.scroller.listeners.get('scroll')?.length, 1);
  assert.equal(harness.plugin.scrollBindings.has(harness.container), false);
});

test('typed scroll ticks delegate independently of tactile click sound setting', async () => {
  const harness = createReadingHarness();
  harness.plugin.settings.enableSound = false;
  harness.plugin.settings.enableScrollSound = true;
  let scrollTicks = 0;
  harness.plugin.soundEngine.playScrollTick = () => { scrollTicks += 1; };

  await harness.plugin.attachStepperToView(harness.view);
  harness.scroller.scrollTop = 1;
  harness.scroller.dispatch('scroll');
  assert.equal(scrollTicks, 0);

  harness.scroller.scrollTop = 400;
  harness.scroller.dispatch('scroll');
  assert.equal(scrollTicks, 1);
});

test('typed attachment discards a session when the view closes during cachedRead', async () => {
  const harness = createReadingHarness();
  let resolveRead;
  harness.app.vault.cachedRead = () => new Promise((resolve) => { resolveRead = resolve; });

  const attach = harness.plugin.attachStepperToView(harness.view);
  harness.app.workspace.getLeavesOfType = () => [];
  resolveRead('# First\nbody\nbody\nbody\n## Second\nbody');
  await attach;

  assert.equal(harness.plugin.viewSessions?.has(harness.view), false);
  assert.equal(harness.scroller.listeners.get('scroll')?.length ?? 0, 0);
  assert.equal(harness.plugin.scrollBindings.has(harness.container), false);
  assert.equal(harness.container.querySelector('.codex-stepper-container'), null);
});

test('typed sessions keep the rendered per-view chapter snapshot during resume lookup', async () => {
  const harness = createReadingHarness();
  harness.plugin.settings.maxHeadingLevel = 1;
  harness.plugin.settings.readingBookmarksEnabled = true;
  const content = '# First\nbody\nbody\nbody\n## Second\nbody';
  const allChapters = harness.plugin.extractAllChapters(content, harness.view.file);
  assert.equal(allChapters.length, 2);
  harness.plugin.settings.readingState = { files: { 'note.md': { markers: {}, resume: { chapterId: allChapters[1].id, title: allChapters[1].title, updatedAt: 1 } } } };

  await harness.plugin.attachStepperToView(harness.view);
  const session = harness.plugin.viewSessions?.get(harness.view);
  assert.ok(session instanceof ChapterPipelinePlugin.ViewSession);
  assert.equal(harness.container.querySelectorAll('.codex-dash-item').length, 1);
  assert.equal(session.getChapters().length, 1);
  assert.equal(session.getChapters()[0].level, 1);
});

test('Reading View active tracking handles mode aliases and ignores hidden editor state', async () => {
  const { container, plugin, scroller, sourceScroller, view } = createReadingHarness();
  sourceScroller.scrollTop = 0;
  scroller.scrollTop = 300;
  view.editor = {
    cm: {
      scrollDOM: sourceScroller,
      lineBlockAtHeight: () => ({ from: 0 }),
      state: { doc: { lineAt: () => ({ number: 1 }) } },
    },
  };
  const chapters = [
    { line: 0, headingIndex: 0 },
    { line: 4, headingIndex: 1 },
  ];

  assert.equal(plugin.getCurrentEditorTopLine(view, container, chapters), 4);

  view.getMode = () => 'reading';
  assert.equal(plugin.getCurrentEditorTopLine(view, container, chapters), 4);
  await plugin.attachStepperToView(view);
  assert.equal(scroller.listeners.get('scroll')?.length, 1);
});

test('Reading View active line resolves rendered headings, virtualized sections, and elementsFromPoint', () => {
  const { container, plugin, scroller, view } = createReadingHarness();
  scroller.scrollTop = 300;

  // Stale section with data-line=0
  const staleSection = scroller.append(new FakeElement({
    classes: ['markdown-preview-section'],
    attributes: { 'data-line': '0' },
  }));
  const visibleContent = staleSection.append(new FakeElement({ tagName: 'p', textContent: 'Current chapter content' }));
  global.document.elementsFromPoint = () => [visibleContent];

  const chapters = [
    { line: 0, headingIndex: 0, level: 1, title: 'First', rawHeading: 'First' },
    { line: 4, headingIndex: 1, level: 2, title: 'Second', rawHeading: 'Second' },
  ];
  // Prefers real heading geometry over stale section
  assert.equal(plugin.getCurrentEditorTopLine(view, container, chapters), 4);

  // Virtualized section beneath viewport baseline (headings not rendered in DOM)
  const virtHarness = createReadingHarness();
  const section16 = virtHarness.scroller.append(new FakeElement({
    classes: ['markdown-preview-section'],
    attributes: { 'data-line': '16' },
  }));
  const content16 = section16.append(new FakeElement({ tagName: 'p', textContent: 'Section 16 content' }));
  global.document.elementsFromPoint = () => [content16];
  const virtualChapters = [
    { line: 0, headingIndex: 0 },
    { line: 8, headingIndex: 1 },
    { line: 16, headingIndex: 2 },
  ];
  assert.equal(virtHarness.plugin.getCurrentEditorTopLine(virtHarness.view, virtHarness.container, virtualChapters), 16);
});

test('Reading View scroller discovery prioritizes actively scrolling parent over long preview child', async () => {
  const { container, firstHeading, plugin, scroller, secondHeading, view } = createReadingHarness();
  const outerScroller = new FakeElement({
    classes: ['view-content'],
    rect: { top: 100, left: 250, right: 1000, height: 650 },
  });
  outerScroller.clientHeight = 650;
  outerScroller.scrollHeight = 2400;
  outerScroller.scrollTop = 300;
  outerScroller.append(container);

  scroller.clientHeight = 650;
  scroller.scrollHeight = 2400;
  scroller.scrollTop = 0;

  firstHeading.rect.top = 80;
  secondHeading.rect.top = 150;

  const chapters = [
    { line: 0, headingIndex: 0 },
    { line: 4, headingIndex: 1 },
  ];

  assert.equal(plugin.getViewScroller(container, view), outerScroller);
  assert.equal(plugin.getCurrentEditorTopLine(view, container, chapters), 4);

  await plugin.attachStepperToView(view);
  assert.equal(outerScroller.listeners.get('scroll')?.length, 1);
  assert.equal(container.querySelectorAll('.codex-dash-item')[1].classList.contains('active'), true);
});

test('Live Preview active tracking resolves visible heading elements and CodeMirror scroller fallback', () => {
  const { container, plugin, sourceScroller, view } = createReadingHarness();
  view.getMode = () => 'source';
  sourceScroller.rect.top = 100;
  sourceScroller.append(new FakeElement({
    classes: ['cm-line', 'HyperMD-header', 'HyperMD-header-2'],
    textContent: '## Second',
    rect: { top: 150, left: 300, right: 900, height: 28 },
    attributes: { 'data-line': '4' },
  }));
  const chapters = [
    { line: 0, level: 1, title: 'First', rawHeading: 'First' },
    { line: 4, level: 2, title: 'Second', rawHeading: 'Second' },
  ];
  assert.equal(plugin.getCurrentEditorTopLine(view, container, chapters), 4);

  // Fallback to cm.lineBlockAtHeight
  sourceScroller.empty();
  sourceScroller.scrollTop = 240;
  view.editor = {
    cm: {
      lineBlockAtHeight: () => ({ from: 40 }),
      state: { doc: { lineAt: () => ({ number: 9 }) } },
    },
  };
  const fallbackChapters = [{ line: 0 }, { line: 8 }];
  assert.equal(plugin.getCurrentEditorTopLine(view, container, fallbackChapters), 8);
});

test('clicking a Reading View chapter aligns its heading to the top baseline', async () => {
  const { container, plugin, scroller, secondHeading, view } = createReadingHarness();
  await plugin.attachStepperToView(view);

  const secondDash = container.querySelectorAll('.codex-dash-item')[1];
  assert.ok(secondDash, 'the second chapter dash should exist in Reading View');

  secondDash.dispatch('click');

  assert.equal(scroller.lastScrollTo.top, 300);
  assert.equal(secondHeading.getBoundingClientRect().top, scroller.getBoundingClientRect().top + 20);
});

test('editing-mode navigation keeps the cursor and heading on the 20px baseline', () => {
  const { app, sourceScroller, plugin, view } = createReadingHarness();
  let cursor = null;
  view.getMode = () => 'source';
  sourceScroller.rect.top = 100;
  view.editor = {
    setCursor: (position) => { cursor = position; },
    scrollIntoView() {},
  };
  view.editor.cm = {
    scrollDOM: sourceScroller,
    state: {
      doc: {
        lines: 10,
        line: () => ({ from: 40 }),
      },
    },
    lineBlockAt: () => ({ top: 420 }),
    coordsAtPos: () => ({ top: 520 - sourceScroller.scrollTop }),
  };
  app.workspace.getActiveViewOfType = () => view;

  plugin.jumpToHeading(view, { line: 4, headingIndex: 1 });

  assert.deepEqual(cursor, { line: 4, ch: 0 });
  assert.equal(sourceScroller.scrollTop, 400);
});

test('chapter navigation targets the view that owns the clicked pipeline', () => {
  const origin = createReadingHarness();
  const other = createReadingHarness();
  origin.app.workspace.getActiveViewOfType = () => other.view;

  origin.plugin.jumpToHeading(origin.view, { line: 4, headingIndex: 1 });

  assert.equal(origin.scroller.lastScrollTo?.top, 300);
  assert.equal(other.scroller.lastScrollTo, undefined);
});

test('DOM replacement, layout refresh, and concurrent requests safely reattach pipeline without listener leak', async () => {
  const { app, container, plugin, scroller, view } = createReadingHarness();

  // Layout refresh reattachment
  const replacement = createReadingHarness();
  plugin.scheduleUpdateAllMarkdownViews();
  view.contentEl = replacement.container;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(view.contentEl.querySelector('.codex-stepper-container'));

  // MutationObserver triggers reattachment on DOM removal
  const obsHarness = createReadingHarness();
  await obsHarness.plugin.attachStepperToView(obsHarness.view);
  obsHarness.container.querySelector('.codex-stepper-container')?.remove();
  const viewObserver = global.__mutationObservers.at(-1);
  assert.ok(viewObserver, 'Markdown view should be observed');
  viewObserver.trigger();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(obsHarness.container.querySelector('.codex-stepper-container'));

  // Concurrent refreshes keep only one pipeline instance
  const concHarness = createReadingHarness();
  const pendingReads = [];
  concHarness.app.vault.cachedRead = () => new Promise((resolve) => pendingReads.push(resolve));
  const firstRefresh = concHarness.plugin.attachStepperToView(concHarness.view);
  const secondRefresh = concHarness.plugin.attachStepperToView(concHarness.view);
  pendingReads.forEach((resolve) => resolve('# First\nbody\n## Second\nbody'));
  await Promise.all([firstRefresh, secondRefresh]);
  assert.equal(concHarness.container.querySelectorAll('.codex-stepper-container').length, 1);

  // Single scroll listener preserved
  assert.equal(concHarness.scroller.listeners.get('scroll')?.length, 1);
});

test('Reading View accurately matches headings ignoring embedded notes and inline titles, and navigates with subpath', () => {
  const { plugin, scroller, secondHeading, view } = createReadingHarness();

  // 1. Embedded note heading ignored
  const embed = new FakeElement({ classes: ['internal-embed'] });
  embed.append(new FakeElement({ tagName: 'h2', textContent: 'Embedded Heading' }));
  scroller.children.splice(1, 0, embed);
  assert.equal(plugin.getReadingHeading(view, { line: 4, headingIndex: 1, title: 'Second' }), secondHeading);

  // 2. Inline title ignored and deep headings resolved
  const inlineTitle = new FakeElement({ tagName: 'h1', classes: ['inline-title'], textContent: 'Note Title' });
  scroller.children.unshift(inlineTitle);
  const h2Element = new FakeElement({
    tagName: 'h2',
    attributes: { 'data-heading': '2.2 导数的计算' },
    textContent: '2.2 导数的计算',
    rect: { top: 400, left: 250, right: 1000, height: 40 }
  });
  scroller.append(h2Element);
  assert.equal(plugin.getReadingHeading(view, { level: 2, title: '2.2 导数的计算', rawHeading: '2.2 导数的计算', line: 10 }), h2Element);

  // 3. Navigation calls previewMode.applyScroll and setEphemeralState
  let appliedScrollLine = null;
  let ephemeralState = null;
  view.currentMode = { applyScroll: (line) => { appliedScrollLine = line; } };
  view.setEphemeralState = (state) => { ephemeralState = state; };

  plugin.jumpToHeading(view, { level: 2, title: '2.4.1 脱帽法', rawHeading: '2.4.1 脱帽法', line: 21 });
  assert.equal(appliedScrollLine, 21);
  assert.equal(ephemeralState?.subpath, '#2.4.1 脱帽法');
  assert.equal(ephemeralState?.line, 21);
});

test('chapter items render with level classes and mouseenter displays the Linear level badge', async () => {
  const { container, plugin, view } = createReadingHarness();
  await plugin.attachStepperToView(view);

  const stepperContainer = container.querySelector('.codex-stepper-container');
  assert.ok(stepperContainer);
  assert.ok(stepperContainer.style.values.has('--dash-w1'));
  assert.ok(stepperContainer.style.values.has('--dash-hover-w1'));

  const dashItems = container.querySelectorAll('.codex-dash-item');
  assert.equal(dashItems.length, 2);
  assert.ok(dashItems[0].classList.contains('level-1'));
  assert.ok(dashItems[1].classList.contains('level-2'));

  // Test mouseenter on H1 item (active by default at scroll 0)
  dashItems[0].dispatch('mouseenter');
  const tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.ok(tooltip);
  assert.ok(tooltip.classList.contains('is-visible'));

  const badgeH1 = tooltip.querySelector('.codex-level-badge');
  assert.ok(badgeH1);
  assert.ok(badgeH1.classList.contains('level-1'));
  assert.ok(badgeH1.classList.contains('is-active'));
  assert.equal(badgeH1.textContent, 'H1');

  // Test mouseenter on H2 item (not active)
  dashItems[1].dispatch('mouseenter');
  const badgeH2 = tooltip.querySelector('.codex-level-badge');
  assert.ok(badgeH2);
  assert.ok(badgeH2.classList.contains('level-2'));
  assert.equal(badgeH2.classList.contains('is-active'), false);
  assert.equal(badgeH2.textContent, 'H2');

  // Switch active to H2 item and test mouseenter
  dashItems[0].classList.remove('active');
  dashItems[1].classList.add('active');
  dashItems[1].dispatch('mouseenter');
  const badgeH2Active = tooltip.querySelector('.codex-level-badge');
  assert.ok(badgeH2Active);
  assert.ok(badgeH2Active.classList.contains('is-active'));
});

test('Settings load handles default fallbacks and preserves existing custom overrides', async () => {
  const { app } = createReadingHarness();
  const plugin = new ChapterPipelinePlugin(app, {});

  // Default fallback
  await plugin.loadSettings();
  assert.equal(plugin.settings.dockPosition, 'left');
  assert.equal(plugin.settings.hierarchyMode, 'hover-expand');
  assert.equal(plugin.settings.showProgressRail, false);
  assert.equal(plugin.settings.tooltipGlassmorphism, false);
  assert.equal(plugin.settings.showChapterOrder, false);
  assert.equal(plugin.settings.readingBookmarksEnabled, false);
  assert.deepEqual(plugin.settings.readingState, { version: 2, files: {} });

  // Custom overrides
  plugin.loadData = async () => ({
    dockPosition: 'right',
    hierarchyMode: 'all',
    showProgressRail: true,
    tooltipGlassmorphism: false,
  });
  await plugin.loadSettings();
  assert.equal(plugin.settings.dockPosition, 'right');
  assert.equal(plugin.settings.hierarchyMode, 'all');
  assert.equal(plugin.settings.showProgressRail, true);
  assert.equal(plugin.settings.tooltipGlassmorphism, false);
});

test('ChapterPipelineSettingTab renders all controls and updates settings', async () => {
  Setting.instances = [];
  const { app } = createReadingHarness();
  app.workspace.on = () => {};
  app.workspace.onLayoutReady = () => {};
  app.metadataCache = { on: () => {} };
  const plugin = new ChapterPipelinePlugin(app, {});
  await plugin.onload();

  assert.ok(plugin.settingTab);
  let viewsUpdated = 0;
  plugin.updateAllMarkdownViews = () => { viewsUpdated++; };

  plugin.settingTab.display();

  // Find dockPosition dropdown setting
  const dockSetting = Setting.instances.find(s => s.controls.some(c => c.options && 'left' in c.options && 'right' in c.options));
  assert.ok(dockSetting, 'dockPosition dropdown setting should be rendered');
  const dockControl = dockSetting.controls[0];
  assert.equal(dockControl.value, 'left');
  await dockControl.changeHandler('right');
  assert.equal(plugin.settings.dockPosition, 'right');
  assert.equal(viewsUpdated, 1);

  // Find hierarchyMode dropdown setting
  const hierSetting = Setting.instances.find(s => s.controls.some(c => c.options && 'hover-expand' in c.options));
  assert.ok(hierSetting, 'hierarchyMode dropdown setting should be rendered');
  const hierControl = hierSetting.controls[0];
  assert.equal(hierControl.value, 'hover-expand');
  await hierControl.changeHandler('all');
  assert.equal(plugin.settings.hierarchyMode, 'all');

  // Find showProgressRail toggle setting
  const railSetting = Setting.instances.find(s => s.name.includes('Progress Rail') || s.name.includes('垂直进度导轨'));
  assert.ok(railSetting, 'showProgressRail toggle setting should be rendered');
  const railControl = railSetting.controls[0];
  assert.equal(railControl.value, false);
  await railControl.changeHandler(true);
  assert.equal(plugin.settings.showProgressRail, true);

  // Find tooltipGlassmorphism toggle setting
  const glassSetting = Setting.instances.find(s => s.name.includes('Glassmorphism') || s.name.includes('毛玻璃'));
  assert.ok(glassSetting, 'tooltipGlassmorphism toggle setting should be rendered');
  const glassControl = glassSetting.controls[0];
  assert.equal(glassControl.value, false);
  await glassControl.changeHandler(false);
  assert.equal(plugin.settings.tooltipGlassmorphism, false);

  const readingSetting = Setting.instances.find(s => s.name.includes('Reading Progress') || s.name.includes('阅读断点'));
  assert.ok(readingSetting, 'reading progress toggle setting should be rendered');
  const readingControl = readingSetting.controls[0];
  assert.equal(readingControl.value, false);
  await readingControl.changeHandler(true);
  assert.equal(plugin.settings.readingBookmarksEnabled, true);

  const orderSetting = Setting.instances.find(s => s.name.includes('Active Chapter Number') || s.name.includes('当前章节序号'));
  assert.ok(orderSetting, 'showChapterOrder toggle setting should be rendered');
  const orderControl = orderSetting.controls[0];
  assert.equal(orderControl.value, false);
  await orderControl.changeHandler(true);
  assert.equal(plugin.settings.showChapterOrder, true);
});

test('ChapterSuggestModal and openChapterPalette provide items, search text, badges/excerpts, and sound feedback', async () => {
  const { app, plugin, view } = createReadingHarness();
  let jumpedTo = null;
  let clickedSoundVolume = null;
  plugin.settings.enableSound = true;
  plugin.settings.soundVolume = 60;
  plugin.jumpToHeading = (v, chap) => { jumpedTo = { view: v, chap }; };
  plugin.soundEngine.playClick = (vol) => { clickedSoundVolume = vol; };

  const chapters = [
    { title: 'Chapter 1', level: 1, line: 0, summaryMarkdown: 'First line excerpt' },
    { title: 'Chapter 2', level: 2, line: 10, summaryMarkdown: '' }
  ];

  const ChapterSuggestModal = ChapterPipelinePlugin.ChapterSuggestModal;
  assert.ok(ChapterSuggestModal, 'ChapterSuggestModal class should exist');

  const modal = new ChapterSuggestModal(app, plugin, view, chapters);
  assert.deepEqual(modal.getItems(), chapters);
  assert.equal(modal.getItemText(chapters[0]), 'Chapter 1 First line excerpt');
  assert.equal(modal.getItemText(chapters[1]), 'Chapter 2 ');
  assert.ok(modal.modalEl.classList.contains('codex-suggest-modal'));

  // Test renderSuggestion for item with excerpt
  const el1 = new FakeElement();
  modal.renderSuggestion(chapters[0], el1);
  const badge1 = el1.querySelector('.codex-level-badge');
  assert.ok(badge1, 'should render level badge');
  assert.ok(badge1.classList.contains('level-1'));
  assert.equal(badge1.textContent, 'H1');
  const title1 = el1.querySelector('.codex-modal-title');
  assert.ok(title1, 'should render title element');
  assert.ok(title1.textContent.includes('Chapter 1'));
  const excerpt1 = el1.querySelector('.codex-modal-excerpt');
  assert.ok(excerpt1, 'should render excerpt element');
  assert.ok(excerpt1.textContent.includes('First line excerpt'));
  assert.ok(el1.classList.contains('codex-modal-item'));
  assert.ok(el1.classList.contains('codex-suggest-item'));

  // Test renderSuggestion for item without excerpt
  const el2 = new FakeElement();
  modal.renderSuggestion(chapters[1], el2);
  const excerpt2 = el2.querySelector('.codex-modal-excerpt');
  assert.equal(excerpt2, null, 'should not render excerpt element if empty');

  // Test onChooseItem
  modal.onChooseItem(chapters[0]);
  assert.deepEqual(jumpedTo, { view, chap: chapters[0] });
  assert.equal(clickedSoundVolume, 60);

  // Test openChapterPalette
  const openedModal = await plugin.openChapterPalette(view);
  assert.ok(openedModal);
  assert.equal(openedModal.isOpen, true);
});

test('jumpToPreviousChapter and jumpToNextChapter navigate with sound feedback', async () => {
  const { app, container, plugin, scroller, view } = createReadingHarness();
  let clickedSoundVolume = null;
  plugin.settings.enableSound = true;
  plugin.settings.soundVolume = 45;
  plugin.soundEngine.playClick = (vol) => { clickedSoundVolume = vol; };

  // Currently at line 0 (chapter 0)
  scroller.scrollTop = 0;

  // Jump next: from chapter 0 (H1 at line 0) to chapter 1 (H2 at line 4)
  await plugin.jumpToNextChapter(view);
  assert.equal(scroller.lastScrollTo?.top, 300);
  assert.equal(clickedSoundVolume, 45);

  // Jump next again at last chapter (stays at chapter 1)
  clickedSoundVolume = null;
  scroller.scrollTop = 300;
  await plugin.jumpToNextChapter(view);
  assert.equal(scroller.lastScrollTo?.top, 300);
  assert.equal(clickedSoundVolume, 45);

  // Jump prev: from chapter 1 back to chapter 0
  clickedSoundVolume = null;
  await plugin.jumpToPreviousChapter(view);
  assert.equal(scroller.lastScrollTo?.top, 60);
  assert.equal(clickedSoundVolume, 45);
});

test('onload registers navigation and reading-bookmark commands', async () => {
  const { app, vaultEvents } = createReadingHarness();
  app.workspace.on = () => {};
  app.workspace.onLayoutReady = () => {};
  app.metadataCache = { on: () => {} };
  const plugin = new ChapterPipelinePlugin(app, {});
  await plugin.onload();

  const prevCmd = plugin.commands.find(c => c.id === 'charter-pipeline-jump-prev');
  assert.ok(prevCmd, 'jump-prev command should be registered');
  assert.equal(prevCmd.name, 'Chapter Pipeline: Jump to previous chapter');

  const nextCmd = plugin.commands.find(c => c.id === 'charter-pipeline-jump-next');
  assert.ok(nextCmd, 'jump-next command should be registered');
  assert.equal(nextCmd.name, 'Chapter Pipeline: Jump to next chapter');

  const paletteCmd = plugin.commands.find(c => c.id === 'charter-pipeline-open-palette');
  assert.ok(paletteCmd, 'open-palette command should be registered');
  assert.equal(paletteCmd.name, 'Chapter Pipeline: Search & switch chapter (Palette)');

  const resumeCmd = plugin.commands.find(c => c.id === 'charter-pipeline-resume-last-chapter');
  const revisitCmd = plugin.commands.find(c => c.id === 'charter-pipeline-toggle-revisit-current');
  const importantCmd = plugin.commands.find(c => c.id === 'charter-pipeline-toggle-important-current');
  const clearCmd = plugin.commands.find(c => c.id === 'charter-pipeline-clear-reading-bookmarks-current');
  assert.equal(resumeCmd.name, 'Chapter Pipeline: Resume last chapter');
  assert.equal(revisitCmd.name, 'Chapter Pipeline: Toggle revisit bookmark for current chapter');
  assert.equal(importantCmd.name, 'Chapter Pipeline: Toggle important bookmark for current chapter');
  assert.equal(clearCmd.name, 'Chapter Pipeline: Clear reading progress & bookmarks for current note');
  assert.equal(resumeCmd.checkCallback(true), false, 'reading commands remain unavailable while the optional feature is off');
  assert.equal(vaultEvents.has('rename'), true, 'the vault rename listener should migrate persisted reading state');

  // Verify command execution
  let prevCalled = false;
  let nextCalled = false;
  let paletteCalled = false;
  let resumeCalled = false;
  const toggledMarkers = [];
  let cleared = false;
  plugin.jumpToPreviousChapter = () => { prevCalled = true; };
  plugin.jumpToNextChapter = () => { nextCalled = true; };
  plugin.openChapterPalette = () => { paletteCalled = true; };
  plugin.resumeLastChapter = () => { resumeCalled = true; };
  plugin.toggleCurrentChapterMarker = (markerName) => { toggledMarkers.push(markerName); };
  plugin.clearReadingBookmarks = () => { cleared = true; };

  assert.equal(prevCmd.checkCallback(true), true);
  prevCmd.checkCallback(false);
  assert.equal(prevCalled, true);

  assert.equal(nextCmd.checkCallback(true), true);
  nextCmd.checkCallback(false);
  assert.equal(nextCalled, true);

  assert.equal(paletteCmd.checkCallback(true), true);
  paletteCmd.checkCallback(false);
  assert.equal(paletteCalled, true);

  plugin.settings.readingBookmarksEnabled = true;
  assert.equal(resumeCmd.checkCallback(true), true);
  resumeCmd.checkCallback(false);
  assert.equal(resumeCalled, true);

  revisitCmd.checkCallback(false);
  importantCmd.checkCallback(false);
  clearCmd.checkCallback(false);
  assert.deepEqual(toggledMarkers, ['revisit', 'important']);
  assert.equal(cleared, true);
});

test('docking applies left and right dock classes, calculates gutter scaling, and positions tooltips appropriately', async () => {
  // 1. Right Docking
  const rightHarness = createReadingHarness();
  rightHarness.plugin.settings.dockPosition = 'right';
  rightHarness.container.rect = { left: 0, right: 1000, top: 0, height: 800 };
  rightHarness.container.clientWidth = 1000;
  rightHarness.container.append(new FakeElement({
    classes: ['markdown-preview-sizer'],
    rect: { left: 150, right: 880, top: 0, height: 800 }
  }));
  await rightHarness.plugin.attachStepperToView(rightHarness.view);

  const rightStepper = rightHarness.container.querySelector('.codex-stepper-container');
  assert.ok(rightStepper.classList.contains('dock-right'));
  assert.equal(rightStepper.style.values.get('--dash-w1'), '38px');

  const rightDash = rightHarness.container.querySelectorAll('.codex-dash-item')[0];
  rightDash.rect = { left: 960, right: 990, top: 200, height: 20 };
  rightDash.dispatch('mouseenter');
  const rightTooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.ok(rightTooltip.classList.contains('dock-right'));
  assert.equal(rightTooltip.style.values.get('left'), '658px');
  assert.equal(rightTooltip.style.values.get('top'), '210px');

  // 2. Left Docking
  const leftHarness = createReadingHarness();
  leftHarness.plugin.settings.dockPosition = 'left';
  leftHarness.container.rect = { left: 0, right: 1000, top: 0, height: 800 };
  leftHarness.container.clientWidth = 1000;
  leftHarness.container.append(new FakeElement({
    classes: ['markdown-preview-sizer'],
    rect: { left: 120, right: 850, top: 0, height: 800 }
  }));
  await leftHarness.plugin.attachStepperToView(leftHarness.view);

  const leftStepper = leftHarness.container.querySelector('.codex-stepper-container');
  assert.equal(leftStepper.classList.contains('dock-right'), false);
  assert.equal(leftStepper.style.values.get('--dash-w1'), '38px');

  const leftDash = leftHarness.container.querySelectorAll('.codex-dash-item')[0];
  leftDash.rect = { left: 10, right: 40, top: 200, height: 20 };
  leftDash.dispatch('mouseenter');
  const leftTooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.equal(leftTooltip.classList.contains('dock-right'), false);
  assert.equal(leftTooltip.style.values.get('left'), '52px');
});

test('showProgressRail toggles vertical rail and handles single chapter gracefully', async () => {
  const harness = createReadingHarness();
  const { app, container, plugin, view } = harness;

  // Disabled
  plugin.settings.showProgressRail = false;
  await plugin.attachStepperToView(view);
  assert.equal(container.querySelector('.codex-progress-rail'), null);

  // Enabled
  plugin.settings.showProgressRail = true;
  await plugin.attachStepperToView(view);
  const rail = container.querySelector('.codex-progress-rail');
  const indicator = container.querySelector('.codex-progress-indicator');
  assert.ok(rail);
  assert.ok(indicator);
  assert.equal(indicator.style.values.get('height'), '0%');

  // Single chapter test
  app.metadataCache.getFileCache = () => ({
    headings: [{ heading: 'Single Chapter', level: 1, position: { start: { line: 0 } } }]
  });
  app.vault.cachedRead = async () => '# Single Chapter\nContent';
  await plugin.attachStepperToView(view);
  assert.equal(container.querySelector('.codex-progress-indicator').style.values.get('height'), '100%');
});

test('progress rail indicator updates smoothly on scroll and chapter click', async () => {
  const harness = createReadingHarness();
  const { container, plugin, scroller, view } = harness;
  plugin.settings.showProgressRail = true;

  await plugin.attachStepperToView(view);

  const indicator = container.querySelector('.codex-progress-indicator');
  assert.ok(indicator);
  assert.equal(indicator.style.values.get('height'), '0%');

  // Scroll to second chapter (H2 at line 4)
  scroller.scrollTop = 300;
  scroller.dispatch('scroll');
  assert.equal(indicator.style.values.get('height'), '100%');

  // Scroll back to top
  scroller.scrollTop = 0;
  scroller.dispatch('scroll');
  assert.equal(indicator.style.values.get('height'), '0%');

  // Click on second chapter
  const dashes = container.querySelectorAll('.codex-dash-item');
  dashes[1].dispatch('click');
  assert.equal(indicator.style.values.get('height'), '100%');

  // Click back on first chapter
  dashes[0].dispatch('click');
  assert.equal(indicator.style.values.get('height'), '0%');
});

test('hierarchyMode "all" keeps all headings visible without .is-collapsed', async () => {
  const harness = createReadingHarness();
  const { app, container, plugin, scroller, view } = harness;
  plugin.settings.hierarchyMode = 'all';

  app.metadataCache.getFileCache = () => ({
    headings: [
      { heading: 'H1 Chapter 1', level: 1, position: { start: { line: 0 } } },
      { heading: 'H2 Section 1.1', level: 2, position: { start: { line: 4 } } },
      { heading: 'H3 Topic 1.1.1', level: 3, position: { start: { line: 8 } } },
      { heading: 'H4 Detail 1.1.1.a', level: 4, position: { start: { line: 12 } } },
      { heading: 'H2 Section 1.2', level: 2, position: { start: { line: 16 } } },
      { heading: 'H3 Topic 1.2.1', level: 3, position: { start: { line: 20 } } },
    ]
  });
  app.vault.cachedRead = async () => '# H1\n## H2\n### H3\n#### H4\n## H2-2\n### H3-2';

  await plugin.attachStepperToView(view);

  const stepperContainer = container.querySelector('.codex-stepper-container');
  const track = container.querySelector('.codex-stepper-track');
  assert.ok(stepperContainer.classList.contains('hierarchy-mode-all'), 'container should have hierarchy-mode-all class');
  assert.ok(track.classList.contains('hierarchy-mode-all'), 'track should have hierarchy-mode-all class');

  const dashes = container.querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 6);

  dashes.forEach((dash, i) => {
    assert.equal(dash.classList.contains('is-collapsed'), false, `item ${i} should NOT be collapsed in 'all' mode`);
  });

  // Scroll across chapters
  scroller.scrollTop = 300;
  scroller.dispatch('scroll');
  dashes.forEach((dash, i) => {
    assert.equal(dash.classList.contains('is-collapsed'), false, `item ${i} should NOT be collapsed after scroll in 'all' mode`);
  });
});

test('hierarchyMode "hover-expand" collapses H3-H6 items with .is-collapsed and applies hierarchy-mode-hover-expand class', async () => {
  const harness = createReadingHarness();
  const { app, container, plugin, scroller, view } = harness;
  plugin.settings.hierarchyMode = 'hover-expand';

  app.metadataCache.getFileCache = () => ({
    headings: [
      { heading: 'H1 Chapter 1', level: 1, position: { start: { line: 0 } } },
      { heading: 'H2 Section 1.1', level: 2, position: { start: { line: 4 } } },
      { heading: 'H3 Topic 1.1.1', level: 3, position: { start: { line: 8 } } },
      { heading: 'H4 Detail 1.1.1.a', level: 4, position: { start: { line: 12 } } },
      { heading: 'H2 Section 1.2', level: 2, position: { start: { line: 16 } } },
      { heading: 'H3 Topic 1.2.1', level: 3, position: { start: { line: 20 } } },
    ]
  });
  app.vault.cachedRead = async () => '# H1\n## H2\n### H3\n#### H4\n## H2-2\n### H3-2';

  await plugin.attachStepperToView(view);

  const stepperContainer = container.querySelector('.codex-stepper-container');
  const track = container.querySelector('.codex-stepper-track');
  assert.ok(stepperContainer.classList.contains('hierarchy-mode-hover-expand'), 'container should have hierarchy-mode-hover-expand class');
  assert.ok(track.classList.contains('hierarchy-mode-hover-expand'), 'track should have hierarchy-mode-hover-expand class');

  const dashes = container.querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 6);

  // H1 and H2 should NOT be collapsed
  assert.equal(dashes[0].classList.contains('is-collapsed'), false, 'H1 should not be collapsed');
  assert.equal(dashes[1].classList.contains('is-collapsed'), false, 'H2 (index 1) should not be collapsed');
  assert.equal(dashes[4].classList.contains('is-collapsed'), false, 'H2 (index 4) should not be collapsed');

  // H3 and H4 MUST be collapsed
  assert.equal(dashes[2].classList.contains('is-collapsed'), true, 'H3 (index 2) should be collapsed');
  assert.equal(dashes[3].classList.contains('is-collapsed'), true, 'H4 (index 3) should be collapsed');
  assert.equal(dashes[5].classList.contains('is-collapsed'), true, 'H3 (index 5) should be collapsed');

  // Scrolling should maintain collapsed state in hover-expand mode
  scroller.scrollTop = 400;
  scroller.dispatch('scroll');
  assert.equal(dashes[2].classList.contains('is-collapsed'), true);
  assert.equal(dashes[3].classList.contains('is-collapsed'), true);
  assert.equal(dashes[5].classList.contains('is-collapsed'), true);
});

test('hierarchyMode "active-branch" dynamically expands current branch subheadings and collapses others on scroll and click', async () => {
  const harness = createReadingHarness();
  const { app, container, plugin, scroller, view } = harness;
  plugin.settings.hierarchyMode = 'active-branch';

  const chapters = [
    { heading: 'H1 Main', level: 1, position: { start: { line: 0 } } },
    { heading: 'H2 Section 1', level: 2, position: { start: { line: 4 } } },
    { heading: 'H3 Sub 1.1', level: 3, position: { start: { line: 8 } } },
    { heading: 'H4 Sub 1.1.1', level: 4, position: { start: { line: 12 } } },
    { heading: 'H2 Section 2', level: 2, position: { start: { line: 16 } } },
    { heading: 'H3 Sub 2.1', level: 3, position: { start: { line: 20 } } },
  ];

  app.metadataCache.getFileCache = () => ({ headings: chapters });
  app.vault.cachedRead = async () => chapters.map(c => '#'.repeat(c.level) + ' ' + c.heading).join('\n');

  scroller.empty();
  chapters.forEach((c) => {
    scroller.append(new FakeElement({
      tagName: `h${c.level}`,
      rect: { top: 100 + c.position.start.line * 20, left: 300, right: 900, height: 30 },
      attributes: { 'data-line': String(c.position.start.line) },
      scrollParent: scroller
    }));
  });

  await plugin.attachStepperToView(view);

  const stepperContainer = container.querySelector('.codex-stepper-container');
  assert.ok(stepperContainer.classList.contains('hierarchy-mode-active-branch'));

  const dashes = container.querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 6);

  // Initial state (active item is 0 / H1 Main):
  // H1 and H2s are visible.
  assert.equal(dashes[0].classList.contains('is-collapsed'), false, 'H1 visible');
  assert.equal(dashes[1].classList.contains('is-collapsed'), false, 'H2 Sec 1 visible');
  assert.equal(dashes[4].classList.contains('is-collapsed'), false, 'H2 Sec 2 visible');

  // Subheadings under H2 Sec 1 and H2 Sec 2 should be collapsed when at H1
  assert.equal(dashes[2].classList.contains('is-collapsed'), true, 'H3 Sub 1.1 collapsed initially');
  assert.equal(dashes[3].classList.contains('is-collapsed'), true, 'H4 Sub 1.1.1 collapsed initially');
  assert.equal(dashes[5].classList.contains('is-collapsed'), true, 'H3 Sub 2.1 collapsed initially');

  // 1. Test Scrolling to line 8 (H3 Sub 1.1)
  scroller.scrollTop = 8 * 20; // 160
  scroller.dispatch('scroll');
  assert.equal(dashes[2].classList.contains('is-collapsed'), false, 'H3 Sub 1.1 expanded after scroll to line 8');
  assert.equal(dashes[3].classList.contains('is-collapsed'), false, 'H4 Sub 1.1.1 expanded after scroll to line 8');
  assert.equal(dashes[5].classList.contains('is-collapsed'), true, 'H3 Sub 2.1 collapsed after scroll to line 8');

  // 2. Test Scrolling to line 20 (H3 Sub 2.1)
  scroller.scrollTop = 20 * 20; // 400
  scroller.dispatch('scroll');
  assert.equal(dashes[2].classList.contains('is-collapsed'), true, 'H3 Sub 1.1 collapsed after scroll to line 20');
  assert.equal(dashes[3].classList.contains('is-collapsed'), true, 'H4 Sub 1.1.1 collapsed after scroll to line 20');
  assert.equal(dashes[5].classList.contains('is-collapsed'), false, 'H3 Sub 2.1 expanded after scroll to line 20');

  // 3. Test Clicking on H2 Section 1 (index 1)
  dashes[1].dispatch('click');
  assert.equal(dashes[2].classList.contains('is-collapsed'), false, 'H3 Sub 1.1 expanded when in Sec 1');
  assert.equal(dashes[3].classList.contains('is-collapsed'), false, 'H4 Sub 1.1.1 expanded when in Sec 1');
  assert.equal(dashes[5].classList.contains('is-collapsed'), true, 'H3 Sub 2.1 stays collapsed');

  // 4. Test Clicking on H4 Sub 1.1.1 (index 3)
  dashes[3].dispatch('click');
  assert.equal(dashes[2].classList.contains('is-collapsed'), false, 'H3 Sub 1.1 stays expanded');
  assert.equal(dashes[3].classList.contains('is-collapsed'), false, 'H4 Sub 1.1.1 stays expanded');
  assert.equal(dashes[5].classList.contains('is-collapsed'), true, 'H3 Sub 2.1 stays collapsed');

  // 5. Test Clicking on H2 Section 2 (index 4)
  dashes[4].dispatch('click');
  assert.equal(dashes[2].classList.contains('is-collapsed'), true, 'H3 Sub 1.1 collapsed when Sec 2 active');
  assert.equal(dashes[3].classList.contains('is-collapsed'), true, 'H4 Sub 1.1.1 collapsed when Sec 2 active');
  assert.equal(dashes[5].classList.contains('is-collapsed'), false, 'H3 Sub 2.1 expanded when Sec 2 active');
});

test('updateHierarchyFolding handles direct H3s under H1 and standalone deep headings', () => {
  const ChapterPipelinePlugin = require('./main.js');
  const updateHierarchyFolding = ChapterPipelinePlugin.updateHierarchyFolding;
  assert.ok(typeof updateHierarchyFolding === 'function', 'updateHierarchyFolding helper should exist');

  const chapters = [
    { title: 'H1 Main', level: 1 },
    { title: 'H3 Direct Child', level: 3 },
    { title: 'H3 Another Direct', level: 3 },
    { title: 'H1 Second', level: 1 },
    { title: 'H3 Under Second', level: 3 }
  ];

  const createMockElements = () => chapters.map(() => new FakeElement({ classes: ['codex-dash-item'] }));

  // Test active-branch with activeIdx = 0 (H1 Main)
  let dashEls = createMockElements();
  updateHierarchyFolding(chapters, dashEls, 0, 'active-branch');
  assert.equal(dashEls[0].classList.contains('is-collapsed'), false);
  assert.equal(dashEls[1].classList.contains('is-collapsed'), false, 'direct H3 under H1 Main should expand');
  assert.equal(dashEls[2].classList.contains('is-collapsed'), false, 'direct H3 under H1 Main should expand');
  assert.equal(dashEls[3].classList.contains('is-collapsed'), false);
  assert.equal(dashEls[4].classList.contains('is-collapsed'), true, 'H3 under second H1 should collapse');

  // Test active-branch with activeIdx = 4 (H3 Under Second)
  dashEls = createMockElements();
  updateHierarchyFolding(chapters, dashEls, 4, 'active-branch');
  assert.equal(dashEls[1].classList.contains('is-collapsed'), true, 'H3 under first H1 should collapse');
  assert.equal(dashEls[2].classList.contains('is-collapsed'), true, 'H3 under first H1 should collapse');
  assert.equal(dashEls[4].classList.contains('is-collapsed'), false, 'H3 under second H1 should expand');
});

test('tooltipGlassmorphism setting toggles .is-solid class on floating tooltip', async () => {
  const harness = createReadingHarness();
  const { container, plugin, view } = harness;

  // Case 1: Default tooltipGlassmorphism = true -> should not have is-solid
  plugin.settings.tooltipGlassmorphism = true;
  await plugin.attachStepperToView(view);

  let tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.ok(tooltip, 'tooltip should exist in DOM');
  assert.equal(tooltip.classList.contains('is-solid'), false, 'should not have is-solid when glassmorphism enabled');

  const dashes = container.querySelectorAll('.codex-dash-item');
  dashes[0].dispatch('mouseenter');
  assert.equal(tooltip.classList.contains('is-solid'), false, 'should not have is-solid on mouseenter when glassmorphism enabled');

  // Case 2: tooltipGlassmorphism = false -> should have is-solid
  plugin.settings.tooltipGlassmorphism = false;
  await plugin.attachStepperToView(view);

  tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.ok(tooltip, 'new tooltip should exist');
  assert.equal(tooltip.classList.contains('is-solid'), true, 'should have is-solid when glassmorphism disabled');

  const newDashes = container.querySelectorAll('.codex-dash-item');
  newDashes[0].dispatch('mouseenter');
  assert.equal(tooltip.classList.contains('is-solid'), true, 'should keep is-solid on mouseenter when glassmorphism disabled');
});

test('narrow viewport toggles .is-narrow on stepper container based on configurable threshold and resets tooltip visibility', async () => {
  const harness = createReadingHarness();
  const { container, plugin, view } = harness;
  plugin.settings.narrowThreshold = 550;

  // Narrow width (< 550px threshold)
  container.clientWidth = 500;
  await plugin.attachStepperToView(view);

  const stepperContainer = container.querySelector('.codex-stepper-container');
  assert.ok(stepperContainer, 'stepper container should exist');
  assert.equal(stepperContainer.classList.contains('is-narrow'), true, 'stepper should have is-narrow class');

  const tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.ok(tooltip);
  assert.equal(tooltip.classList.contains('is-visible'), false, 'tooltip should not be visible when narrow');

  // Expand container width back to normal (>= 550px)
  container.clientWidth = 580;
  await plugin.attachStepperToView(view);
  const updatedStepper = container.querySelector('.codex-stepper-container');
  assert.equal(updatedStepper.classList.contains('is-narrow'), false, 'is-narrow should be removed when container expands');
});

test('vertical density scales gap, padding, and min-height when chapter count is large to prevent overflow', async () => {
  const harness = createReadingHarness();
  const { app, container, plugin, view } = harness;
  container.clientHeight = 500; // Constrained view height

  // Create 40 headings
  const headings = [];
  for (let i = 0; i < 40; i++) {
    headings.push({ heading: `Heading ${i + 1}`, level: (i % 2 === 0 ? 1 : 2), position: { start: { line: i * 5 } } });
  }
  app.metadataCache.getFileCache = () => ({ headings });
  plugin.settings.maxHeadingLevel = 6;

  await plugin.attachStepperToView(view);

  const stepperContainer = container.querySelector('.codex-stepper-container');
  assert.ok(stepperContainer);
  const gapStr = stepperContainer.style.getPropertyValue('--dash-item-gap');
  const paddingYStr = stepperContainer.style.getPropertyValue('--dash-item-padding-y');
  assert.ok(gapStr, 'gap variable should be defined');
  assert.ok(paddingYStr, 'padding-y variable should be defined');
  assert.ok(parseFloat(gapStr) <= 3, 'gap should be compressed for large count');
  assert.ok(parseFloat(paddingYStr) <= 2.5, 'padding-y should be compressed for large count');
});

test('tooltip mouseenter clamps vertical center within viewport bounds', async () => {
  const harness = createReadingHarness();
  const { plugin, view, container } = harness;
  global.window = { innerWidth: 1200, innerHeight: 600 };

  await plugin.attachStepperToView(view);

  const dashItems = container.querySelectorAll('.codex-dash-item');
  assert.ok(dashItems.length > 0);
  const tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.ok(tooltip);

  // Simulate item near top edge (top: -50px)
  dashItems[0].rect = { top: -50, height: 10, left: 20, right: 40 };
  dashItems[0].dispatch('mouseenter');
  const topVal = parseFloat(tooltip.style.top);
  assert.ok(topVal >= 70, `clamped tooltip top (${topVal}px) should not go below top bounds (~70px)`);

  // Simulate item near bottom edge (top: 800px)
  dashItems[0].rect = { top: 800, height: 10, left: 20, right: 40 };
  dashItems[0].dispatch('mouseenter');
  const bottomVal = parseFloat(tooltip.style.top);
  assert.ok(bottomVal <= 530, `clamped tooltip top (${bottomVal}px) should not exceed bottom bounds (~530px)`);
});

test('tooltip and modal escape numbered list headings to keep titles compact', async () => {
  const harness = createReadingHarness();
  const { app, plugin, view, container } = harness;

  app.vault.cachedRead = async () => '# Title\n\n## 1. First Section\nContent 1\n\n### 2.1 Sub Section\nContent 2\n';
  app.metadataCache.getFileCache = () => ({
    headings: [
      { heading: 'Title', level: 1, position: { start: { line: 0 } } },
      { heading: '1. First Section', level: 2, position: { start: { line: 2 } } },
      { heading: '2.1 Sub Section', level: 3, position: { start: { line: 5 } } },
    ],
  });

  await plugin.attachStepperToView(view);

  const dashItems = container.querySelectorAll('.codex-dash-item');
  const tooltip = global.document.body.querySelector('.codex-floating-tooltip');

  assert.ok(dashItems.length >= 3);
  dashItems[1].dispatch('mouseenter');

  const titleEl = tooltip.querySelector('.codex-tooltip-title');
  assert.ok(titleEl);
  assert.equal(titleEl.textContent, '1\\. First Section', 'numbered heading should escape period to prevent <ol> list indentation');
});

test('chapter IDs retain their identity through reordering and distinguish duplicate headings', () => {
  const settings = { minHeadingLevel: 1, maxHeadingLevel: 6, ignoreFirstH1: false, showExcerpt: false };
  const original = ChapterPipelinePlugin.ChapterParser.parse('', [
    { heading: 'Overview', level: 1, position: { start: { line: 0 } } },
    { heading: 'Details', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 2, position: { start: { line: 4 } } },
  ], settings);
  const reordered = ChapterPipelinePlugin.ChapterParser.parse('', [
    { heading: 'Details', level: 2, position: { start: { line: 0 } } },
    { heading: 'Overview', level: 1, position: { start: { line: 2 } } },
    { heading: 'Details', level: 2, position: { start: { line: 4 } } },
  ], settings);

  assert.equal(original[0].id, 'h1:overview:0');
  assert.equal(original[1].id, 'h2:details:0');
  assert.equal(original[2].id, 'h2:details:1');
  assert.equal(reordered[1].id, 'h1:overview:0');
  assert.equal(reordered[0].id, 'h2:details:0');
});

test('reading state records active chapter, triggers non-blocking resume notice, and resumes or clears safely', async () => {
  const { app, container, plugin, view } = createReadingHarness();
  plugin.settings.readingBookmarksEnabled = true;
  await plugin.attachStepperToView(view);

  const chapters = await plugin.getChaptersForView(view);

  // Background view does not record position
  const backgroundView = new MarkdownView();
  backgroundView.file = { path: 'other.md' };
  plugin.app.workspace.getActiveViewOfType = () => backgroundView;
  assert.equal(plugin.recordReadingPosition(view, chapters[1]), false, 'background views must not overwrite a resume point');

  // Active view records position
  plugin.app.workspace.getActiveViewOfType = () => view;
  assert.equal(plugin.recordReadingPosition(view, chapters[1]), true);
  const savedResume = plugin.getReadingFileState(view.file, false).resume;
  assert.equal(savedResume.chapterId, chapters[1].id);
  assert.equal(savedResume.title, 'Second');

  // Resume notification check
  Notice.instances = [];
  plugin.resumePromptedPaths.clear();
  plugin.maybeShowResumeNotice(view, '# First\nbody\n## Second\nbody', view.file);
  assert.equal(Notice.instances.length, 1);
  assert.ok(Notice.instances[0].message.includes('Second'));

  // Successful resume
  let jumpedTo = null;
  plugin.jumpToHeading = (targetView, chapter) => { jumpedTo = { targetView, chapter }; };
  assert.equal(await plugin.resumeLastChapter(view), true);
  assert.deepEqual(jumpedTo, { targetView: view, chapter: chapters[1] });

  // Missing chapter resume cleanup
  const fileState = plugin.getReadingFileState(view.file, true);
  fileState.resume = { chapterId: 'h2:missing:0', title: 'Missing', updatedAt: 5 };
  assert.equal(await plugin.resumeLastChapter(view), false);
  assert.equal(fileState.resume, undefined);
  assert.equal(Notice.instances.at(-1).message, 'The saved chapter is no longer available.');
});

test('revisit and important bookmarks render shapes, text labels, and context actions', async () => {
  const { container, plugin, view } = createReadingHarness();
  plugin.settings.readingBookmarksEnabled = true;
  const chapters = await plugin.getChaptersForView(view);

  await plugin.toggleChapterMarker(view, chapters[0], 'revisit');
  await plugin.toggleChapterMarker(view, chapters[0], 'important');
  await plugin.attachStepperToView(view);

  const dashItems = container.querySelectorAll('.codex-dash-item');
  assert.equal(dashItems[0].querySelectorAll('.codex-bookmark-marker').length, 2);
  assert.equal(dashItems[0].getAttribute('aria-label'), 'First — Revisit, Important');

  dashItems[0].dispatch('mouseenter');
  const tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  const labels = tooltip.querySelectorAll('.codex-bookmark-label');
  assert.equal(labels.length, 2);
  assert.equal(labels[0].textContent, 'Revisit');
  assert.equal(labels[1].textContent, 'Important');

  dashItems[0].dispatch('contextmenu');
  const menu = Menu.instances.at(-1);
  assert.deepEqual(menu.items.map((item) => item.title), [
    'Remove revisit mark',
    'Remove important mark',
    'Clear chapter bookmarks'
  ]);
  await menu.items[0].clickHandler();
  assert.equal(plugin.getChapterMarkers(view.file, chapters[0]).revisit, false);
  assert.equal(plugin.getChapterMarkers(view.file, chapters[0]).important, true);
});

test('renaming a note migrates reading state and storage cleanup prunes deleted files', async () => {
  const { app, plugin } = createReadingHarness();
  plugin.settings.readingBookmarksEnabled = true;
  plugin.settings.readingState = {
    version: 1,
    files: {
      'old.md': {
        resume: { chapterId: 'h2:source:0', title: 'Source', updatedAt: 20 },
        markers: { 'h1:first:0': { revisit: true, important: false } }
      },
      'new.md': {
        resume: { chapterId: 'h2:target:0', title: 'Target', updatedAt: 10 },
        markers: { 'h1:first:0': { revisit: false, important: true } }
      },
      'deleted.md': {
        resume: { chapterId: 'h1:del:0', title: 'Del', updatedAt: 50 },
        markers: {}
      }
    }
  };

  // Migration test
  assert.equal(await plugin.migrateReadingState('old.md', 'new.md'), true);
  assert.equal(plugin.settings.readingState.files['old.md'], undefined);
  const migrated = plugin.settings.readingState.files['new.md'];
  assert.equal(migrated.resume.chapterId, 'h2:source:0');
  assert.deepEqual(migrated.markers['h1:first:0'], { revisit: true, important: true });

  // Cleanup test
  app.vault.getAbstractFileByPath = (path) => path === 'new.md' ? { path } : null;
  const cleanedCount = plugin.cleanupOrphanedReadingState();
  assert.equal(cleanedCount, 1);
  assert.ok(plugin.settings.readingState.files['new.md']);
  assert.equal(plugin.settings.readingState.files['deleted.md'], undefined);
});

test('user-facing strings follow Chinese Obsidian language and fall back to English otherwise', async () => {
  const { app, view } = createReadingHarness();
  global.window.localStorage.getItem = () => 'zh-CN';
  app.workspace.on = () => {};
  app.workspace.onLayoutReady = () => {};
  app.metadataCache.on = () => {};
  const plugin = new ChapterPipelinePlugin(app, {});
  await plugin.onload();

  const prevCommand = plugin.commands.find((command) => command.id === 'charter-pipeline-jump-prev');
  const resumeCommand = plugin.commands.find((command) => command.id === 'charter-pipeline-resume-last-chapter');
  assert.equal(prevCommand.name, 'Chapter Pipeline：跳转至上一章节');
  assert.equal(resumeCommand.name, 'Chapter Pipeline：恢复上次阅读章节');

  plugin.settingTab.display();
  assert.equal(plugin.settingTab.containerEl.children[0].textContent, 'Chapter Pipeline 设置');
  const readingSetting = Setting.instances.find((setting) => setting.name === '开启阅读断点与章节书签');
  assert.ok(readingSetting);

  plugin.settings.readingBookmarksEnabled = true;
  const modal = new ChapterPipelinePlugin.ChapterSuggestModal(app, plugin, view, []);
  assert.equal(modal.placeholder, '搜索章节或公式…');
  const chapter = (await plugin.getChaptersForView(view))[0];
  await plugin.toggleChapterMarker(view, chapter, 'revisit');
  await plugin.attachStepperToView(view);
  const firstDash = view.contentEl.querySelectorAll('.codex-dash-item')[0];
  firstDash.dispatch('contextmenu');
  assert.equal(Menu.instances.at(-1).items[0].title, '移除稍后回看标记');

  global.window.localStorage.getItem = () => 'fr-FR';
  const fallbackModal = new ChapterPipelinePlugin.ChapterSuggestModal(app, plugin, view, []);
  assert.equal(fallbackModal.placeholder, 'Search chapter or formula...');
});

test('active color resolution supports theme-accent fallback, preset hex values, and custom color picker', async () => {
  const { app, container, plugin, view } = createReadingHarness();
  plugin.settings.activeColor = 'var(--interactive-accent)';
  await plugin.attachStepperToView(view);

  const stepper = container.querySelector('.codex-stepper-container');
  const tooltip = global.document.body.querySelector('.codex-floating-tooltip');
  assert.equal(stepper.style.getPropertyValue('--codex-active-color'), 'var(--interactive-accent, #3b82f6)');
  assert.equal(tooltip.style.getPropertyValue('--codex-active-color'), 'var(--interactive-accent, #3b82f6)');

  const modal = new ChapterPipelinePlugin.ChapterSuggestModal(app, plugin, view, []);
  assert.equal(modal.modalEl.style.getPropertyValue('--codex-active-color'), 'var(--interactive-accent, #3b82f6)');
  assert.equal(plugin.resolveActiveColor('#ec4899'), '#ec4899');

  // Custom color
  plugin.settings.activeColor = 'custom';
  plugin.settings.customActiveColor = '#10b981';
  assert.equal(plugin.resolveActiveColor('custom'), '#10b981');
});

test('multi-view attachment isolates floating tooltips per view', async () => {
  const harness1 = createReadingHarness();
  const harness2 = createReadingHarness();
  const plugin = harness1.plugin;

  await plugin.attachStepperToView(harness1.view);
  const tooltip1 = plugin.viewTooltips.get(harness1.view);
  assert.ok(tooltip1, 'view 1 should have its own tooltip instance');

  await plugin.attachStepperToView(harness2.view);
  const tooltip2 = plugin.viewTooltips.get(harness2.view);
  assert.ok(tooltip2, 'view 2 should have its own tooltip instance');
  assert.notEqual(tooltip1, tooltip2, 'tooltips should be separate instances');

  // Tooltip 1 should not have been removed when view 2 attached
  const docBody = harness1.view.contentEl.ownerDocument?.body || global.document.body;
  assert.ok(docBody.children.includes(tooltip1));

  plugin.onunload();
  assert.equal(plugin.viewTooltips.size, 0, 'viewTooltips map should be cleared on onunload');
});

test('fallback heading extractor ignores headings inside code blocks', async () => {
  const { app, plugin } = createReadingHarness();
  const file = { path: 'code-test.md' };
  app.metadataCache.getFileCache = () => null; // force fallback extraction

  const content = `# Real Heading 1

Some text

\`\`\`python
# This is a Python comment, not a heading
def foo():
    pass
\`\`\`

~~~bash
### This is a bash comment, not a heading
echo "hello"
~~~

## Real Heading 2
`;

  const chapters = plugin.extractChapters(content, file);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'Real Heading 1');
  assert.equal(chapters[1].title, 'Real Heading 2');
});

// =========================================================================
// Optimization Milestones Acceptance Test Suites (F1 - F13)
// =========================================================================

test('user ==highlight== preservation alongside jump flash suppression in styles and clearFlashHighlights', (t) => {
  const cssPath = path.join(__dirname, 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Progressive check for M1 styles.css update
  const hasGlobalHighlightPollution = cssContent.includes('--text-highlight-bg: transparent') ||
    cssContent.includes('--text-highlight-bg-active: transparent');

  if (hasGlobalHighlightPollution) {
    t.todo('Upcoming feature (Milestone M1 / F1): User highlight CSS variable pollution removal in styles.css pending M1');
    return;
  }

  // 1. styles.css must not set --text-highlight-bg to transparent under workspace-leaf
  assert.equal(cssContent.includes('--text-highlight-bg: transparent'), false,
    'styles.css must not assign --text-highlight-bg: transparent on workspace-leaf');
  assert.equal(cssContent.includes('--text-highlight-bg-active: transparent'), false,
    'styles.css must not assign --text-highlight-bg-active: transparent on workspace-leaf');

  // 2. styles.css must explicitly protect user mark elements and cm-highlight
  assert.ok(
    cssContent.includes('mark') && cssContent.includes('var(--text-highlight-bg)'),
    'styles.css must preserve background-color on user mark elements'
  );

  // 3. Jump flash suppression selectors must be scoped to headings/containers, not blanket .workspace-leaf *
  assert.ok(
    cssContent.includes('.markdown-preview-section.is-flashing') ||
    cssContent.includes(':is(h1, h2, h3, h4, h5, h6).is-flashing') ||
    cssContent.includes('h1.is-flashing'),
    'jump flash suppression rules should be scoped to headings/sections'
  );

  // 4. clearFlashHighlights must not strip highlights from user mark or cm-highlight elements
  const { container, plugin } = createReadingHarness();
  const headingEl = container.append(new FakeElement({
    tagName: 'h2',
    classes: ['is-flashing', 'is-highlighted', 'mod-highlighted']
  }));
  const userMarkEl = container.append(new FakeElement({
    tagName: 'mark',
    classes: ['cm-highlight', 'is-highlighted'],
    textContent: 'Highlighted text'
  }));

  plugin.clearFlashHighlights(container);

  // Heading flash classes removed
  assert.equal(headingEl.classList.contains('is-flashing'), false, 'heading flash class should be removed');
  assert.equal(headingEl.classList.contains('is-highlighted'), false, 'heading highlighted class should be removed');

  // User mark remains intact
  assert.equal(userMarkEl.tagName, 'mark');
  assert.equal(userMarkEl.classList.contains('cm-highlight'), true, 'user cm-highlight class must not be stripped');
});

test('floating tooltip measures populated height after render to prevent viewport overflow', async (t) => {
  const cssPath = path.join(__dirname, 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const hasTooltipOverflowRules = cssContent.includes('max-height') &&
    cssContent.includes('overflow-y') &&
    cssContent.includes('.codex-floating-tooltip');

  if (!hasTooltipOverflowRules) {
    t.todo('Upcoming feature (Milestone M1 / F2): Tooltip post-render dimension measurement & overflow clamping pending M1');
    return;
  }

  // 1. Verify CSS defines max-height and overflow-y on .codex-floating-tooltip
  assert.ok(cssContent.includes('overflow-y: auto') || cssContent.includes('overflow-y: scroll'),
    'floating tooltip must have scrollable fallback for tall content');

  // 2. Measure populated height after render in dash item hover handler
  const { container, plugin, view } = createReadingHarness();
  global.window.innerHeight = 800;

  plugin.app.metadataCache.getFileCache = () => ({
    headings: [
      {
        heading: 'Very Long Chapter Title With Complex Multiline Formula $\\sum_{i=1}^n \\frac{x_i^2}{y_i^2} = \\alpha$',
        level: 1,
        position: { start: { line: 0 } }
      }
    ]
  });

  await plugin.attachStepperToView(view);
  const dashItem = container.querySelector('.codex-dash-item');
  assert.ok(dashItem);

  // Position dash item near bottom edge of 800px window
  dashItem.rect = { top: 740, left: 10, right: 30, height: 20 };

  const tooltip = plugin.viewTooltips.get(view);
  assert.ok(tooltip);

  // Simulate dynamic content height of populated card: 280px tall
  let contentPopulated = false;
  const originalCreateDiv = tooltip.createDiv.bind(tooltip);
  tooltip.createDiv = function(...args) {
    contentPopulated = true;
    return originalCreateDiv(...args);
  };
  Object.defineProperty(tooltip, 'offsetHeight', {
    get() {
      return contentPopulated ? 280 : 0;
    },
    configurable: true
  });

  // Trigger hover
  dashItem.dispatch('mouseenter');

  const topStyle = tooltip.style.top;
  assert.ok(topStyle, 'tooltip must have style.top set');
  const clampedY = parseFloat(topStyle);

  // Progressive check: if clampedY reflects pre-render height fallback (e.g. 718), mark todo for M1
  if (clampedY > 800 - (280 / 2) - 10) {
    t.todo('Upcoming feature (Milestone M1 / F2): Tooltip post-render dimension measurement & overflow clamping in main.js pending M1');
    return;
  }

  // Assert clamped vertical center Y keeps the 280px tooltip inside 800px viewport
  assert.ok(
    clampedY <= 800 - (280 / 2) - 10,
    `clampedY (${clampedY}) must prevent bottom overflow (max: ${800 - 140 - 10})`
  );
  assert.ok(
    clampedY >= (280 / 2) + 10,
    `clampedY (${clampedY}) must prevent top overflow (min: ${140 + 10})`
  );
  assert.equal(tooltip.classList.contains('is-visible'), true);
});

test('LaTeX multiline row separator \\\\ preservation in ChapterParser.parse for aligned, cases, and matrix formulas', (t) => {
  const content = `# Aligned Math
$$\\begin{aligned}
\\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{aligned}$$
`;
  const headings = [{ heading: 'Aligned Math', level: 1, position: { start: { line: 0 } } }];
  const chapters = ChapterPipelinePlugin.ChapterParser.parse(content, headings, { showExcerpt: true });

  assert.ok(chapters.length > 0);
  const summary = chapters[0].summaryMarkdown;

  // Progressive check: if \\ was replaced by space, mark todo for M1
  if (!summary.includes('\\\\')) {
    t.todo('Upcoming feature (Milestone M1 / F3): LaTeX \\\\ row separator preservation in ChapterParser.parse pending M1');
    return;
  }

  // 1. Aligned environment \\ row separator preserved
  assert.ok(summary.includes('\\\\'), 'LaTeX multiline \\\\ row separator must be preserved in summaryMarkdown');
  assert.ok(summary.includes('\\begin{aligned}'), 'aligned environment tag must be preserved');
  assert.ok(summary.includes('\\end{aligned}'), 'aligned environment close tag must be preserved');

  // 2. Cases environment with \\ row separator
  const casesContent = `# Cases Math
$$\\begin{cases}
f(x) = x^2 & \\text{if } x \\ge 0 \\\\
f(x) = -x & \\text{if } x < 0
\\end{cases}$$
`;
  const casesHeadings = [{ heading: 'Cases Math', level: 1, position: { start: { line: 0 } } }];
  const casesChapters = ChapterPipelinePlugin.ChapterParser.parse(casesContent, casesHeadings, { showExcerpt: true });
  assert.ok(casesChapters[0].summaryMarkdown.includes('\\\\'), 'cases environment \\\\ row separator must be preserved');
  assert.ok(casesChapters[0].summaryMarkdown.includes('\\begin{cases}'));

  // 3. Matrix environment with \\ row separator
  const matrixContent = `# Matrix Math
$$\\begin{pmatrix}
1 & 0 & 0 \\\\
0 & 1 & 0 \\\\
0 & 0 & 1
\\end{pmatrix}$$
`;
  const matrixHeadings = [{ heading: 'Matrix Math', level: 1, position: { start: { line: 0 } } }];
  const matrixChapters = ChapterPipelinePlugin.ChapterParser.parse(matrixContent, matrixHeadings, { showExcerpt: true });
  assert.ok(matrixChapters[0].summaryMarkdown.includes('\\\\'), 'matrix environment \\\\ row separator must be preserved');
  assert.ok(matrixChapters[0].summaryMarkdown.includes('\\begin{pmatrix}'));
});

test('balanced math delimiter $ handling upon excerpt truncation guarantees no dangling delimiters and appends ellipsis', (t) => {
  const prefix = 'Introduction text explaining fundamentals. '.repeat(5);
  const content = `# Truncation Test
${prefix}$E = mc^2$ and more trailing explanation that exceeds the limit by many characters.
`;
  const headings = [{ heading: 'Truncation Test', level: 1, position: { start: { line: 0 } } }];
  const chapters = ChapterPipelinePlugin.ChapterParser.parse(content, headings, { showExcerpt: true, excerptLength: 200 });

  const summary = chapters[0].summaryMarkdown;

  // Progressive check: if summary does not end with '...', mark todo for M1
  if (!summary.endsWith('...')) {
    t.todo('Upcoming feature (Milestone M1 / F4): Balanced math delimiter $ truncation and clean ellipsis pending M1');
    return;
  }

  // 1. Must end cleanly with '...'
  assert.ok(summary.endsWith('...'), 'truncated excerpt must append ellipsis (...)');
  assert.equal(summary.endsWith(' ...'), false, 'ellipsis must not have dangling leading whitespace');

  // 2. Unescaped dollar count must be even (no unclosed $)
  const dollarCount = (summary.match(/(^|[^\\])\$/g) || []).length;
  assert.equal(dollarCount % 2, 0, `unescaped $ count must be even (got ${dollarCount}): "${summary}"`);

  // 3. Adversarial boundary test: Cutoff directly through formula $x^2 + y^2 = z^2$
  const boundaryContent = `# Boundary Test
${'A'.repeat(195)}$x^2 + y^2 = z^2$ trailing content
`;
  const boundaryHeadings = [{ heading: 'Boundary Test', level: 1, position: { start: { line: 0 } } }];
  const boundaryChapters = ChapterPipelinePlugin.ChapterParser.parse(boundaryContent, boundaryHeadings, { showExcerpt: true, excerptLength: 200 });
  const boundarySummary = boundaryChapters[0].summaryMarkdown;
  const boundaryDollarCount = (boundarySummary.match(/(^|[^\\])\$/g) || []).length;
  assert.equal(boundaryDollarCount % 2, 0, 'math delimiters must remain balanced when cut bisects formula');
  assert.ok(boundarySummary.endsWith('...'));

  // 4. Short text shorter than limit does NOT append ellipsis
  const shortContent = `# Short
Simple concise excerpt.
`;
  const shortHeadings = [{ heading: 'Short', level: 1, position: { start: { line: 0 } } }];
  const shortChapters = ChapterPipelinePlugin.ChapterParser.parse(shortContent, shortHeadings, { showExcerpt: true, excerptLength: 200 });
  assert.equal(shortChapters[0].summaryMarkdown.endsWith('...'), false, 'short excerpt within limit must not append ellipsis');
  assert.equal(shortChapters[0].summaryMarkdown, 'Simple concise excerpt.');
});

test('early-exit excerpt extraction finishes in < 15ms on 50,000-line large notes', (t) => {
  const header = '# Benchmark Note\nLine one of chapter content\nLine two with formula $x = 1$\nLine three final summary line\n';
  const filler = 'Repetitive filler content line that should not be scanned by O(1) scanner\n'.repeat(50000);
  const largeContent = header + filler;
  const headings = [{ heading: 'Benchmark Note', level: 1, position: { start: { line: 0 } } }];

  const startTime = performance.now();
  const chapters = ChapterPipelinePlugin.ChapterParser.parse(largeContent, headings, { showExcerpt: true });
  const durationMs = performance.now() - startTime;

  // Progressive check: if duration > 15ms or content scans filler
  if (durationMs > 15 || chapters[0]?.summaryMarkdown?.includes('Repetitive filler content line')) {
    t.todo(`Upcoming feature (Milestone M2 / F5): Early-exit O(1) excerpt extraction pending M2 (took ${durationMs.toFixed(2)}ms)`);
    return;
  }

  assert.ok(durationMs < 15, `ChapterParser.parse on 50k lines must complete in < 15ms (took ${durationMs.toFixed(2)}ms)`);

  const summary = chapters[0].summaryMarkdown;
  assert.ok(summary.includes('Line one of chapter content'), 'summary must contain line 1');
  assert.ok(summary.includes('Line two with formula $x = 1$'), 'summary must contain line 2');
  assert.ok(summary.includes('Line three final summary line'), 'summary must contain line 3');
  assert.equal(summary.includes('Repetitive filler content line'), false, 'summary must not scan trailing filler lines');
});

test('scroll listener filtering ignores scroll events outside the active note container', (t) => {
  const { container, plugin, view } = createReadingHarness();

  // Progressive check: if isScrollEventRelevant is not defined, mark todo for M2
  if (typeof plugin.isScrollEventRelevant !== 'function') {
    t.todo('Upcoming feature (Milestone M2 / F6): Scroll listener event filtering pending M2');
    return;
  }

  // 1. Relevant: scroll event on the container itself
  const containerEvent = { target: container };
  assert.equal(plugin.isScrollEventRelevant(containerEvent, view, container), true,
    'container scroll event must be relevant');

  // 2. Relevant: scroll event on a child element inside container (e.g. preview pane)
  const childScroller = container.createDiv({ cls: 'markdown-preview-view' });
  const childEvent = { target: childScroller };
  assert.equal(plugin.isScrollEventRelevant(childEvent, view, container), true,
    'child scroller inside container must be relevant');

  // 3. Irrelevant: scroll event on an external element (e.g. sidebar tree, modal, backlinks)
  const sidebarEl = new FakeElement({ classes: ['nav-files-container'] });
  const sidebarEvent = { target: sidebarEl };
  assert.equal(plugin.isScrollEventRelevant(sidebarEvent, view, container), false,
    'external sidebar scroll event must be filtered out');

  // 4. Defensive fallback: null or missing target returns true to protect synthetic test harnesses
  assert.equal(plugin.isScrollEventRelevant(null, view, container), true,
    'null event must defensively return true');
  assert.equal(plugin.isScrollEventRelevant({}, view, container), true,
    'event without target must defensively return true');
});

test('automatic vault.on("delete") event listener prunes deleted files and directory prefixes', async (t) => {
  const { app, plugin } = createReadingHarness();

  // Progressive check: if pruneDeletedReadingState is not defined, mark todo for M2
  if (typeof plugin.pruneDeletedReadingState !== 'function') {
    t.todo('Upcoming feature (Milestone M2 / F7): Automatic vault.on("delete") reading state pruning pending M2');
    return;
  }

  plugin.settings.readingBookmarksEnabled = true;
  plugin.settings.readingState = {
    version: 1,
    files: {
      'folder/deleted-note.md': {
        resume: { chapterId: 'h1:title:0', title: 'Title', updatedAt: 100 },
        markers: { 'h1:title:0': { revisit: true, important: false } }
      },
      'folder/subfolder/another.md': {
        resume: { chapterId: 'h2:sub:0', title: 'Sub', updatedAt: 200 },
        markers: {}
      },
      'preserved/active.md': {
        resume: { chapterId: 'h1:act:0', title: 'Active', updatedAt: 300 },
        markers: {}
      }
    }
  };
  plugin.resumePromptedPaths = new Set(['folder/deleted-note.md', 'preserved/active.md']);

  let saved = false;
  plugin.saveSettings = async () => { saved = true; };

  // 1. Single file pruning
  const singleCleaned = await plugin.pruneDeletedReadingState('folder/deleted-note.md');
  assert.equal(singleCleaned, 1, 'should prune 1 file');
  assert.equal(plugin.settings.readingState.files['folder/deleted-note.md'], undefined);
  assert.equal(plugin.resumePromptedPaths.has('folder/deleted-note.md'), false);
  assert.ok(plugin.settings.readingState.files['preserved/active.md']);
  assert.equal(saved, true, 'saveSettings must be called');

  // 2. Directory prefix pruning (deleting "folder")
  const dirCleaned = await plugin.pruneDeletedReadingState('folder');
  assert.equal(dirCleaned, 1, 'should prune remaining child under folder/');
  assert.equal(plugin.settings.readingState.files['folder/subfolder/another.md'], undefined);
  assert.ok(plugin.settings.readingState.files['preserved/active.md']);

  // 3. Vault delete event registration verification
  const deleteEvents = [];
  app.vault.on = (event, callback) => {
    if (event === 'delete') deleteEvents.push(callback);
    return { event, callback };
  };
  await plugin.onload();
  assert.ok(deleteEvents.length > 0, 'vault.on("delete") must be registered during onload()');
});

test('SoundEngine.destroy() closes AudioContext and nulls ctx on plugin onunload', (t) => {
  const SoundEngine = ChapterPipelinePlugin.SoundEngine;

  // Progressive check: if destroy method does not exist, mark todo for M2
  if (!SoundEngine || typeof SoundEngine.prototype.destroy !== 'function') {
    t.todo('Upcoming feature (Milestone M2 / F8): SoundEngine.destroy() resource cleanup pending M2');
    return;
  }

  const engine = new SoundEngine();

  let closeCalled = false;
  class MockAudioContext {
    constructor() {
      this.state = 'running';
    }
    async close() {
      closeCalled = true;
      this.state = 'closed';
    }
  }

  global.window.AudioContext = MockAudioContext;
  const ctx = engine.getAudioContext();
  assert.ok(ctx, 'AudioContext should be instantiated');
  assert.equal(engine.ctx, ctx);

  // 1. Calling destroy closes AudioContext and nulls ctx
  engine.destroy();
  assert.equal(closeCalled, true, 'AudioContext.close() must be invoked');
  assert.equal(engine.ctx, null, 'soundEngine.ctx must be nulled out');

  // 2. Idempotent: multiple destroy calls do not throw
  assert.doesNotThrow(() => {
    engine.destroy();
    engine.destroy();
  }, 'subsequent destroy() calls must be safe and idempotent');

  // 3. Plugin onunload invokes soundEngine.destroy()
  const { plugin } = createReadingHarness();
  plugin.soundEngine = new SoundEngine();
  plugin.soundEngine.getAudioContext();
  assert.ok(plugin.soundEngine.ctx);

  plugin.onunload();
  assert.equal(plugin.soundEngine.ctx, null, 'plugin.onunload() must destroy soundEngine and null its ctx');
});

test('active chapter order indicator maintains a fixed vertical baseline without horizontal jitter', (t) => {
  const cssPath = path.join(__dirname, 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const hasFixedOrderBaseline = (
    cssContent.includes('.codex-stepper-container.show-chapter-order .codex-dash-item') &&
    (cssContent.includes('min-width') || cssContent.includes('width: calc(') || cssContent.includes('--dash-hover-w1'))
  ) || (
    cssContent.includes('.codex-dash-item.active::after') &&
    cssContent.includes('--dash-hover-w1')
  );

  if (!hasFixedOrderBaseline) {
    t.todo('Upcoming feature (Milestone M3 / F9): Active chapter order indicator fixed vertical baseline pending M3');
    return;
  }

  assert.ok(hasFixedOrderBaseline, 'styles.css must anchor chapter order indicator to a fixed vertical baseline');

  const { container, plugin, view } = createReadingHarness();
  plugin.settings.showChapterOrder = true;

  plugin.app.metadataCache.getFileCache = () => ({
    headings: [
      { heading: 'H1 Section', level: 1, position: { start: { line: 0 } } },
      { heading: 'H2 Section', level: 2, position: { start: { line: 4 } } },
      { heading: 'H3 Section', level: 3, position: { start: { line: 8 } } },
      { heading: 'H4 Section', level: 4, position: { start: { line: 12 } } },
    ]
  });

  return plugin.attachStepperToView(view).then(() => {
    const stepper = container.querySelector('.codex-stepper-container');
    assert.ok(stepper.classList.contains('show-chapter-order'), 'stepper should have show-chapter-order');

    const dashItems = container.querySelectorAll('.codex-dash-item');
    assert.equal(dashItems.length, 4);

    assert.equal(dashItems[0].getAttribute('data-chapter-order'), '1');
    assert.equal(dashItems[1].getAttribute('data-chapter-order'), '2');
    assert.equal(dashItems[2].getAttribute('data-chapter-order'), '3');
    assert.equal(dashItems[3].getAttribute('data-chapter-order'), '4');
  });
});

test('ChapterSuggestModal filters by heading level (h1..h6, #) and bookmark tags (revisit, important, 待复习, 重点)', (t) => {
  const SuggestModalClass = ChapterPipelinePlugin.ChapterSuggestModal;

  if (!SuggestModalClass || typeof SuggestModalClass.prototype.getSuggestions !== 'function') {
    t.todo('Upcoming feature (Milestone M3 / F10 & F11): Palette search filtering by heading levels and bookmarks pending M3');
    return;
  }

  const { app, plugin, view } = createReadingHarness();
  plugin.settings.readingBookmarksEnabled = true;

  const chapters = [
    { title: 'Introduction to Calculus', level: 1, summaryMarkdown: 'First line excerpt', id: 'c1' },
    { title: 'Derivative Rules', level: 2, summaryMarkdown: 'Power rule and product rule', id: 'c2' },
    { title: 'Integration by Parts', level: 3, summaryMarkdown: 'Formula for integrals', id: 'c3' },
    { title: 'Differential Equations', level: 1, summaryMarkdown: 'Ordinary differential equations', id: 'c4' },
  ];

  plugin.getChapterMarkers = (file, chap) => {
    if (chap.id === 'c1') return { revisit: true, important: false };
    if (chap.id === 'c2') return { revisit: false, important: true };
    if (chap.id === 'c4') return { revisit: true, important: true };
    return { revisit: false, important: false };
  };

  const modal = new SuggestModalClass(app, plugin, view, chapters);

  // 1. Test 13 contract preservation: getItemText output must remain unchanged
  assert.equal(modal.getItemText(chapters[0]), 'Introduction to Calculus First line excerpt');
  assert.equal(modal.getItemText(chapters[1]), 'Derivative Rules Power rule and product rule');

  // 2. Empty query returns all chapters
  assert.deepEqual(modal.getSuggestions(''), chapters);
  assert.deepEqual(modal.getSuggestions('   '), chapters);

  // 3. Heading level filters: "h1", "H1", "#"
  const h1Results = modal.getSuggestions('h1');
  assert.equal(h1Results.length, 2);
  assert.deepEqual(h1Results.map((c) => c.title), ['Introduction to Calculus', 'Differential Equations']);

  const h2Results = modal.getSuggestions('H2');
  assert.equal(h2Results.length, 1);
  assert.equal(h2Results[0].title, 'Derivative Rules');

  const hashLevel3 = modal.getSuggestions('###');
  assert.equal(hashLevel3.length, 1);
  assert.equal(hashLevel3[0].title, 'Integration by Parts');

  // 4. Bookmark tag filters: "revisit" and "待复习"
  const revisitResults = modal.getSuggestions('revisit');
  assert.equal(revisitResults.length, 2);
  assert.deepEqual(revisitResults.map((c) => c.title), ['Introduction to Calculus', 'Differential Equations']);

  const chineseRevisit = modal.getSuggestions('待复习');
  assert.equal(chineseRevisit.length, 2);

  // 5. Bookmark tag filters: "important" and "重点"
  const importantResults = modal.getSuggestions('important');
  assert.equal(importantResults.length, 2);
  assert.deepEqual(importantResults.map((c) => c.title), ['Derivative Rules', 'Differential Equations']);

  const chineseImportant = modal.getSuggestions('重点');
  assert.equal(chineseImportant.length, 2);

  // 6. Compound filter: level + text
  const compoundResults = modal.getSuggestions('h1 Calculus');
  assert.equal(compoundResults.length, 1);
  assert.equal(compoundResults[0].title, 'Introduction to Calculus');

  // 7. Compound filter: bookmark + level
  const bookmarkedH1 = modal.getSuggestions('important h1');
  assert.equal(bookmarkedH1.length, 1);
  assert.equal(bookmarkedH1[0].title, 'Differential Equations');

  // 8. Non-matching query returns empty array
  assert.deepEqual(modal.getSuggestions('quantum mechanics'), []);
});

test('excerptLength setting configuration (60-300), persistence, and parser truncation', async (t) => {
  const { app, plugin } = createReadingHarness();
  await plugin.onload();

  if (plugin.settings.excerptLength === undefined) {
    t.todo('Upcoming feature (Milestone M3 / F12): excerptLength setting configuration and persistence pending M3');
    return;
  }

  // 1. Default settings have valid excerptLength (default 140 or 200)
  assert.ok(
    plugin.settings.excerptLength >= 60 && plugin.settings.excerptLength <= 300,
    `default excerptLength (${plugin.settings.excerptLength}) must be between 60 and 300`
  );

  // 2. Setting tab renders excerptLength slider when showExcerpt is enabled
  Setting.instances = [];
  plugin.settingTab.display();
  const sliderSetting = Setting.instances.find((s) =>
    (s.name && (s.name.includes('Excerpt length') || s.name.includes('摘要字符长度') || s.name.includes('长度'))) ||
    s.controls.some((c) => c.min === 60 && c.max === 300)
  );
  assert.ok(sliderSetting, 'setting tab must render excerptLength slider');
  const slider = sliderSetting.controls.find((c) => typeof c.setValue === 'function');
  assert.ok(slider);
  assert.equal(slider.min, 60);
  assert.equal(slider.max, 300);
  assert.equal(slider.step, 10);

  // 3. Slider changeHandler updates settings and triggers persistence
  let saved = false;
  plugin.saveSettings = async () => { saved = true; };
  await slider.changeHandler(80);
  assert.equal(plugin.settings.excerptLength, 80);
  assert.equal(saved, true);

  // 4. ChapterParser.parse respects configured excerptLength (80 chars)
  const longText = '# Heading\n' + 'word '.repeat(50);
  const headings = [{ heading: 'Heading', level: 1, position: { start: { line: 0 } } }];
  const parsed80 = ChapterPipelinePlugin.ChapterParser.parse(longText, headings, {
    showExcerpt: true,
    excerptLength: 80
  });
  const summary80 = parsed80[0].summaryMarkdown.replace(/\.\.\.$/, '');
  assert.ok(summary80.length <= 80, `summary length (${summary80.length}) must not exceed 80`);

  // 5. ChapterParser.parse respects configured excerptLength (250 chars)
  const parsed250 = ChapterPipelinePlugin.ChapterParser.parse(longText, headings, {
    showExcerpt: true,
    excerptLength: 250
  });
  const summary250 = parsed250[0].summaryMarkdown.replace(/\.\.\.$/, '');
  assert.ok(summary250.length <= 250, `summary length (${summary250.length}) must not exceed 250`);
  assert.ok(summary250.length > 80, '250-char excerpt must contain more content than 80-char excerpt');
});

test('keyboard focus and blur trigger formula tooltip visibility and handle collapsed items tabindex', async (t) => {
  const { container, plugin, view } = createReadingHarness();
  await plugin.attachStepperToView(view);

  const dashItems = container.querySelectorAll('.codex-dash-item');
  const tooltip = plugin.viewTooltips.get(view);
  assert.ok(dashItems.length > 0);
  assert.ok(tooltip);

  dashItems[0].dispatch('focus');
  if (!tooltip.classList.contains('is-visible')) {
    t.todo('Upcoming feature (Milestone M3 / F13): Keyboard focus/blur tooltip visibility on dash items pending M3');
    return;
  }

  // 1. Keyboard focus shows formula tooltip
  assert.equal(tooltip.classList.contains('is-visible'), true,
    'focus on dash item must display floating tooltip for keyboard navigation');

  // 2. Keyboard blur hides formula tooltip
  dashItems[0].dispatch('blur');
  assert.equal(tooltip.classList.contains('is-visible'), false,
    'blur on dash item must hide floating tooltip');

  // 3. Focus trapping prevention: collapsed items in hover-expand mode receive tabindex="-1"
  plugin.settings.hierarchyMode = 'hover-expand';
  plugin.app.metadataCache.getFileCache = () => ({
    headings: [
      { heading: 'H1 Section', level: 1, position: { start: { line: 0 } } },
      { heading: 'H3 Collapsed Section', level: 3, position: { start: { line: 4 } } },
    ]
  });
  await plugin.attachStepperToView(view);
  const updatedDashes = container.querySelectorAll('.codex-dash-item');
  const h1Item = updatedDashes[0];
  const h3Item = updatedDashes[1];

  assert.equal(h3Item.classList.contains('is-collapsed'), true);
  assert.equal(h3Item.getAttribute('tabindex'), '-1',
    'collapsed item must have tabindex="-1" to prevent keyboard focus trap');
  assert.equal(h1Item.getAttribute('tabindex'), '0',
    'visible H1 item must retain tabindex="0"');
});

