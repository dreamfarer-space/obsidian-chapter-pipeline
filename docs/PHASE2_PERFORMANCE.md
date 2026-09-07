# Phase 2 性能与生命周期优化

## 已处理的位置

- `attachStepperToView` 的滚动处理增加 2px 位移阈值，并在非活动 Markdown 视图中直接跳过计算；现有 `requestAnimationFrame` 合并仍保留。
- 进度导轨先读取活动横线的几何信息，再批量写入激活状态、折叠状态和导轨高度，减少 `offsetTop` 与 class 写入交错造成的强制回流。
- 章节解析增加 32 项 LRU 缓存，缓存键包含文件路径、文件 mtime、编辑/元数据版本、解析设置和标题签名；编辑、元数据变化、重命名与删除会主动失效对应记录。
- 所有延迟帧统一经过协调层的 `scheduleFrame`，卸载时取消未完成的 rAF；Tooltip、ResizeObserver、滚动监听、章节缓存和 Web Audio 上下文都在 `onunload` 路径释放。

## 结果

`ChapterParser.parse` 在 50,000 行笔记仿真下继续保持低于 15ms（当前测试运行约 5ms，机器和 Node 版本会影响绝对数值）。重复刷新同一文件时直接命中 LRU，悬停和滚动不会重复进行相同的摘要提取。所有持久化数据仍通过插件的 `loadData` / `saveData` 完成，缓存只存在内存中。

## 验证

- `npm run build`：生产包成功生成。
- `npx tsc --noEmit`：严格类型检查通过。
- `npm test`：48 项测试全部通过。
