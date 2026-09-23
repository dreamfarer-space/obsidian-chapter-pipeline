import { PluginSettingTab, Setting } from 'obsidian';
import { getLocale, I18N } from '../constants';
import type { PluginSettings } from '../types';

interface SettingsPlugin {
  settings: PluginSettings;
  saveSettings: () => Promise<void>;
  updateAllMarkdownViews?: () => void;
  cleanupOrphanedReadingState?: () => number;
  showNotice?: (message: string) => void;
}

/** Settings UI isolated from the plugin coordinator. */
export class ChapterPipelineSettingTab extends PluginSettingTab {
  declare plugin: SettingsPlugin;

  constructor(app: unknown, plugin: SettingsPlugin) {
    super(app as never, plugin as never);
    this.plugin = plugin;
  }

  display(): void {
    const strings = I18N[getLocale()] || I18N.en;
    this.containerEl.replaceChildren();
    new Setting(this.containerEl)
      .setName(strings.tabTitle)
      .setHeading();
    this.addToggle(strings.showExcerptName || 'Show excerpt', strings.showExcerptDesc || '', 'showExcerpt', true);
    this.addToggle(strings.ignoreH1Name || 'Ignore first H1', strings.ignoreH1Desc || '', 'ignoreFirstH1', false);
    this.addToggle(strings.readingBookmarksEnabledName || 'Reading progress', strings.readingBookmarksEnabledDesc || '', 'readingBookmarksEnabled', false);
    this.addSlider(strings.narrowThresholdName || 'Narrow threshold', strings.narrowThresholdDesc || '', 'narrowThreshold', 350, 700, 10);
  }

  private addToggle(name: string, desc: string, key: keyof PluginSettings, fallback: boolean): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) => toggle
        .setValue((this.plugin.settings[key] as boolean | undefined) ?? fallback)
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettings();
          this.plugin.updateAllMarkdownViews?.();
        }));
  }

  private addSlider(name: string, desc: string, key: keyof PluginSettings, min: number, max: number, step: number): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider((slider) => slider
        .setLimits(min, max, step)
        .setValue(Number(this.plugin.settings[key] ?? min))
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettings();
          this.plugin.updateAllMarkdownViews?.();
        }));
  }
}

export default ChapterPipelineSettingTab;
