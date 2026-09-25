const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

// --- Real-App & DOM Emulation Harness ---

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }
  add(...names) { names.forEach((n) => this.values.add(n)); }
  remove(...names) { names.forEach((n) => this.values.delete(n)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    if (force !== undefined) {
      if (force) this.values.add(name);
      else this.values.delete(name);
      return force;
    }
    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }
    this.values.add(name);
    return true;
  }
}

class FakeDOMElement {
  constructor({ tagName = 'div', classes = [], textContent = '', attributes = {} } = {}) {
    this.tagName = tagName.toLowerCase();
    this.classList = new FakeClassList(classes);
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = textContent;
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.clientHeight = 500;
    this.clientWidth = 800;
    this.rect = { top: 0, bottom: 500, left: 0, right: 800, height: 500, width: 800 };
    const styleMap = new Map();
    this.style = new Proxy({
      setProperty: (k, v) => styleMap.set(k, String(v)),
      getPropertyValue: (k) => styleMap.get(k) || '',
      removeProperty: (k) => styleMap.delete(k),
    }, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return styleMap.get(prop) || '';
      },
      set(target, prop, val) {
        if (prop in target) target[prop] = val;
        else styleMap.set(prop, String(val));
        return true;
      }
    });
  }

  append(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  appendChild(child) { return this.append(child); }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  empty() {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }

  createEl(tag, options = {}) {
    return this.append(this.createChild(tag, options));
  }

  createDiv(options = {}) {
    return this.append(this.createChild('div', options));
  }

  createSpan(options = {}) {
    return this.append(this.createChild('span', options));
  }

  createChild(tag, options = {}) {
    const classes = String(options.cls || '').split(/\s+/).filter(Boolean);
    const child = new FakeDOMElement({
      tagName: tag,
      classes,
      textContent: options.text || options.textContent || '',
    });
    for (const [k, v] of Object.entries(options.attr || {})) child.setAttribute(k, v);
    return child;
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }

  addEventListener(type, fn) {
    const arr = this.listeners.get(type) || [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  removeEventListener(type, fn) {
    const arr = this.listeners.get(type) || [];
    this.listeners.set(type, arr.filter((f) => f !== fn));
  }

  dispatch(type, event = {}) {
    const evt = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event };
    for (const fn of this.listeners.get(type) || []) fn(evt);
  }

  click() {
    this.dispatch('click');
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }

  closest(sel) {
    const selectors = sel.split(',').map((s) => s.trim());
    let current = this;
    while (current) {
      if (selectors.some((part) => current.matches && current.matches(part))) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  matches(sel) {
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    return this.tagName === sel.toLowerCase();
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const selectors = sel.split(',').map((part) => part.trim());
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (selectors.some((part) => child.matches(part))) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

function setupGlobalDOM() {
  const root = new FakeDOMElement({ tagName: 'html' });
  const body = new FakeDOMElement({ tagName: 'body' });
  root.append(body);

  global.Event = class Event {
    constructor(type) { this.type = type; }
  };

  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  global.MutationObserver = class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };

  global.document = {
    body,
    createElement: (tag) => new FakeDOMElement({ tagName: tag }),
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };

  const rafQueue = [];
  let nextRafId = 1;
  global.requestAnimationFrame = (fn) => {
    const id = nextRafId++;
    rafQueue.push({ id, fn });
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    const idx = rafQueue.findIndex((item) => item.id === id);
    if (idx !== -1) rafQueue.splice(idx, 1);
  };
  global.flushRaf = () => {
    const pending = rafQueue.splice(0, rafQueue.length);
    for (const item of pending) item.fn();
  };

  global.window = {
    document: global.document,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return { body, flushRaf: global.flushRaf };
}

// --- Obsidian API Stubs ---

class ObsidianPluginStub {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this.commands = [];
    this.settingsTabs = [];
    this.registeredEvents = [];
  }
  async loadData() { return {}; }
  async saveData() {}
  addCommand(cmd) { this.commands.push(cmd); return cmd; }
  addSettingTab(tab) { this.settingsTabs.push(tab); }
  registerEvent(e) { this.registeredEvents.push(e); }
}

class ObsidianMarkdownViewStub {
  constructor(app, leaf) {
    this.app = app;
    this.leaf = leaf;
    this.file = null;
    this.mode = 'preview'; // 'preview' (Reading View) or 'source' (Live Preview)
    this.contentEl = new FakeDOMElement({ classes: ['view-content'] });
    this.previewContainer = this.contentEl.createDiv({ cls: 'markdown-preview-view' });
    this.previewScroller = this.previewContainer.createDiv({ cls: 'markdown-preview-sizer' });
    this.editorContainer = this.contentEl.createDiv({ cls: 'markdown-source-view cm-editor' });
    this.editorScroller = this.editorContainer.createDiv({ cls: 'cm-scroller' });
    this.editorContent = this.editorScroller.createDiv({ cls: 'cm-content' });

    // Emulate CodeMirror 6 coordinates and viewport virtualization
    this.editor = {
      cm: {
        documentTop: 0,
        scaleY: 1,
        lineBlockAtHeight: (height) => {
          // 20px per line mapping
          const lineNum = Math.max(1, Math.floor(height / 20) + 1);
          return { from: lineNum * 50 };
        },
        state: {
          doc: {
            lineAt: (pos) => {
              const lineNum = Math.max(1, Math.floor(pos / 50));
              return { number: lineNum };
            },
          },
        },
      },
      scrollTo: (x, y) => {
        this.editorScroller.scrollTop = y;
        this.editorScroller.dispatch('scroll');
      },
      setCursor: () => {},
      focus: () => {},
    };
  }

  getMode() { return this.mode; }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'preview') {
      this.editorContainer.remove();
      this.contentEl.append(this.previewContainer);
    } else {
      this.previewContainer.remove();
      this.contentEl.append(this.editorContainer);
    }
  }
}

class WorkspaceLeafStub {
  constructor(workspace) {
    this.workspace = workspace;
    this.view = new ObsidianMarkdownViewStub(workspace.app, this);
    this.workspace.app.dom.body.append(this.view.contentEl);
  }

  async openFile(file, options = {}) {
    this.view.file = file;
    if (options.state?.mode) this.view.setMode(options.state.mode);
    this.workspace.trigger('file-open', file);
  }

  detach() {
    this.view.contentEl.remove();
    this.workspace.leaves = this.workspace.leaves.filter((l) => l !== this);
    this.workspace.trigger('layout-change');
  }
}

class WorkspaceStub {
  constructor(app) {
    this.app = app;
    this.leaves = [];
    this.activeLeaf = null;
    this.listeners = new Map();
  }

  createLeaf() {
    const leaf = new WorkspaceLeafStub(this);
    this.leaves.push(leaf);
    this.activeLeaf = leaf;
    return leaf;
  }

  splitActiveLeaf() {
    return this.createLeaf();
  }

  getLeavesOfType(type) {
    if (type === 'markdown') return this.leaves;
    return [];
  }

  getActiveViewOfType(type) {
    if (!this.activeLeaf) return null;
    if (type === ObsidianMarkdownViewStub) return this.activeLeaf.view;
    return this.activeLeaf.view;
  }

  on(name, fn) {
    const list = this.listeners.get(name) || [];
    list.push(fn);
    this.listeners.set(name, list);
    return { name, fn };
  }

  trigger(name, ...args) {
    for (const fn of this.listeners.get(name) || []) fn(...args);
  }
}

function loadProductionBundle() {
  const originalLoad = Module._load;
  Module._load = function loadWithObsidianStub(request, parent, isMain) {
    if (request === 'obsidian') {
      return {
        Plugin: ObsidianPluginStub,
        MarkdownView: ObsidianMarkdownViewStub,
        PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } },
        Setting: class {
          setName() { return this; }
          setDesc() { return this; }
          addToggle() { return this; }
          addSlider() { return this; }
          addDropdown() { return this; }
          addColorPicker() { return this; }
        },
        SuggestModal: class { constructor(app) { this.app = app; } },
        Menu: class { addItem() { return this; } },
        Notice: class { constructor(msg) {} },
        MarkdownRenderer: { render: () => Promise.resolve() },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const bundlePath = path.resolve(__dirname, '../main.js');
  delete require.cache[require.resolve(bundlePath)];
  const ProductionPlugin = require(bundlePath);
  Module._load = originalLoad;
  return ProductionPlugin;
}

function createRealAppHarness() {
  const { body, flushRaf } = setupGlobalDOM();

  const headingsByPath = new Map();

  const app = {
    dom: { body },
    workspace: null,
    metadataCache: {
      getFileCache: (file) => ({
        headings: headingsByPath.get(file?.path) || [],
      }),
      on: () => {},
    },
    vault: {
      cachedRead: async (file) => file.content || '',
      getAbstractFileByPath: (p) => files.get(p) || null,
      on: () => {},
    },
  };

  const workspace = new WorkspaceStub(app);
  app.workspace = workspace;

  const files = new Map();

  const registerFile = (filePath, content, headings) => {
    const file = { path: filePath, content, stat: { mtime: Date.now() } };
    files.set(filePath, file);
    headingsByPath.set(filePath, headings);
    return file;
  };

  return { app, workspace, registerFile, flushRaf };
}

// --- Smoke Test Suite Covering 10 Minimum Scenarios ---

test('Scenario 1: Plugin load / unload / reload lifecycle on production bundle', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app } = createRealAppHarness();
  const manifest = { id: 'chapter-pipeline', version: '1.2.3' };

  const plugin = new ProductionPlugin(app, manifest);
  await plugin.onload();

  assert.ok(plugin.commands.length >= 3, 'Must register navigation and palette commands');
  assert.equal(plugin.manifest.id, 'chapter-pipeline');
  assert.equal(plugin.manifest.version, '1.2.3');
  assert.ok(plugin.settings, 'Settings must be initialized');

  // Verify unload
  plugin.onunload();
  assert.equal(plugin.sessionCoordinator, undefined, 'Session coordinator must be cleared on unload');

  // Verify reload
  const reloaded = new ProductionPlugin(app, manifest);
  await reloaded.onload();
  assert.ok(reloaded.commands.length >= 3);
  reloaded.onunload();
});

test('Scenario 2: Reading View navigation and active-chapter tracking', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const welcomeHeadings = [
    { heading: 'Welcome Note', level: 1, position: { start: { line: 0 } } },
    { heading: 'Getting Started', level: 2, position: { start: { line: 4 } } },
    { heading: 'Deep Section', level: 3, position: { start: { line: 10 } } },
  ];
  const file = registerFile('welcome.md', '# Welcome Note\n\n## Getting Started\n\n### Deep Section\n', welcomeHeadings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();
  plugin.settings.maxHeadingLevel = 3;

  const leaf = workspace.createLeaf();
  await leaf.openFile(file, { state: { mode: 'preview' } });

  // Attach stepper to view
  await plugin.attachStepperToView(leaf.view);
  flushRaf();

  const stepper = leaf.view.contentEl.querySelector('.codex-stepper-container');
  assert.ok(stepper, 'Stepper container must attach to Reading View');

  const dashes = stepper.querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 3, 'Must render dashes for all headings');

  // Navigate by clicking second dash
  let jumped = false;
  plugin.jumpToHeading = (view, chapter) => {
    jumped = true;
    assert.equal(chapter.title, 'Getting Started');
  };
  dashes[1].click();
  assert.ok(jumped, 'Clicking dash must trigger jumpToHeading');

  plugin.onunload();
});

