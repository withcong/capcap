# CapCap

A smart screenshot extension for browsers that makes capturing specific elements and regions effortless.

## Features

- **Smart Element Detection**: Automatically highlights meaningful elements as you hover, intelligently identifying the most appropriate container
- **Flexible Selection**: Click to capture smart-selected elements, or drag to manually select any region
- **Quick Actions**: Copy to clipboard or save as PNG with a single click
- **Keyboard Shortcut**: Use `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to activate
- **Cross-Browser**: Works on Chrome, Edge, and all chromium-based browsers.

## Development

Install dependencies:

```bash
pnpm install
```

Run development server:

```bash
# Chrome/Edge
pnpm run dev

# Firefox
```

Build for production:

```bash
pnpm run build          # Chrome/Edge
```

Create distribution package:

```bash
pnpm run zip          # Chrome/Edge
```

Run type checking:

```bash
pnpm run check
```

## Tech Stack

- **WXT** - Web Extension framework
- **Svelte 5** - Reactive UI framework
- **TypeScript** - Type safety

## License

MIT
