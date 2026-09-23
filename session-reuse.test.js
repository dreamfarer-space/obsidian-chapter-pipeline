const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadRenderSignatureModule() {
  const filename = path.join(__dirname, 'src/views/render-signature.ts');
  const result = buildSync({
    entryPoints: [filename],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

function createSignatureHarness() {
  const headings = [
    { heading: 'First', level: 1, position: { start: { line: 0 } } },
    { heading: 'Second', level: 2, position: { start: { line: 4 } } },
  ];
  const file = { path: 'note.md', stat: { mtime: 100 } };
  const container = {};
  const view = { file, contentEl: container };
  const plugin = {
    documentRevisions: new Map([['note.md', 3]]),
    settings: {
      minHeadingLevel: 1,
      maxHeadingLevel: 2,
      ignoreFirstH1: false,
      showExcerpt: true,
      excerptLength: 140,
      activeColor: '#3b82f6',
      customActiveColor: '#3b82f6',
      narrowThreshold: 600,
      dockPosition: 'left',
      hierarchyMode: 'hover-expand',
      showProgressRail: false,
      tooltipGlassmorphism: true,
      showChapterOrder: false,
      readingBookmarksEnabled: false,
      readingState: { files: {} },
      enableSound: false,
      soundVolume: 50,
    },
    app: { metadataCache: { getFileCache: () => ({ headings }) } },
    isReadingMode: () => true,
  };
  return { headings, plugin, view };
}

function loadProductionPlugin() {
  class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
    }
    async loadData() { return {}; }
    async saveData() {}
    addSettingTab() {}
    addCommand() {}
    registerEvent() {}
  }
  class MarkdownView {}
  class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
  class SuggestModal { constructor(app) { this.app = app; } }
  class Setting { constructor() {} }
  class Menu { addItem() { return this; } }
  class Notice {}

  const originalLoad = Module._load;
  Module._load = function loadWithObsidianStub(request, parent, isMain) {
    if (request === 'obsidian') {
      return {
        Plugin,
        MarkdownView,
        PluginSettingTab,
        SuggestModal,
        Setting,
        Menu,
        Notice,
        MarkdownRenderer: { render() {} },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('./main.js')];
  const ProductionPlugin = require('./main.js');
  Module._load = originalLoad;
  return { MarkdownView, ProductionPlugin };
}

test('layout/active-leaf refreshes keep the same render signature when inputs are unchanged', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const { plugin, view } = createSignatureHarness();
  assert.equal(buildViewRenderSignature(plugin, view), buildViewRenderSignature(plugin, view));
});

test('heading, revision, and structural setting changes invalidate the render signature', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();

  const headingHarness = createSignatureHarness();
  const headingBefore = buildViewRenderSignature(headingHarness.plugin, headingHarness.view);
  headingHarness.headings.push({ heading: 'Third', level: 2, position: { start: { line: 8 } } });
  assert.notEqual(buildViewRenderSignature(headingHarness.plugin, headingHarness.view), headingBefore);

  const revisionHarness = createSignatureHarness();
  const revisionBefore = buildViewRenderSignature(revisionHarness.plugin, revisionHarness.view);
  revisionHarness.plugin.documentRevisions.set('note.md', 4);
  assert.notEqual(buildViewRenderSignature(revisionHarness.plugin, revisionHarness.view), revisionBefore);

  const settingHarness = createSignatureHarness();
  const settingBefore = buildViewRenderSignature(settingHarness.plugin, settingHarness.view);
  settingHarness.plugin.settings.showProgressRail = true;
  assert.notEqual(buildViewRenderSignature(settingHarness.plugin, settingHarness.view), settingBefore);
});

test('non-render sound changes do not invalidate the mounted rail signature', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const { plugin, view } = createSignatureHarness();
  const before = buildViewRenderSignature(plugin, view);
  plugin.settings.enableSound = true;
  plugin.settings.soundVolume = 10;
  assert.equal(buildViewRenderSignature(plugin, view), before);
});