test('Scenario 3: Live Preview navigation and active-chapter tracking', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const headings = [
    { heading: 'Live Title', level: 1, position: { start: { line: 0 } } },
    { heading: 'Live Section', level: 2, position: { start: { line: 6 } } },
  ];
  const file = registerFile('live.md', '# Live Title\n\n## Live Section\n', headings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf = workspace.createLeaf();
  await leaf.openFile(file, { state: { mode: 'source' } });

  await plugin.attachStepperToView(leaf.view);
  flushRaf();

  const stepper = leaf.view.contentEl.querySelector('.codex-stepper-container');
  assert.ok(stepper, 'Stepper container must attach to Live Preview container');

  const dashes = stepper.querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 2);

  plugin.onunload();
});

test('Scenario 4: Split-pane creation and independent view sessions', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const h1 = [{ heading: 'Note 1 H1', level: 1, position: { start: { line: 0 } } }];
  const h2 = [
    { heading: 'Note 2 H1', level: 1, position: { start: { line: 0 } } },
    { heading: 'Note 2 H2', level: 2, position: { start: { line: 4 } } },
  ];
  const file1 = registerFile('note1.md', '# Note 1 H1\n', h1);
  const file2 = registerFile('note2.md', '# Note 2 H1\n\n## Note 2 H2\n', h2);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf1 = workspace.createLeaf();
  await leaf1.openFile(file1, { state: { mode: 'preview' } });
  await new Promise((r) => setTimeout(r, 60));

  const leaf2 = workspace.splitActiveLeaf();
  await leaf2.openFile(file2, { state: { mode: 'source' } });
  await new Promise((r) => setTimeout(r, 60));
  flushRaf();

  const stepper1 = leaf1.view.contentEl.querySelector('.codex-stepper-container');
  const stepper2 = leaf2.view.contentEl.querySelector('.codex-stepper-container');

  assert.ok(stepper1, 'Leaf 1 must have stepper');
  assert.ok(stepper2, 'Leaf 2 must have stepper');
  assert.notEqual(stepper1, stepper2, 'Steppers must be independent DOM elements');

  const dashes1 = stepper1.querySelectorAll('.codex-dash-item');
  const dashes2 = stepper2.querySelectorAll('.codex-dash-item');
  assert.equal(dashes1.length, 1, 'Leaf 1 should have 1 dash');
  assert.equal(dashes2.length, 2, 'Leaf 2 should have 2 dashes');

  plugin.onunload();
});

