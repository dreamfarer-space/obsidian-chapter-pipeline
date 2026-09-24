# Obsidian Community Plugin 合规审计

> 状态说明：本文记录当前代码层面的合规与生命周期审计结论。发布版本、平台支持与最低 Obsidian 版本以 `manifest.json`、`versions.json` 和 [`COMMUNITY_SUBMISSION.md`](COMMUNITY_SUBMISSION.md) 为准，避免阶段性审计记录与发布元数据产生冲突。

审计范围：`src/legacy-main.js`、`src/main.ts`、`src/core/`、`src/ui/`、`src/views/` 和 `manifest.json`。

## 审计结论

| 项目 | 结果 | 处理说明 |
| --- | --- | --- |
| 用户内容注入 | 通过 | 未发现 `innerHTML`、`outerHTML`、`insertAdjacentHTML`、`eval` 或 `new Function`。标题和摘要通过 `createEl` / `createDiv` / `createSpan` 和 Obsidian `MarkdownRenderer.render` 生成。 |
| LaTeX 预览 | 通过 | 摘要只交给 Obsidian MarkdownRenderer；解析器保持数学分隔符配对和多行 `\\`，未引入字符串拼接脚本执行路径。 |
| 事件生命周期 | 通过 | Vault、Workspace、MetadataCache 事件使用 `registerEvent`；滚动、Tooltip 和 ResizeObserver 在视图重建及 `onunload` 中解除。 |
| 全局监听 | 通过 | 未使用裸的 `window.addEventListener` 或 `document.addEventListener`。DOM 监听器只绑定到当前视图节点，并随节点移除。 |
| 私有 API 降级 | 通过 | CodeMirror 和模式对象均通过可选链、能力检测和 Reading View / 编辑器回退路径访问。 |
| 数据持久化 | 通过 | 阅读断点和书签只写入 `loadData` / `saveData` 返回的插件数据；Vault 只读缓存和元数据，不修改 Markdown 或 Frontmatter。 |
| 删除清理 | 通过 | `vault.on('delete')` 同时清理文件、目录前缀、解析缓存和版本映射。 |
| 移动端 | 暂不声明支持 | 当前 `manifest.json` 为 `isDesktopOnly: true`。Android 与 iOS/iPadOS 尚未完成明确的真机 smoke test，因此本审计不把移动端列为已验证平台。 |

## 兼容性边界

`setEphemeralState`、CodeMirror `cm`、`currentMode` 和 `previewMode` 都不是插件核心数据源。调用前会检查方法或属性是否存在；缺失时继续使用公开编辑器滚动、DOM 几何和缓存元数据完成导航。

移动端支持如需启用，应先完成 Android 与 iOS/iPadOS 的窄视图、触控 Tooltip、章节导航、命令面板、旋转/恢复和插件重载测试，再有意识地把 `isDesktopOnly` 改为 `false`。

## 验证

- `npm run build`：生产构建成功。
- `npx tsc --noEmit`：严格类型检查通过。
- `npm test`：自动化测试通过；具体测试数量以当前 CI 输出为准。

真实 Obsidian 兼容性证据和当前发布状态统一记录在 [`COMMUNITY_SUBMISSION.md`](COMMUNITY_SUBMISSION.md)，本文不重复维护版本号，避免后续发布造成文档漂移。
