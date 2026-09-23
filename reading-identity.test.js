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

const {
  ChapterParser,
  ReadingStorage,
  createChapterIdentity,
  resolveChapterIdentity,
} = ChapterPipelinePlugin;

function parse(headings) {
  const content = headings
    .map((heading) => `${'#'.repeat(heading.level)} ${heading.heading}`)
    .join('\n');
  return ChapterParser.parse(content, headings, {
    minHeadingLevel: 1,
    maxHeadingLevel: 6,
    ignoreFirstH1: false,
    showExcerpt: false,
  });
}

test('v2 identity recovers renames and line shifts using structural context', () => {
  const original = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  const saved = createChapterIdentity(original[2], original);

  const renamed = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details Renamed', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, renamed)?.title, 'Details Renamed');

  const shifted = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 9 } } },
    { heading: 'Details', level: 3, position: { start: { line: 14 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 20 } } },
    { heading: 'Details', level: 3, position: { start: { line: 24 } } },
    { heading: 'End', level: 2, position: { start: { line: 28 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, shifted)?.line, 14);
});

test('v2 identity disambiguates reordered duplicate titles and fails closed after deletion', () => {
  const original = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  const saved = createChapterIdentity(original[2], original);

  const reordered = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 2 } } },
    { heading: 'Details', level: 3, position: { start: { line: 4 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 6 } } },
    { heading: 'Details', level: 3, position: { start: { line: 8 } } },
    { heading: 'End', level: 2, position: { start: { line: 10 } } },
  ]);
  const resolved = resolveChapterIdentity(saved, reordered);
  assert.equal(resolved?.line, 8);
  assert.equal(resolved?.id, reordered[4].id);

  const deleted = parse([
    { heading: 'Root', level: 1, position: { start: { line: 0 } } },
    { heading: 'Group A', level: 2, position: { start: { line: 2 } } },
    { heading: 'Group B', level: 2, position: { start: { line: 4 } } },
    { heading: 'Details', level: 3, position: { start: { line: 6 } } },
    { heading: 'End', level: 2, position: { start: { line: 8 } } },
  ]);
  assert.equal(resolveChapterIdentity(saved, deleted), null);
});

test('ReadingStorage upgrades version-1 records without deleting legacy data', async () => {
  const host = {
    settings: { readingState: null },
    loadData: async () => ({
      readingState: {
        version: 1,
        files: {
          'note.md': {
            resume: { chapterId: 'h2:details:0', title: 'Details', updatedAt: 42 },
            markers: {
              'h2:details:0': { revisit: true, important: false },
            },
          },
        },
      },
    }),
    saveData: async () => {},
  };

  const storage = new ReadingStorage(host);
  const state = await storage.load();
  assert.equal(state.version, 2);
  assert.equal(state.files['note.md'].resume.chapterId, 'h2:details:0');
  assert.equal(state.files['note.md'].resume.identity, undefined);
  assert.equal(state.files['note.md'].markers['h2:details:0'].revisit, true);
});
