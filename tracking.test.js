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
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ChapterPipelinePlugin = require('./main.js');
Module._load = originalLoad;

function installRafHarness() {
  let nextId = 1;
  let queue = [];
  global.requestAnimationFrame = (callback) => {
    const id = nextId++;
    queue.push({ id, callback });
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    queue = queue.filter((entry) => entry.id !== id);
  };
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
  trigger() { this.callback([]); }
}

test('LivePreviewTracker reuses rendered candidates and binary-searches 1000 headings', () => {
  const flushRaf = installRafHarness();
  global.MutationObserver = FakeMutationObserver;
  FakeMutationObserver.instances = [];

  const container = new FakeContainer();
  const chapters = makeChapters(1000, 3);
  let geometryReads = 0;
  const active = [];

  container.rendered = chapters.map((chapter, index) => ({
    getAttribute(name) {
      return name === 'data-line' ? String(chapter.line) : null;
    },
    getBoundingClientRect() {
      geometryReads += 1;
      return { top: index * 40 - container.scrollTop };
    },
  }));

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

  FakeMutationObserver.instances[0].trigger();
  flushRaf();
  assert.equal(container.queryCount, 2, 'DOM mutation should invalidate the rendered candidate cache once');
  tracker.dispose();
});