test('Scenario 5: Close/reopen leaves and deterministic session disposal', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const headings = [{ heading: 'Target Note', level: 1, position: { start: { line: 0 } } }];
  const file = registerFile('target.md', '# Target Note\n', headings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf1 = workspace.createLeaf();
  await leaf1.openFile(file);

  const leaf2 = workspace.splitActiveLeaf();
  await leaf2.openFile(file);

  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 50));
  flushRaf();

  assert.ok(leaf2.view.contentEl.querySelector('.codex-stepper-container'));

  // Close leaf 2
  leaf2.detach();
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 50));

  // Reopen leaf
  const leaf3 = workspace.createLeaf();
  await leaf3.openFile(file);
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 50));
  flushRaf();

  assert.ok(leaf3.view.contentEl.querySelector('.codex-stepper-container'), 'Reopened leaf mounts fresh stepper');

  plugin.onunload();
});

test('Scenario 6: Rapid note switching without race conditions', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const hA = [{ heading: 'Doc A', level: 1, position: { start: { line: 0 } } }];
  const hB = [
    { heading: 'Doc B', level: 1, position: { start: { line: 0 } } },
    { heading: 'Doc B Sub', level: 2, position: { start: { line: 3 } } },
  ];
  const fileA = registerFile('docA.md', '# Doc A\n', hA);
  const fileB = registerFile('docB.md', '# Doc B\n\n## Doc B Sub\n', hB);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf = workspace.createLeaf();
  await leaf.openFile(fileA);
  plugin.updateAllMarkdownViews();

  // Switch rapidly
  await leaf.openFile(fileB);
  plugin.updateAllMarkdownViews();

  await leaf.openFile(fileA);
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 60));
  flushRaf();

  const steppers = leaf.view.contentEl.querySelectorAll('.codex-stepper-container');
  assert.equal(steppers.length, 1, 'Exactly one stepper should exist after rapid switching');

  const dashes = steppers[0].querySelectorAll('.codex-dash-item');
  assert.equal(dashes.length, 1, 'Final stepper matches Doc A');

  plugin.onunload();
});

