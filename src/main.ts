import { ChapterParser } from './core/parser';
import { SoundEngine } from './core/sound';
import { ReadingStorage } from './core/storage';
import { LivePreviewTracker } from './views/live-preview-tracker';
import { ReadingViewTracker } from './views/reading-view-tracker';
import { updateHierarchyFolding } from './ui/stepper';
import { StepperView } from './ui/stepper';
import { TooltipManager } from './ui/tooltip';
import { ChapterSuggestModal as TypedChapterSuggestModal } from './ui/modal';
import { ChapterPipelineSettingTab as TypedChapterPipelineSettingTab } from './ui/settings-tab';

// The legacy coordinator is intentionally kept as a compatibility boundary while
// view and UI responsibilities move into the typed modules above. Keeping this
// boundary means existing vaults and the current Obsidian API continue to work
// during the migration and gives us a single, stable CommonJS export.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LegacyPlugin = require('./legacy-main.js') as {
  new (...args: unknown[]): unknown;
  ChapterParser?: typeof ChapterParser;
  SoundEngine?: typeof SoundEngine;
  updateHierarchyFolding?: typeof updateHierarchyFolding;
};

LegacyPlugin.ChapterParser = ChapterParser;
LegacyPlugin.SoundEngine = SoundEngine;
LegacyPlugin.updateHierarchyFolding = updateHierarchyFolding;

// Expose the typed building blocks for incremental adoption by the coordinator
// and by downstream integrations. The legacy static names above remain stable.
const PublicPlugin = LegacyPlugin as typeof LegacyPlugin & Record<string, unknown>;
PublicPlugin.ReadingStorage = ReadingStorage;
PublicPlugin.ReadingViewTracker = ReadingViewTracker;
PublicPlugin.LivePreviewTracker = LivePreviewTracker;
PublicPlugin.StepperView = StepperView;
PublicPlugin.TooltipManager = TooltipManager;
PublicPlugin.TypedChapterSuggestModal = TypedChapterSuggestModal;
PublicPlugin.TypedChapterPipelineSettingTab = TypedChapterPipelineSettingTab;

// Obsidian loads plugins through module.exports. `export =` preserves the same
// shape for Node-based tests and for the production bundle.
export = LegacyPlugin;
