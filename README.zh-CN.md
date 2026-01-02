# CapCap

一款智能浏览器截图扩展，让捕获特定元素和区域变得轻松自如。

## 功能特点

- **智能元素检测**: 自动高亮显示有意义的元素，智能识别最合适的容器
- **灵活选择**: 点击捕获智能选择的元素，或拖拽手动选择任意区域
- **快速操作**: 一键复制到剪贴板或保存为 PNG 文件
- **键盘快捷键**: 使用 `Ctrl+Shift+X`（Mac 上为 `Cmd+Shift+X`）激活
- **跨浏览器支持**: 支持 Chrome、Edge 和 所有基于 Chromium 的浏览器。

## 开发

安装依赖:

```bash
pnpm install
```

运行开发服务器:

```bash
# Chrome/Edge
pnpm run dev

生产构建:

```bash
pnpm run build          # Chrome/Edge
```

创建发布包:

```bash
pnpm run zip          # Chrome/Edge
```

运行类型检查:

```bash
pnpm run check
```

## 技术栈

- **WXT** - Web 扩展框架
- **Svelte 5** - 响应式 UI 框架
- **TypeScript** - 类型安全

## 许可证

MIT