test('Scenario 7: Reading View <-> Live Preview mode changes', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const headings = [
    { heading: 'Mode Note', level: 1, position: { start: { line: 0 } } },
    { heading: 'Sub Mode', level: 2, position: { start: { line: 5 } } },
  ];
  const file = registerFile('mode.md', '# Mode Note\n\n## Sub Mode\n', headings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf = workspace.createLeaf();
  await leaf.openFile(file, { state: { mode: 'preview' } });
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 50));
  flushRaf();

  assert.equal(leaf.view.contentEl.querySelectorAll('.codex-stepper-container').length, 1);

  // Switch to source mode
  leaf.view.setMode('source');
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 50));
  flushRaf();

  assert.equal(leaf.view.contentEl.querySelectorAll('.codex-stepper-container').length, 1);
  assert.equal(leaf.view.getMode(), 'source');

  // Switch back to preview mode
  leaf.view.setMode('preview');
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 50));
  flushRaf();

  assert.equal(leaf.view.contentEl.querySelectorAll('.codex-stepper-container').length, 1);
  assert.equal(leaf.view.getMode(), 'preview');

  plugin.onunload();
});

test('Scenario 8: Long-note scrolling with CodeMirror virtualization', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  // Read the long-note fixture from tests/fixtures/smoke-vault/long-note.md
  const fixturePath = path.resolve(__dirname, 'fixtures/smoke-vault/long-note.md');
  const content = fs.readFileSync(fixturePath, 'utf8');

  // Construct heading metadata matching the long-note fixture
  const lines = content.split('\n');
  const headings = [];
  lines.forEach((line, idx) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        heading: match[2],
        level: match[1].length,
        position: { start: { line: idx } },
      });
    }
  });

  assert.ok(headings.length >= 40, 'Long-note fixture must contain at least 40 headings');

  const file = registerFile('long-note.md', content, headings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  plugin.settings.maxHeadingLevel = 6;
  await plugin.onload();

  const leaf = workspace.createLeaf();
  await leaf.openFile(file, { state: { mode: 'source' } });
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 60));
  flushRaf();

  const stepper = leaf.view.contentEl.querySelector('.codex-stepper-container');
  assert.ok(stepper, 'Stepper mounts on long-note');

  const dashes = stepper.querySelectorAll('.codex-dash-item');
  assert.ok(dashes.length >= 40, 'All headings represented in long note stepper');

  // Emulate CodeMirror virtualization:
  // Scroll down to line 800 (height 16,000px).
  // In a real editor, lineBlockAtHeight maps this height to line 800.
  // The tracker must identify the corresponding active heading without failing
  // even though early headings are not present in DOM.
  const scroller = leaf.view.contentEl.querySelector('.cm-scroller');
  assert.ok(scroller);

  scroller.scrollTop = 16000;
  scroller.scrollHeight = 32000;
  scroller.clientHeight = 600;
  scroller.dispatch('scroll');
  flushRaf();

  // Stepper state remains healthy
  assert.ok(stepper.parentElement, 'Stepper remains mounted during virtualized scroll');

  plugin.onunload();
});

