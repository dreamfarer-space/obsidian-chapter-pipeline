const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

class Plugin {}
class MarkdownView {}
class PluginSettingTab {}
class Setting {}
class SuggestModal {}
class Menu {}
class Notice {}

const originalLoad = Module._load;
Module._load = function loadWithObsidianStub(request, parent, isMain) {
  if (request === 'obsidian') {
    return {
      Plugin,
      MarkdownView,
      MarkdownRenderer: { render() {} },
      PluginSettingTab,
      Setting,
      SuggestModal,
      Menu,
      Notice,
      getLanguage: () => 'en',
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ChapterPipelinePlugin = require('../main.js');
Module._load = originalLoad;

function installRafHarness() {
  let nextId = 1;
  let queue = [];
  const raf = (callback) => {
    const id = nextId++;
    queue.push({ id, callback });
    return id;
  };
  const caf = (id) => {
    queue = queue.filter((entry) => entry.id !== id);
  };
  global.requestAnimationFrame = raf;
  global.cancelAnimationFrame = caf;
  global.window = global.window || {};
  global.window.requestAnimationFrame = raf;
  global.window.cancelAnimationFrame = caf;
  return () => {
    const pending = queue;
    queue = [];
    for (const entry of pending) entry.callback();
  };
}

class FakeContainer {
  constructor() {
    this.scrollTop = 0;
    this.listeners = new Map();
    this.rendered = [];
    this.queryCount = 0;
    this.rectReads = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ target: this });
  }

  getBoundingClientRect() {
    this.rectReads += 1;
    return { top: 0 };
  }

  querySelectorAll() {
    this.queryCount += 1;
    return this.rendered;
  }
}

function makeChapters(count, lineStep = 1) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Chapter ${index}`,
    rawHeading: `Chapter ${index}`,
    level: 2,
    line: index * lineStep,
    headingIndex: index,
    id: `chapter-${index}`,
    summaryMarkdown: '',
  }));
}

test('ReadingViewTracker keeps 1000-heading incremental scroll work near O(delta)', () => {
  const flushRaf = installRafHarness();
  const container = new FakeContainer();
  const chapters = makeChapters(1000);
  let headingLookups = 0;
  let geometryReads = 0;
  const active = [];

  const headings = chapters.map((_, index) => ({
    isConnected: true,
    getBoundingClientRect() {
      geometryReads += 1;
      return { top: index * 100 - container.scrollTop };
    },
  }));

  const tracker = new ChapterPipelinePlugin.ReadingViewTracker({
    container,
    findHeadings(chapter) {
      headingLookups += 1;
      return headings[chapter.headingIndex];
    },
    onActiveChapter(index) {
      active.push(index);
    },
  });

  tracker.setChapters(chapters);
  flushRaf();

  for (let tick = 1; tick <= 200; tick += 1) {
    container.scrollTop = tick * 50;
    container.dispatch('scroll');
    flushRaf();
  }

  assert.equal(active.at(-1), 100);
  assert.ok(headingLookups < 150, `expected cached heading lookup count < 150, got ${headingLookups}`);
  assert.ok(geometryReads < 700, `expected incremental geometry reads < 700, got ${geometryReads}`);
  tracker.dispose();
});

class FakeMutationObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe() {}
  disconnect() {}
  trigger(records) { this.callback(records); }
}

function makeRenderedCandidate(chapter, index, container, onGeometryRead) {
  const element = {
    getAttribute(name) {
      return name === 'data-line' ? String(chapter.line) : null;
    },
    getBoundingClientRect() {
      onGeometryRead();
      return { top: index * 40 - container.scrollTop };
    },
    matches(selector) {
      return selector === '.cm-line, .cm-heading';
    },
    closest(selector) {
      return selector === '.cm-line, .cm-heading' ? element : null;
    },
    querySelector() {
      return null;
    },
  };
  return element;
}

test('LivePreviewTracker reuses rendered candidates and binary-searches 1000 headings', () => {
  const flushRaf = installRafHarness();
  global.MutationObserver = FakeMutationObserver;
  FakeMutationObserver.instances = [];

  const container = new FakeContainer();
  const chapters = makeChapters(1000, 3);
  let geometryReads = 0;
  const active = [];

  container.rendered = chapters.map((chapter, index) => makeRenderedCandidate(
    chapter,
    index,
    container,
    () => { geometryReads += 1; },
  ));

  const tracker = new ChapterPipelinePlugin.LivePreviewTracker({
    container,
    onActiveChapter(index) {
      active.push(index);
    },
  });

  tracker.setChapters(chapters);
  flushRaf();
  assert.equal(container.queryCount, 1);

  for (let tick = 1; tick <= 200; tick += 1) {
    container.scrollTop = tick * 20;
    container.dispatch('scroll');
    flushRaf();
  }

  assert.equal(container.queryCount, 1, 'unchanged CodeMirror DOM should not be queried on every scroll frame');
  assert.equal(active.at(-1), 101);
  assert.ok(geometryReads < 2500, `expected logarithmic geometry reads < 2500, got ${geometryReads}`);

  const observer = FakeMutationObserver.instances[0];
  const unrelatedTarget = {
    matches() { return false; },
    closest() { return null; },
    querySelector() { return null; },
  };

  observer.trigger([{
    type: 'childList',
    target: unrelatedTarget,
    addedNodes: [],
    removedNodes: [],
  }]);
  flushRaf();
  assert.equal(container.queryCount, 1, 'unrelated subtree mutations should not invalidate candidates');

  const candidate = container.rendered[100];
  observer.trigger([{
    type: 'childList',
    target: candidate,
    addedNodes: [{}],
    removedNodes: [],
  }]);
  flushRaf();
  assert.equal(container.queryCount, 1, 'content changes inside a candidate should only refresh geometry');

  const addedCandidate = {
    matches(selector) { return selector === '.cm-line, .cm-heading'; },
    closest() { return null; },
    querySelector() { return null; },
  };
  observer.trigger([{
    type: 'childList',
    target: unrelatedTarget,
    addedNodes: [addedCandidate],
    removedNodes: [],
  }]);
  flushRaf();
  assert.equal(container.queryCount, 2, 'candidate additions should invalidate the rendered candidate cache once');

  tracker.dispose();
});

test('ReadingViewTracker performs no geometry or chapter lookup work while its pane is inactive', () => {
  const flushRaf = installRafHarness();
  const container = new FakeContainer();
  let activePane = false;
  let headingLookups = 0;
  let geometryReads = 0;
  let activeChanges = 0;

  const tracker = new ChapterPipelinePlugin.ReadingViewTracker({
    container,
    shouldTrack: () => activePane,
    findHeadings() {
      headingLookups += 1;
      return {
        isConnected: true,
        getBoundingClientRect() {
          geometryReads += 1;
          return { top: 0 };
        },
      };
    },
    onActiveChapter() {
      activeChanges += 1;
    },
  });

  tracker.setChapters(makeChapters(10));
  flushRaf();
  container.scrollTop = 100;
  container.dispatch('scroll');
  flushRaf();

  assert.equal(container.rectReads, 0);
  assert.equal(headingLookups, 0);
  assert.equal(geometryReads, 0);
  assert.equal(activeChanges, 0);

  activePane = true;
  container.scrollTop = 200;
  container.dispatch('scroll');
  flushRaf();
  assert.ok(container.rectReads > 0);
  assert.ok(headingLookups > 0);
  assert.ok(activeChanges > 0);
  tracker.dispose();
});

test('LivePreviewTracker performs no viewport or DOM work while its pane is inactive', () => {
  const flushRaf = installRafHarness();
  global.MutationObserver = FakeMutationObserver;
  FakeMutationObserver.instances = [];

  const container = new FakeContainer();
  let activePane = false;
  let viewportReads = 0;
  let activeChanges = 0;
  container.rendered = makeChapters(10).map((chapter, index) => makeRenderedCandidate(
    chapter,
    index,
    container,
    () => {},
  ));

  const tracker = new ChapterPipelinePlugin.LivePreviewTracker({
    container,
    shouldTrack: () => activePane,
    getViewportLine() {
      viewportReads += 1;
      return 3;
    },
    onActiveChapter() {
      activeChanges += 1;
    },
  });

  tracker.setChapters(makeChapters(10));
  flushRaf();
  container.scrollTop = 100;
  container.dispatch('scroll');
  flushRaf();

  assert.equal(container.rectReads, 0);
  assert.equal(container.queryCount, 0);
  assert.equal(viewportReads, 0);
  assert.equal(activeChanges, 0);

  activePane = true;
  container.scrollTop = 200;
  container.dispatch('scroll');
  flushRaf();
  assert.ok(container.rectReads > 0);
  assert.equal(viewportReads, 1);
  assert.equal(activeChanges, 1);
  tracker.dispose();
});
