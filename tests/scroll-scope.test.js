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

function makeScroller() {
  return {
    addEventListener() {},
    removeEventListener() {},
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 500,
  };
}

test('getViewScrollers scopes tracking to the active Markdown view scroller', () => {
  const preview = makeScroller();
  const editor = makeScroller();
  const container = {
    querySelector(selector) {
      if (selector === '.markdown-preview-view') return preview;
      if (selector === '.cm-scroller') return editor;
      return null;
    },
  };
  const readingView = { contentEl: container, getMode: () => 'preview' };
  const liveView = { contentEl: container, getMode: () => 'source' };
  const plugin = new ChapterPipelinePlugin();
  let activeView = readingView;
  plugin.app = {
    workspace: {
      getActiveViewOfType() {
        return activeView;
      },
    },
  };

  assert.deepEqual(plugin.getViewScrollers(container, readingView), [preview]);

  activeView = liveView;
  assert.deepEqual(plugin.getViewScrollers(container, liveView), [editor]);

  activeView = readingView;
  assert.deepEqual(
    plugin.getViewScrollers(container, liveView),
    [],
    'inactive Markdown panes must not own a tracking scroller',
  );
});

test('getReadingHeading caches the broad heading query for large Reading View notes', () => {
  let broadQueries = 0;
  const headings = Array.from({ length: 1000 }, (_, index) => ({
    tagName: 'H2',
    textContent: `Chapter ${index}`,
    isConnected: true,
    classList: { contains() { return false; } },
    getAttribute(name) {
      if (name === 'data-line') return String(index * 3);
      if (name === 'data-heading') return `Chapter ${index}`;
      return null;
    },
    closest() {
      return null;
    },
  }));

  const scroller = {
    querySelectorAll(selector) {
      if (selector === 'h1, h2, h3, h4, h5, h6') {
        broadQueries += 1;
        return headings;
      }
      return [];
    },
    querySelector() {
      return null;
    },
  };
  const container = {
    querySelector(selector) {
      return selector === '.markdown-preview-view' ? scroller : null;
    },
  };
  const view = { contentEl: container };
  const plugin = new ChapterPipelinePlugin();

  for (let index = 0; index < 250; index += 1) {
    const heading = plugin.getReadingHeading(view, {
      title: `Chapter ${index}`,
      rawHeading: `Chapter ${index}`,
      level: 2,
      line: index * 3,
      headingIndex: index,
    });
    assert.equal(heading, headings[index]);
  }

  for (let missingIndex = 2000; missingIndex < 2050; missingIndex += 1) {
    const missing = plugin.getReadingHeading(view, {
      title: `Unrendered Section ${missingIndex}`,
      rawHeading: `Unrendered Section ${missingIndex}`,
      level: 2,
      line: missingIndex * 3,
      headingIndex: missingIndex,
    });
    assert.equal(missing, null);
  }

  assert.equal(
    broadQueries,
    1,
    'the 1000-heading DOM snapshot should be built once, even when off-DOM chapters return null',
  );
});

test('jumpToHeading stops stale or disconnected calibratePreview loops before mutating scrollTop', () => {
  const frames = [];
  const plugin = new ChapterPipelinePlugin();
  plugin.scheduleFrame = (cb) => {
    frames.push(cb);
    return frames.length;
  };

  let targetTop = 180;
  const heading = {
    isConnected: true,
    getBoundingClientRect() {
      return { top: targetTop };
    },
  };
  const scroller = {
    isConnected: true,
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 500,
    addEventListener() {},
    getBoundingClientRect() {
      return { top: 100 };
    },
    scrollTo({ top }) {
      this.scrollTop = top;
    },
  };
  const container = {
    querySelector(selector) {
      return selector === '.markdown-preview-view' ? scroller : null;
    },
  };
  const view = {
    file: { path: 'note.md' },
    contentEl: container,
    getMode: () => 'preview',
  };
  plugin.getReadingHeading = () => heading;

  plugin.jumpToHeading(view, { line: 10, title: 'First' });
  assert.equal(frames.length, 1);
  const firstLoopFrame = frames.shift();

  // Start a second jump on the same view before the first calibration frame runs.
  plugin.jumpToHeading(view, { line: 20, title: 'Second' });
  assert.equal(frames.length, 1);
  const secondLoopFrame = frames.shift();

  scroller.scrollTop = 300;
  targetTop = 250;
  firstLoopFrame();
  assert.equal(scroller.scrollTop, 300, 'stale calibration generation must not mutate scrollTop');
  assert.equal(frames.length, 0, 'stale calibration generation must not schedule another frame');

  // Disconnect scroller before running the active calibration frame.
  scroller.isConnected = false;
  secondLoopFrame();
  assert.equal(scroller.scrollTop, 300, 'disconnected previewScroller must not mutate scrollTop');
  assert.equal(frames.length, 0, 'disconnected previewScroller must not schedule another frame');
});

