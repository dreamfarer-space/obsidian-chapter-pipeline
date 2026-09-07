<div align="center">

# 🪐 Charter Pipeline

**Minimalist Linear-Style Floating Dash Stepper & Outline Navigation for Obsidian**  
*极简内嵌式 Linear 风格散落横线步进流 · KaTeX 公式预览 · 双模精准置顶*

<br/>

[![GitHub Release](https://img.shields.io/github/v/release/LeaningLearner/obsidian-charter-pipeline?style=flat-square&color=3b82f6&label=Release&sort=semver)](https://github.com/LeaningLearner/obsidian-charter-pipeline/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/LeaningLearner/obsidian-charter-pipeline/total?style=flat-square&color=f59e0b&label=Downloads&logo=github)](https://github.com/LeaningLearner/obsidian-charter-pipeline/releases)
[![Obsidian MinApp](https://img.shields.io/badge/Obsidian-%E2%89%A5%200.15.0-7c3aed?style=flat-square&logo=obsidian)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=flat-square)](LICENSE)
[![Author](https://img.shields.io/badge/Author-%E6%8B%A9%E6%A2%A6%E8%88%9F-blue?style=flat-square)](https://github.com/LeaningLearner)

<br/>

[English](#-english) • [简体中文](#-简体中文)

<br/>

<img src="assets/banner-en.png" alt="Charter Pipeline Banner" width="100%" />

</div>

---

<a name="english"></a>
## 📖 English

### 🌟 Overview

> **💡 Core Concept**: Replaces bulky outline sidebars and noisy progress bars with a few elegant, floating minimalist dash lines — hover to preview KaTeX formula excerpts, click to smooth scroll & pin to the top.

**Charter Pipeline** brings the sleek, ultra-minimalist timeline navigation of **Linear** directly into Obsidian. 

Unlike traditional bulky sidebar trees or noisy full-text minimaps, Charter Pipeline renders a clean vertical series of **floating horizontal dash bars** on the left margin of your note. With proportional heading lengths, instant hover popovers with **KaTeX math previews**, **tactile micro-switch feedback**, and **rock-solid pinned-top navigation** across both Editing and Reading views, navigating long technical notes, research, documentation, and study material becomes effortless.

### 🆕 v1.2.0 Highlights

- **Typed modular architecture**: Moves parser, storage, trackers, UI, sound, and shared types into `src/` modules while keeping a generated CommonJS entry point for Obsidian.
- **Large-note performance and lifecycle safety**: Adds bounded parse caching, revision-aware invalidation, passive rAF-coalesced scrolling, and deterministic cleanup on unload.
- **Accessible, resilient interface**: Adds keyboard and screen-reader semantics, contrast-aware active colors, reduced-motion and forced-colors support, touch-friendly tooltip triggers, and tuned tactile audio.

### v1.1.3 Highlights

- **Highlight & LaTeX Formula Protection**: Preserves user's `==highlight==` styling across all views while strictly scoping jump-flash suppression; preserves LaTeX `\\` row breaks in multiline environments (`aligned`, `cases`, `matrix`); balances math delimiters upon excerpt truncation.
- **High-Performance O(1) Excerpt Extraction**: Large chapters use early-exit scanning (< 15ms on 50,000-line notes); isolates document capture scroll listener to the active container.
- **Storage Auto-Pruning & Audio Cleanup**: Automatically prunes deleted notes from local reading bookmarks upon `vault.on('delete')`; properly releases Web Audio resources on plugin unload.
- **UX & Accessibility Enhancements**: Active chapter order indicator maintains a fixed vertical baseline without horizontal jitter; quick switcher palette supports filtering by heading level (`h1..h6`, `#`) and bookmarks (`revisit`, `important`); configurable `excerptLength` (60-300 chars); full keyboard focus/blur formula tooltip support.

### 🛠️ Development build

The plugin now uses a typed `src/` module layout and esbuild while keeping the generated CommonJS entry point that Obsidian loads:

```bash
npm install
npm run build       # production bundle -> main.js
npm run dev         # development watch build
npx tsc --noEmit    # strict TypeScript check
npm test            # 48 compatibility tests
```

See [`docs/PHASE1_MIGRATION.md`](docs/PHASE1_MIGRATION.md) for the module dependency diagram and migration boundary.
The Phase 2 performance notes and Phase 3 compliance audit are in [`docs/PHASE2_PERFORMANCE.md`](docs/PHASE2_PERFORMANCE.md) and [`docs/PHASE3_COMPLIANCE_AUDIT.md`](docs/PHASE3_COMPLIANCE_AUDIT.md).
UI/UX motion, contrast, touch and keyboard details are tracked in [`docs/PHASE4_UI_UX.md`](docs/PHASE4_UI_UX.md).

### 🆕 v1.1.2 Highlights

- **Reading Progress & Bookmarks** is now available as an optional, local-only feature: save a chapter resume point and mark any chapter as **Revisit** or **Important** without changing your Markdown.
- The UI now follows Obsidian automatically: `zh*` uses Simplified Chinese, while all other languages use English. Settings, commands, search, bookmark menus, and notices are included.
- Active chapter highlighting now follows the actual Reading View or Live Preview scroll container, preventing the highlight from remaining on the opening chapter after you scroll.

---

### ✨ Key Features

- 🪐 **Minimalist Linear-Style Floating Dashes**:
  - Pure floating horizontal lines on your note margin with zero container envelope background.
  - Distinct hierarchical dash lengths and tactile thickness: `H1` (20px / 3.5px), `H2` (12px / 2.8px), `H3` (7px / 2.2px), `H4~H6` (4px / 1.8px).
  - 100% strict vertical left-alignment with dynamic gutter anti-collision scaling.
  - Magnetic jelly spring physics animations on hover and click.
- 📐 **Left / Right Margin Docking**:
  - Choose to dock the pipeline stepper on either the **Left** or **Right** margin of the note pane.
  - Automatic right gutter distance calculation and inverted popover card positioning when right-docked.
- 🌲 **Smart Hierarchy Folding & Focus Modes**:
  - **All Headings Expanded (`all`)**: Standard flat display of all headings up to the configured max level.
  - **Focus Mode (`hover-expand`)**: Keeps view clean by collapsing `H3+` subheadings until you hover over the pipeline rail to gracefully expand them with spring physics.
  - **Active Branch Only (`active-branch`)**: Intelligently expands only the subheadings of the section you are currently reading while folding others.
- 📏 **Vertical Progress Rail & Active Indicator**:
  - Optional subtle magnetic vertical guide line indicating your exact reading progress through the document's structure.
  - Smoothly tracking indicator reflecting the currently active section.
- 🔖 **Reading Progress & Bookmarks (Optional)**:
  - Save a chapter-level reading resume point for any long note; reopening the note shows a quiet, non-blocking reminder and never scrolls automatically.
  - Right-click a dash to mark a section for **Revisit** or as **Important**. The circle and diamond markers can be combined and are also described in the hover card.
  - All resume points and bookmarks stay in local plugin data, never in your Markdown or Frontmatter. The feature is disabled by default.
- 💬 **KaTeX Hover Tooltip & 3-Line Excerpt**:
  - Instant floating card centered pixel-perfect on the hovered dash line.
  - Bold wrapped chapter title + unbolded 3-line excerpt from section content.
  - Full native **LaTeX / KaTeX formula rendering** (`$f(x)$`, `$(uv)^{(n)}$`, etc.).
  - Automatic `...` ellipsis truncation for long text.
  - Saturated glassmorphism backdrop blur and spring overshoot entrance animations (toggleable).
- 🔍 **Chapter Palette Quick Switcher & Keyboard Jump**:
  - Open a dedicated fuzzy search modal (`Charter Pipeline: Search & switch chapter`) to search and jump to any chapter with instant formula previews and hierarchy badges.
  - Bindable hotkeys for **Jump to Previous Chapter** and **Jump to Next Chapter**.
- 📌 **Pinned-Top Navigation (Editing & Reading Views)**:
  - Supports both **Live Preview / Source Editing View** and **Reading View**.
  - Intelligent multi-frame calibration and Obsidian native lazy-load virtualization fallback guarantee that clicking any heading lands it **consistently and stably at the very top of the viewport** (with 20px comfortable breathing space).
- 🔊 **Tactile Micro-Switch Sound Effects**:
  - Built-in lightweight Web Audio synthesizer generates crisp mechanical mouse micro-switch click and tick sounds without external audio files.
- 🚀 **120 FPS Hardware-Accelerated Scroll Tracking**:
  - Uses `requestAnimationFrame` with CodeMirror 6 active line detection and Reading View visible scroll tracking.
  - Zero frame drops and zero CPU overhead even on 10,000-line math notes.
- 📱 **Split-Screen & Narrow View Auto-Hide**:
  - Automatically fades out when pane width is narrow (e.g. split-screen with PDF notes) so it never clashes with your text.
- ⚙️ **Automatic English / Chinese Interface**:
  - Settings, search, commands, bookmark menus, and notices automatically follow Obsidian's language: Chinese for `zh*`, English otherwise.
  - Fine-grained controls for excerpt preview, heading levels, dock position, hierarchy mode, progress rail, reading bookmarks, glassmorphism, active colors, and sound effects.

---

### ⌨️ Commands & Shortcuts

Charter Pipeline provides commands that you can bind to custom hotkeys in **Settings -> Hotkeys**:

| Command ID | Command Name | Description |
| :--- | :--- | :--- |
| `charter-pipeline-jump-prev` | **Charter Pipeline: Jump to previous chapter** | Navigate directly to the previous heading with pinned-top landing. |
| `charter-pipeline-jump-next` | **Charter Pipeline: Jump to next chapter** | Navigate directly to the next heading with pinned-top landing. |
| `charter-pipeline-open-palette` | **Charter Pipeline: Search & switch chapter (Palette)** | Open a fuzzy search modal with chapter titles, badges, and formula excerpts. |
| `charter-pipeline-resume-last-chapter` | **Charter Pipeline: Resume last chapter** | Return to this note's saved chapter-level reading position. |
| `charter-pipeline-toggle-revisit-current` | **Charter Pipeline: Toggle revisit bookmark for current chapter** | Add or remove the current chapter's Revisit bookmark. |
| `charter-pipeline-toggle-important-current` | **Charter Pipeline: Toggle important bookmark for current chapter** | Add or remove the current chapter's Important bookmark. |
| `charter-pipeline-clear-reading-bookmarks-current` | **Charter Pipeline: Clear reading progress & bookmarks for current note** | Remove this note's saved resume point and all chapter bookmarks. |
| `charter-pipeline-cleanup-reading-bookmarks` | **Charter Pipeline: Clean up invalid reading progress & bookmarks** | Remove saved reading points and bookmarks for deleted or moved files. |

---

### 🛠️ Installation

#### 1. Via Obsidian Community Plugins (Recommended)
1. Open **Settings** -> **Community Plugins**.
2. Search for **`Charter Pipeline`**.
3. Click **Install**, then **Enable**.

#### 2. Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/LeaningLearner/obsidian-charter-pipeline/releases).
2. Extract or copy the files into `<YourVault>/.obsidian/plugins/chapter-pipeline/`.
3. Reload Obsidian (`Ctrl + R`) and enable **Charter Pipeline** in **Settings -> Community Plugins**.

---

### ⚙️ Settings Reference

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Show 3-Line Excerpt Preview** (`showExcerpt`) | Display a 3-line excerpt with KaTeX formula rendering below the title in the hover popover card. When disabled, only the clean title is shown. | `Enabled (true)` |
| **Ignore First H1 (# Note Title)** (`ignoreFirstH1`) | When enabled, the first H1 heading at the top of the note will not generate a dash bar, showing only sub-sections. | `Disabled (false)` |
| **Dock Position** (`dockPosition`) | Choose whether to display the outline pipeline on the left or right margin of the note (`Left Margin`, `Right Margin`). | `Left Margin (left)` |
| **Heading Hierarchy Mode** (`hierarchyMode`) | Control the display mode of subheadings: `Focus Mode (Hover Expand)` (hover-expand), `All Headings Expanded` (all), or `Active Branch Only` (active-branch). | `Focus Mode (hover-expand)` |
| **Show Vertical Progress Rail** (`showProgressRail`) | Display a smooth magnetic vertical progress guide line indicating reading position. | `Disabled (false)` |
| **Enable Reading Progress & Bookmarks** (`readingBookmarksEnabled`) | Save a reading resume point and optional Revisit / Important chapter bookmarks in local plugin data. Markdown and Frontmatter are never modified. Includes a button to clean up invalid note records. | `Disabled (false)` |
| **Tooltip Glassmorphism & Spring Physics** (`tooltipGlassmorphism`) | Enable backdrop blur glassmorphism and spring overshoot animations for hover popovers. | `Enabled (true)` |
| **Max Heading Level** (`maxHeadingLevel`) | Filter deeper subheadings (`H1 ~ H2`, `H1 ~ H3`, `H1 ~ H4`, `All H1 ~ H6`). | `H1 ~ H2 (Default)` |
| **Active Indicator Color** (`activeColor`) | Customize the highlight color for the currently active reading section (`Azure Blue`, `Violet`, `Sunset Amber`, `Sakura Pink`, `Theme Accent`, `Custom Color Picker`). | `Azure Blue (#3b82f6)` |
| **Narrow View Auto-Hide Threshold (px)** (`narrowThreshold`) | Automatically hide the stepper when note pane width is below this threshold (px) to prevent overlapping text. | `600px` |
| **Enable Tactile Micro-Switch Sound** (`enableSound`) | Play subtle mechanical micro-switch sounds on clicking chapters and scrolling across headings. | `Enabled (true)` |
| **Sound Volume (%)** (`soundVolume`) | Adjust the volume of interactive tactile sound effects (0% - 100%). | `50%` |

---

<br/>

<a name="简体中文"></a>
## 🇨🇳 简体中文

<div align="center">
  <img src="assets/banner-zh.png" alt="Charter Pipeline 中文横幅" width="100%" />
</div>

<br/>

### 🌟 插件简介

> **💡 一句话总结**：**把沉重的目录和复杂的进度条，精简成了几根散落悬浮的高级极简线条，悬浮能看公式摘要，点击能精准置顶跳转。**

**Charter Pipeline** 为 Obsidian 长文档与考研/学术笔记带来了 **Linear 的极简散落横线步进流** 美学。

区别于传统占用大量屏幕空间的臃肿侧边栏目录或信息杂乱的代码小地图，Charter Pipeline 在笔记左侧边缘渲染一列**纯净散落的悬浮横线条**。通过精巧的长短区分（H1~H6）、**支持 KaTeX 数学公式渲染的 3 行气泡卡片**、**清脆微动开关物理音效**、以及**编辑/阅读双模式像素级绝对置顶平滑跳转**，让长文浏览与章节检索变得优雅而极速。

### 🆕 v1.2.0 更新

- **TypeScript 模块化架构**：将解析器、存储、滚动追踪、界面、音效和共享类型拆分到 `src/`，同时保留 Obsidian 可直接加载的 CommonJS 入口。
- **超长笔记性能与生命周期安全**：加入有界解析缓存、修订版本失效机制、被动事件与 rAF 合帧滚动更新，并在卸载时统一清理资源。
- **无障碍与跨主题适配**：补充键盘和屏幕阅读器语义、对比度感知高亮色、减弱动效与强制配色支持、触控友好气泡触发和更柔和的机械音效。

### v1.1.3 更新

- **正文高亮与 LaTeX 公式保护**：彻底避免污染用户笔记原生 `==高亮==` 样式；保留 `aligned`、`cases`、`matrix` 等多行数学环境中的关键换行符 `\\`；公式摘要截断自动平衡 `$` 定界符并规范显示省略号。
- **O(1) 超长笔记极速摘要解析**：章节摘要采用正向早停扫描机制，50,000 行超长文档解析耗时降至 15ms 以内；精确过滤全局滚动事件，消除无谓重算。
- **存储自动清理与音频资源释放**：自动联动 `vault.on('delete')` 清理已删除笔记的本地断点与书签；插件卸载时显式释放底层 Web Audio 资源。
- **体验与无障碍增强**：活动章节序号对齐统一垂直基准线，消除水平晃动；搜索面板支持按层级（`h1`~`h6`、`#`）与书签状态（`待复习`、`重点`）检索；正式提供 60~300 字符的摘要长度配置项；支持 Tab 键焦点（focus/blur）唤出公式气泡。

### 🆕 v1.1.2 更新

- 新增可选的**阅读断点与章节书签**：本地保存章节断点，并为任意章节叠加“**稍后回看**”与“**重点**”书签；全程不修改 Markdown。
- 设置页、命令、搜索框、书签菜单和提示现可自动跟随 Obsidian 语言：`zh*` 使用简体中文，其他语言使用英文。
- 修复阅读视图与实时预览中，滚动后激活高亮仍停留在首章的问题；现在会跟随实际滚动容器与当前可见章节更新。

---

### ✨ 核心特性

- 🪐 **Linear 级极简散落横线流**：
  - 纯粹自由散落悬浮在正文边距，无厚重的外壳背景，还原纯粹原生质感；
  - 严格按标题层级长短与粗细区分：`H1`（20px / 3.5px）、`H2`（12px / 2.8px）、`H3`（7px / 2.2px）、`H4~H6`（4px / 1.8px）；
  - 严格 100% 垂直左对齐基线，内置动态边距防遮挡缩放；
  - 带有弹性果冻磁吸过渡动效，极具交互质感。
- 📐 **左右边距自由停靠（Dock Position）**：
  - 支持将章节步进流停靠在笔记**左侧边栏**或**右侧边栏**；
  - 停靠在右侧时自动计算右侧边距并镜像气泡对齐方向。
- 🌲 **智能多级标题折叠与聚焦模式（Hierarchy Modes）**：
  - **全部平铺展开（all）**：传统平铺展示所有层级标题；
  - **主干聚焦模式（hover-expand）**：默认收起 H3~H6 深层子小节，仅保留 H1/H2 主干；鼠标悬停导轨区域时平滑展开全部子节；
  - **当前分支聚焦（active-branch）**：智能跟随阅读进度，仅动态展开当前正在阅读的章节分支，自动折叠其余分支。
- 📏 **垂直微光进度导轨（Progress Rail）**：
  - 可选极简微光垂直导轨线，配合磁吸小圆点/光标实时指示整篇笔记的阅读进度。
- 🔖 **通用阅读断点与章节书签（可选）**：
  - 为任意长笔记保存章节级阅读断点；再次打开时只显示安静、非阻塞的提示，绝不会自动滚动打断阅读。
  - 右键点击横线即可添加“**稍后回看**”或“**重点**”书签。圆点与菱形可叠加显示，并会在悬浮卡中以文字说明。
  - 断点与书签只保存在本地插件数据中，不会写入 Markdown 或 Frontmatter；该功能默认关闭。
- 💬 **3 行 KaTeX 公式气泡与几何中心对齐**：
  - 悬浮横线即刻浮现独立气泡，**垂直正中心 100% 精准对齐短横线**；
  - 顶部为加粗且自动换行的章节名，下方为**浅色未加粗的 3 行正文摘要**；
  - 完整支持 **LaTeX / KaTeX 数学公式**（如 `$(uv)^{(n)}$`、$\lim$ 等）精美渲染，超长自动以 `...` 截断；
  - 支持高级高饱和毛玻璃模糊背景（Backdrop Blur）与拟物弹簧微动进场动效（可开关）。
- 🔍 **章节搜索指令面板（Palette）与快捷键快速跳转**：
  - 提供专属模糊搜索指令面板（`Charter Pipeline: 搜索并快速跳转章节 (Palette)`），支持快捷输入搜索章节名并预览公式与层级标签；
  - 提供**跳转到上一章节**与**跳转到下一章节**命令，可自由绑定自定义快捷键。
- 📌 **双模式像素级绝对置顶跳转（编辑模式 + 阅读模式）**：
  - 全面支持**实时预览/源码编辑模式**与**阅读视图（Reading View）**；
  - 结合 Obsidian 原生懒加载虚拟分段内核与 16 帧几何对齐，无论点击第 1 章还是远端第 30 章，**目标章节永远绝对稳定停靠在编辑器顶部（留出 20px 舒适间距）**。
- 🔊 **机械微动开关清脆交互音效**：
  - 内置基于 Web Audio API 的微型物理合成器，点击横线与跨章节滚动时伴随清脆微动开关触感声，无需加载外置音频文件。
- 🚀 **120 FPS 硬件加速滚动节流 (`requestAnimationFrame`)**：
  - 基于 CodeMirror 6 底层视口行号与阅读模式精准检测当前阅读位置；
  - 翻阅上万字、上百公式的长篇数学笔记时，依然保持 **0 掉帧、0 CPU 负担**。
- 📱 **分屏与窄屏自适应隐藏**：
  - 左边写笔记、右边开 PDF 双拼时，自动感应宽度并智能隐去，绝不遮挡正文内容。
- ⚙️ **中英文界面自动切换**：
  - 设置页、搜索框、命令、书签菜单与提示会自动跟随 Obsidian 语言；`zh*` 显示中文，其余语言显示英文。
  - 支持摘要预览、展示层级、左右停靠、折叠模式、进度导轨、阅读书签、毛玻璃动效、高亮色系与音效微调。

---

### ⌨️ 命令与快捷键导航

您可以在 Obsidian **设置 -> 快捷键** 中为以下命令绑定专属快捷键：

| 命令 ID | 命令名称 | 功能说明 |
| :--- | :--- | :--- |
| `charter-pipeline-jump-prev` | **Charter Pipeline: Jump to previous chapter** (跳转至上一章节) | 平滑滚动并绝对置顶跳转至上一个标题。 |
| `charter-pipeline-jump-next` | **Charter Pipeline: Jump to next chapter** (跳转至下一章节) | 平滑滚动并绝对置顶跳转至下一个标题。 |
| `charter-pipeline-open-palette` | **Charter Pipeline: Search & switch chapter (Palette)** (搜索并快速跳转章节) | 弹出快速搜索面板，支持模糊检索章节、展示公式摘要并直达目标。 |
| `charter-pipeline-resume-last-chapter` | **Charter Pipeline: Resume last chapter** (恢复上次阅读章节) | 跳转回本笔记保存的章节级阅读位置。 |
| `charter-pipeline-toggle-revisit-current` | **Charter Pipeline: Toggle revisit bookmark for current chapter** (切换当前章节的稍后回看书签) | 添加或移除当前章节的“稍后回看”书签。 |
| `charter-pipeline-toggle-important-current` | **Charter Pipeline: Toggle important bookmark for current chapter** (切换当前章节的重点书签) | 添加或移除当前章节的“重点”书签。 |
| `charter-pipeline-clear-reading-bookmarks-current` | **Charter Pipeline: Clear reading progress & bookmarks for current note** (清除当前笔记的阅读断点与书签) | 删除本笔记的断点及所有章节书签。 |
| `charter-pipeline-cleanup-reading-bookmarks` | **Charter Pipeline: Clean up invalid reading progress & bookmarks** (清理已失效的阅读断点与书签) | 扫描并移除已删除或移出库的笔记所遗留的书签与断点数据。 |

---

### 🛠️ 安装方法

#### 1. 从 Obsidian 社区市场安装（推荐）
1. 打开 Obsidian **设置** -> **第三方插件** -> **社区插件市场**；
2. 搜索 **`Charter Pipeline`**；
3. 点击 **安装**，随后点击 **启用** 即可。

#### 2. 手动安装
1. 前往本仓库 [Releases 页面](https://github.com/LeaningLearner/obsidian-charter-pipeline/releases) 下载 `main.js`、`manifest.json` 与 `styles.css`；
2. 将这三个文件放置于笔记库的 `.obsidian/plugins/chapter-pipeline/` 目录下；
3. 在 Obsidian 中按 `Ctrl + R` 刷新，并在 **设置 -> 第三方插件** 中启用。

---

### ⚙️ 设置面板参数说明

| 配置项 | 功能说明 | 默认值 |
| :--- | :--- | :--- |
| **开启正文 3 行摘要预览** (`showExcerpt`) | 在悬浮气泡中换行展示正文开头的 3 行摘要（支持 LaTeX / KaTeX 公式渲染，超出 3 行自动显示 ... 省略号）。关闭后仅展示纯净标题。 | `开启 (true)` |
| **忽略文档首个一级大标题** (`ignoreFirstH1`) | 开启后，文章最开头的 `# 篇名` 不会生成横线，仅展示正文小节。 | `关闭 (false)` |
| **靠栏停靠位置** (`dockPosition`) | 选择大纲横线流停靠在笔记编辑区的左侧或右侧边栏（`左侧边栏`、`右侧边栏`）。 | `左侧边栏 (left)` |
| **多级标题展示模式** (`hierarchyMode`) | 控制 H3~H6 深层子小节的展示策略：`主干聚焦模式 (hover-expand)`、`全部平铺展开 (all)`、`当前分支聚焦 (active-branch)`。 | `主干聚焦模式 (hover-expand)` |
| **开启垂直进度导轨** (`showProgressRail`) | 在横线左侧显示一条极简平滑的垂直微光导轨，实时指示当前章节阅读进度。 | `关闭 (false)` |
| **开启阅读断点与章节书签** (`readingBookmarksEnabled`) | 将章节断点及“稍后回看 / 重点”书签保存在本地插件数据中；不会修改 Markdown 或 Frontmatter。提供一键清理失效记录按钮。 | `关闭 (false)` |
| **毛玻璃质感与弹簧动效** (`tooltipGlassmorphism`) | 开启悬浮气泡毛玻璃模糊背景 (Backdrop Blur) 与拟物弹簧微动进场动效。 | `开启 (true)` |
| **最大展示标题层级** (`maxHeadingLevel`) | 过滤更深层级的子小节（如选择 `H1 ~ H2` 则仅展示大纲，过滤 `H3 ~ H6`）。 | `仅 H1 ~ H2 (默认)` |
| **激活高亮横线颜色** (`activeColor`) | 自定义当前阅读章节的横线加亮颜色（天青蓝、紫罗兰、琥珀、樱花粉、主题色、自定义颜色拾取器）。 | `天青蓝 (#3b82f6)` |
| **分屏/窄屏自动隐藏宽度阈值** (`narrowThreshold`) | 笔记窗口宽度小于该像素时自动隐藏横线流以防止遮挡。 | `600px` |
| **开启微动开关机械音效** (`enableSound`) | 在点击章节与滚动经过标题时，播放精致的机械微动开关清脆音效。 | `开启 (true)` |
| **交互音量大小 (%)** (`soundVolume`) | 自定义交互音效的播放音量（0% - 100%）。 | `50%` |

---

## 📄 License / 开源协议

本项目基于 [MIT License](LICENSE) 开源。  
Copyright (c) 2026 [择梦舟 (LeaningLearner)](https://github.com/LeaningLearner)
