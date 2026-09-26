import { PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
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

  /** Initialize isolated settings tab with plugin reference. */
  constructor(app: unknown, plugin: SettingsPlugin) {
    super(app as never, plugin as never);
    this.plugin = plugin;
  }

  /** Return declarative setting definitions consumed by Obsidian 1.13.0+. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const strings = I18N[getLocale()] || I18N.en;
    return [
      {
        name: strings.showExcerptName || 'Show excerpt',
        desc: strings.showExcerptDesc || '',
        control: {
          type: 'toggle',
          key: 'showExcerpt',
          defaultValue: true
        }
      },
      {
        name: strings.ignoreH1Name || 'Ignore first H1',
        desc: strings.ignoreH1Desc || '',
        control: {
          type: 'toggle',
          key: 'ignoreFirstH1',
          defaultValue: false
        }
      },
      {
        name: strings.readingBookmarksEnabledName || 'Reading progress',
        desc: strings.readingBookmarksEnabledDesc || '',
        control: {
          type: 'toggle',
          key: 'readingBookmarksEnabled',
          defaultValue: false
        }
      },
      {
        name: strings.narrowThresholdName || 'Narrow threshold',
        desc: strings.narrowThresholdDesc || '',
        control: {
          type: 'slider',
          key: 'narrowThreshold',
          defaultValue: 600,
          min: 350,
          max: 700,
          step: 10
        }
      }
    ];
  }

  /** Return the stored value for a declarative setting key. */
  override getControlValue(key: string): unknown {
    return (this.plugin.settings as Record<string, unknown>)[key];
  }

  /** Persist changed value for a declarative setting and refresh all open Markdown views. */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings as Record<string, unknown>;
    if (key === 'narrowThreshold') {
      settings[key] = Number(value);
    } else {
      settings[key] = value;
    }
    await this.plugin.saveSettings();
    this.plugin.updateAllMarkdownViews?.();
    if (typeof (this as { refreshDomState?: () => void }).refreshDomState === 'function') {
      (this as { refreshDomState?: () => void }).refreshDomState!();
    } else if (typeof (this as { update?: () => void }).update === 'function') {
      (this as { update?: () => void }).update!();
    }
  }

  /** Render settings tab imperatively on Obsidian versions prior to 1.13.0. */
  override display(): void {
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

  /** Add a boolean toggle setting control. */
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

  /** Add a numeric slider setting control. */
  private addSlider(name: string, desc: string, key: keyof PluginSettings, min: number, max: number, step: number): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider((slider) => slider
        .setLimits(min, max, step)
        .setValue(Number(this.plugin.settings[key] ?? (key === 'narrowThreshold' ? 600 : min)))
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettings();
          this.plugin.updateAllMarkdownViews?.();
        }));
  }
}

export default ChapterPipelineSettingTab;
