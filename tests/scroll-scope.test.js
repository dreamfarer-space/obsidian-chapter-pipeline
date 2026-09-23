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

  assert.equal(
    broadQueries,
    1,
    'the 1000-heading DOM snapshot should be built once, not once per chapter lookup',
  );
});
