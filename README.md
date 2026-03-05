# TabVault

Chrome extension for saving and restoring tab workspaces with native tab group support.

## Features

- Save all tabs as a named workspace with one click
- Restore workspaces in a new window or current window
- Lazy loading — restored tabs load on demand to save memory
- Search, rename, and organize saved workspaces
- Keyboard shortcut (Alt+S) for quick save

### Pro ($2 one-time)

- Unlimited workspaces (free: 3)
- Tab group restore with colors, names, and collapsed state
- Export/Import workspaces as JSON
- Daily auto-backup

## Development

```bash
npm install
npm run dev          # WXT dev mode with HMR
npm run build        # Production build to .output/chrome-mv3/
npm run test         # Run tests
npm run typecheck    # TypeScript check
```

### Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select `.output/chrome-mv3/`

## Tech Stack

- [WXT](https://wxt.dev) — extension framework (Manifest V3)
- React 19 + TypeScript
- Tailwind CSS v4
- Vitest

## License

MIT
