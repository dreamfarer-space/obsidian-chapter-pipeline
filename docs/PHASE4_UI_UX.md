# Phase 4 UI/UX 打磨记录

## 动效与布局

- 横线、Tooltip 和进度指示器统一采用 `cubic-bezier(0.16, 1, 0.3, 1)`，保留短时长以获得 Linear 风格的快速收敛。
- `prefers-reduced-motion: reduce` 会关闭步进器、Tooltip、弹窗和进度轨的过渡与动画。
- 进度轨和章节序号继续使用固定几何基线，横线长度变化不会推动序号或正文方向移动。

## 色彩与主题

- 根据可解析的自定义十六进制颜色计算相对亮度，并为激活徽章选择深色或浅色前景，降低极亮/极暗强调色下的对比度问题。
- 增加 `forced-colors: active` 规则，使用系统 `Canvas` / `Highlight` 颜色并保留键盘焦点轮廓。
- 窄屏 Tooltip 使用视口宽度约束，步进器边距和最大高度同步收紧。

## 触控与键盘

- 步进器增加 `pointerdown` / `touchstart` Tooltip 激活路径，不依赖 hover。
- 横线元素保留 `role="button"`、`tabindex` 和 `aria-describedby`；Escape 可关闭当前 Tooltip，Enter / Space 执行跳转。
- 步进器容器和 Tooltip 添加导航/提示语义，状态标签继续提供可读文本。

## 音效

- Click 包络调整为约 22–27ms 的 1200Hz → 400Hz 短脉冲，低频触底声同步收短。
- Scroll Tick 降低到 0.045 主音量、820Hz → 300Hz，并保留 75ms 防抖阀，减少高速滚动时的听觉负担。

验证：`npm run build`、`npx tsc --noEmit` 和 `npm test`（48 项）均通过。
