const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('esbuild');

function loadLivePreviewTracker() {
  const filename = path.join(__dirname, 'src/views/live-preview-tracker.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2022',
  });

  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(code, filename);
  return compiled.exports.LivePreviewTracker;
}

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

class FakeContainer {
  constructor() {
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

function makeChapters(count, lineStep) {
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

function makeRenderedLine(line, top, onGeometryRead) {
  const element = {
    line,
    top,
    getAttribute(name) {
      return name === 'data-line' ? String(element.line) : null;
    },
    getBoundingClientRect() {
      onGeometryRead();
      return { top: element.top };
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

function recycleViewport(lines, firstLine) {
  lines.forEach((line, index) => {
    line.line = firstLine + index;
    line.top = index * 20;
  });
  return lines;
}

test('LivePreviewTracker resolves 1000+ chapters from viewport document lines when the active heading is off-DOM', () => {
  const LivePreviewTracker = loadLivePreviewTracker();
  const flushRaf = installRafHarness();
  global.MutationObserver = FakeMutationObserver;
  FakeMutationObserver.instances = [];

  const container = new FakeContainer();
  const chapters = makeChapters(1001, 100);
  const active = [];
  let geometryReads = 0;

  const rendered = Array.from({ length: 30 }, (_, index) => makeRenderedLine(
    4900 + index,
    index * 20,
    () => { geometryReads += 1; },
  ));
  container.rendered = rendered;

  const tracker = new LivePreviewTracker({
    container,
    onActiveChapter(index) {
      active.push(index);
    },
  });

  tracker.setChapters(chapters);
  flushRaf();
  assert.equal(active.at(-1), 49);

  // Scroll into chapter 50 after its line-5000 heading has been recycled out of
  // CodeMirror's DOM. Only ordinary viewport rows remain rendered.
  recycleViewport(rendered, 5050);
  FakeMutationObserver.instances[0].trigger([{
    type: 'attributes',
    attributeName: 'data-line',
    oldValue: '4900',
    target: rendered[0],
  }]);
  flushRaf();
  assert.equal(active.at(-1), 50, 'off-DOM chapter heading must still remain the active chapter');

  // Reuse the same DOM nodes during fast forward and reverse scrolling.
  recycleViewport(rendered, 90050);
  FakeMutationObserver.instances[0].trigger([{
    type: 'attributes',
    attributeName: 'data-line',
    oldValue: '5050',
    target: rendered[0],
  }]);
  flushRaf();
  assert.equal(active.at(-1), 900);

  recycleViewport(rendered, 20050);
  FakeMutationObserver.instances[0].trigger([{
    type: 'attributes',
    attributeName: 'data-line',
    oldValue: '90050',
    target: rendered[0],
  }]);
  flushRaf();
  assert.equal(active.at(-1), 200);

  // Simulate CodeMirror replacing the viewport nodes altogether.
  const replacement = Array.from({ length: 30 }, (_, index) => makeRenderedLine(
    70050 + index,
    index * 20,
    () => { geometryReads += 1; },
  ));
  const removed = container.rendered[0];
  container.rendered = replacement;
  FakeMutationObserver.instances[0].trigger([{
    type: 'childList',
    target: container,
    addedNodes: [replacement[0]],
    removedNodes: [removed],
  }]);
  flushRaf();
  assert.equal(active.at(-1), 700);

  assert.ok(container.queryCount <= 5, `expected incremental candidate refreshes, got ${container.queryCount}`);
  assert.ok(geometryReads < 80, `expected bounded binary-search geometry reads, got ${geometryReads}`);

  tracker.dispose();
});
