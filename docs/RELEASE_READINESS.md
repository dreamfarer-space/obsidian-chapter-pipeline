# 发布验收记录

当前插件版本为 `1.2.5`，生产入口由 `src/main.ts` 构建到根目录 `main.js`。可安装包只需要以下三个运行时文件：

```text
main.js
manifest.json
styles.css
```

验收项目：

- `manifest.json` 的 id、版本、最低 Obsidian 版本和移动端标记一致。
- `main.js` 为 CommonJS 生产 bundle，`obsidian` 保留为宿主运行时依赖。
- `styles.css` 包含主题、窄屏、触控、键盘焦点、高对比度和 reduced-motion 规则。
- `npm run build` 成功。
- `npx tsc --noEmit` 成功。
- `npm test` 的 91 项测试全部通过。

生成包时不要把 `src/`、测试文件、开发依赖或 `data.json` 放入插件目录；这些内容属于源码和本地开发环境。