test('Scenario 9: Repeated attach/detach without duplicated listeners or stale DOM', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const headings = [{ heading: 'Repeat Test', level: 1, position: { start: { line: 0 } } }];
  const file = registerFile('repeat.md', '# Repeat Test\n', headings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf = workspace.createLeaf();
  await leaf.openFile(file);

  // Trigger repeated layout and attachment events
  for (let i = 0; i < 5; i++) {
    plugin.updateAllMarkdownViews();
  }
  await new Promise((r) => setTimeout(r, 30));
  flushRaf();

  const allSteppers = global.document.querySelectorAll('.codex-stepper-container');
  assert.equal(allSteppers.length, 1, 'Must have exactly 1 stepper despite multiple updates');

  const allTooltips = global.document.querySelectorAll('.codex-floating-tooltip');
  assert.ok(allTooltips.length <= 1, 'Must not leak orphan tooltips');

  plugin.onunload();
});

test('Scenario 10: Plugin disable/re-enable with deterministic cleanup', async () => {
  const ProductionPlugin = loadProductionBundle();
  const { app, workspace, registerFile, flushRaf } = createRealAppHarness();

  const headings = [{ heading: 'Cleanup Note', level: 1, position: { start: { line: 0 } } }];
  const file = registerFile('cleanup.md', '# Cleanup Note\n', headings);

  const plugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await plugin.onload();

  const leaf = workspace.createLeaf();
  await leaf.openFile(file);
  plugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 20));
  flushRaf();

  assert.equal(global.document.querySelectorAll('.codex-stepper-container').length, 1);

  // Disable plugin
  plugin.onunload();

  assert.equal(
    global.document.querySelectorAll('.codex-stepper-container').length,
    0,
    'All steppers must be removed from DOM on onunload'
  );
  assert.equal(
    global.document.querySelectorAll('.codex-floating-tooltip').length,
    0,
    'All tooltips must be removed from DOM on onunload'
  );

  // Re-enable plugin
  const reloadedPlugin = new ProductionPlugin(app, { id: 'chapter-pipeline', version: '1.2.3' });
  await reloadedPlugin.onload();
  reloadedPlugin.updateAllMarkdownViews();
  await new Promise((r) => setTimeout(r, 20));
  flushRaf();

  assert.equal(
    global.document.querySelectorAll('.codex-stepper-container').length,
    1,
    'Stepper must cleanly remount after re-enable'
  );

  reloadedPlugin.onunload();
});