test('getReadingHeading skips signature check when MutationObserver exists, disconnects replaced scrollers, and cleans up via ViewSession.dispose()', async () => {
  const previousMutationObserver = global.MutationObserver;
  let disconnectedCount = 0;

  global.MutationObserver = class FakeObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {
      disconnectedCount += 1;
    }
  };

  try {
    const makeHeading = (title) => ({
      tagName: 'H2',
      textContent: title,
      isConnected: true,
      classList: { contains() { return false; } },
      getAttribute(name) {
        if (name === 'data-line') return '0';
        if (name === 'data-heading') return title;
        return null;
      },
      getBoundingClientRect() { return { top: 120, left: 0, right: 500, height: 30 }; },
      closest() { return null; },
    });

    const makeScroller = (heading) => ({
      scrollTop: 0,
      scrollHeight: 1200,
      clientHeight: 600,
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect() { return { top: 100, left: 0, right: 500, height: 600 }; },
      get children() {
        throw new Error('getScrollerChildSignature must be skipped when observerState.observer exists');
      },
      querySelectorAll(selector) {
        return selector === 'h1, h2, h3, h4, h5, h6' ? [heading] : [];
      },
      querySelector() { return null; },
    });

    const firstHeading = makeHeading('First Heading');
    const secondHeading = makeHeading('Second Heading');
    const firstScroller = makeScroller(firstHeading);
    const secondScroller = makeScroller(secondHeading);
    let currentScroller = firstScroller;

    const stepperEl = {
      classList: { add() {}, remove() {}, contains() { return false; } },
      style: { setProperty() {} },
      setAttribute() {},
      removeAttribute() {},
      getAttribute() { return null; },
      addEventListener() {},
      removeEventListener() {},
      remove() {},
    };
    const dashEl = {
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      removeAttribute() {},
      getAttribute() { return null; },
      addEventListener() {},
      removeEventListener() {},
    };
    const container = {
      clientWidth: 900,
      querySelector(selector) {
        if (selector === '.markdown-preview-view') return currentScroller;
        if (selector === '.codex-stepper-container') return stepperEl;
        return null;
      },
      querySelectorAll() { return []; },
    };
    const view = {
      file: { path: 'note.md' },
      contentEl: container,
      getMode: () => 'preview',
    };

    const plugin = new ChapterPipelinePlugin();
    const resolvedFirst = plugin.getReadingHeading(view, {
      title: 'First Heading',
      rawHeading: 'First Heading',
      level: 2,
      line: 0,
      headingIndex: 0,
    });
    assert.equal(resolvedFirst, firstHeading);
    assert.equal(plugin.readingHeadingObservers.has(firstScroller), true);
    assert.equal(plugin.readingHeadingSnapshots.has(firstScroller), true);

    // Replace view's preview scroller and call getReadingHeading BEFORE attachStepperToView runs.
    currentScroller = secondScroller;
    const resolvedSecond = plugin.getReadingHeading(view, {
      title: 'Second Heading',
      rawHeading: 'Second Heading',
      level: 2,
      line: 0,
      headingIndex: 0,
    });
    assert.equal(resolvedSecond, secondHeading);
    assert.equal(disconnectedCount, 1, 'getReadingHeading must disconnect the previously mapped scroller observer');
    assert.equal(plugin.readingHeadingObservers.has(firstScroller), false);
    assert.equal(plugin.readingHeadingSnapshots.has(firstScroller), false);
    assert.equal(plugin.readingHeadingObservers.has(secondScroller), true);
    assert.equal(plugin.readingHeadingSnapshots.has(secondScroller), true);

    // Stub compatibility renderer so attachStepperToView creates and adopts a real production ViewSession.
    const baseProto = Object.getPrototypeOf(ChapterPipelinePlugin.ReadingPersistencePlugin.prototype);
    const originalAttach = baseProto.attachStepperToView;
    baseProto.attachStepperToView = async () => ({
      hostContainer: container,
      chapters: [{ id: 'h2:secondheading:0', title: 'Second Heading', rawHeading: 'Second Heading', level: 2, line: 0, headingIndex: 0, summaryMarkdown: '' }],
      stepperElement: stepperEl,
      dashElements: [dashEl],
      tooltipElement: null,
      railIndicator: null,
      trackingContainer: secondScroller,
      releaseLegacyScrollTracking() {},
      isCurrentMount: () => true,
      mode: 'reading',
    });

    try {
      await plugin.attachStepperToView(view);
      const session = plugin.getSessionCoordinator().get(view);
      assert.ok(session, 'attachStepperToView should adopt a production ViewSession');

      const countBeforeSessionDispose = disconnectedCount;
      session.dispose();

      assert.equal(
        disconnectedCount,
        countBeforeSessionDispose + 1,
        'ViewSession.dispose() must disconnect the scroller MutationObserver'
      );
      assert.equal(plugin.readingHeadingObservers.has(secondScroller), false);
      assert.equal(plugin.readingHeadingSnapshots.has(secondScroller), false);
    } finally {
      baseProto.attachStepperToView = originalAttach;
    }
  } finally {
    global.MutationObserver = previousMutationObserver;
  }
});