test('session reuse requires identical signature and mounted stepper identity', () => {
  const { canReuseRenderedSession } = loadRenderSignatureModule();
  const stepper = {};
  const session = { renderSignature: 'same', stepper: { element: stepper } };
  assert.equal(canReuseRenderedSession(session, 'same', stepper), true);
  assert.equal(canReuseRenderedSession(session, 'changed', stepper), false);
  assert.equal(canReuseRenderedSession(session, 'same', {}), false);
  assert.equal(canReuseRenderedSession(undefined, 'same', stepper), false);
});

test('production updateAllMarkdownViews preserves an unchanged mounted session and skips cachedRead', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const { MarkdownView, ProductionPlugin } = loadProductionPlugin();
  const headings = [
    { heading: 'First', level: 1, position: { start: { line: 0 } } },
    { heading: 'Second', level: 2, position: { start: { line: 4 } } },
  ];
  const stepper = { remove() {} };
  const container = {
    querySelector(selector) {
      return selector === '.codex-stepper-container' ? stepper : null;
    },
  };
  const view = new MarkdownView();
  view.file = { path: 'note.md', stat: { mtime: 100 } };
  view.contentEl = container;
  view.getMode = () => 'preview';

  let cachedReads = 0;
  const app = {
    workspace: {
      getLeavesOfType: () => [{ view }],
      getActiveViewOfType: () => view,
    },
    metadataCache: { getFileCache: () => ({ headings }) },
    vault: { cachedRead: () => { cachedReads += 1; return new Promise(() => {}); } },
  };
  const plugin = new ProductionPlugin(app, {});
  plugin.settings.maxHeadingLevel = 2;
  plugin.settings.hierarchyMode = 'hover-expand';
  plugin.documentRevisions.set('note.md', 3);

  let disposed = 0;
  const session = {
    renderSignature: buildViewRenderSignature(plugin, view),
    stepper: { element: stepper },
    dispose() { disposed += 1; },
  };
  plugin.viewSessions = new Map([[view, session]]);
  plugin.viewSessionVersions = new Map([[view, 1]]);

  plugin.updateAllMarkdownViews();
  plugin.updateAllMarkdownViews();

  assert.equal(plugin.viewSessions.get(view), session);
  assert.equal(disposed, 0);
  assert.equal(cachedReads, 0, 'unchanged workspace refreshes must not re-read and rebuild the note');
});

test('production updateAllMarkdownViews invalidates a session after a structural setting change', async () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const { MarkdownView, ProductionPlugin } = loadProductionPlugin();
  global.MutationObserver = class MutationObserver { observe() {} disconnect() {} };

  const headings = [{ heading: 'First', level: 1, position: { start: { line: 0 } } }];
  const stepper = { remove() {} };
  const container = {
    querySelector(selector) {
      return selector === '.codex-stepper-container' ? stepper : null;
    },
  };
  const view = new MarkdownView();
  view.file = { path: 'note.md', stat: { mtime: 100 } };
  view.contentEl = container;
  view.getMode = () => 'preview';

  let cachedReads = 0;
  const app = {
    workspace: {
      getLeavesOfType: () => [{ view }],
      getActiveViewOfType: () => view,
    },
    metadataCache: { getFileCache: () => ({ headings }) },
    vault: { cachedRead: () => { cachedReads += 1; return new Promise(() => {}); } },
  };
  const plugin = new ProductionPlugin(app, {});
  plugin.settings.maxHeadingLevel = 2;
  plugin.documentRevisions.set('note.md', 3);

  let disposed = 0;
  const session = {
    renderSignature: buildViewRenderSignature(plugin, view),
    stepper: { element: stepper },
    dispose() { disposed += 1; },
  };
  plugin.viewSessions = new Map([[view, session]]);
  plugin.viewSessionVersions = new Map([[view, 1]]);

  plugin.settings.showProgressRail = true;
  plugin.updateAllMarkdownViews();
  await Promise.resolve();

  assert.equal(disposed, 1);
  assert.equal(cachedReads, 1, 'structural changes must route through the rebuild path');
});
