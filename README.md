<p align="center">
  <img src="public/icon-128.png" width="80" alt="TabVault icon" />
</p>

<h1 align="center">TabVault</h1>

<p align="center">
  Save your browser tabs as workspaces. Restore them anytime with one click.
</p>

<p align="center">
  <a href="https://github.com/jasonchang0621z/tabVault/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
  </a>
</p>

---

## Why TabVault?

You know the drill — 20 tabs open for a project, another 15 for a side task, a few more for that thing you were researching last week. Then Chrome eats your RAM, you close a window, and everything is gone.

**TabVault fixes this.** Save your entire window as a named workspace, close it, and restore it anytime — tabs, tab groups, colors, everything.

- Switching between projects? Save one workspace, open another.
- Running low on memory? Save and close. Your tabs are waiting when you need them.
- Lost your tabs after a crash? Not anymore.

## Features

| Feature | Description |
|---------|-------------|
| **One-click save** | Save all tabs in the current window as a named workspace |
| **Instant restore** | Reopen a workspace in a new window or the current one |
| **Lazy loading** | Restored tabs only load when you click on them — saves memory |
| **Search** | Quickly find any workspace by name |
| **Rename & organize** | Rename workspaces to keep things tidy |
| **Keyboard shortcut** | Press `Alt+S` to save instantly |

## Free vs Pro

|  | Free | Pro ($2 one-time) |
|--|------|-------------------|
| Workspaces | 3 | Unlimited |
| Tab group restore | — | Colors, names, collapsed state |
| Export / Import | — | JSON backup & sharing |
| Auto-backup | — | Daily automatic saves |

## How It Works

```
1. Save     →  Click "Save Current" or press Alt+S
2. Switch   →  Close tabs and work on something else
3. Restore  →  Click a workspace to bring it all back
```

## Privacy

All data is stored locally in your browser using `chrome.storage.local`. Nothing is sent to external servers. Your tabs, your data, your device.

[Read our Privacy Policy](https://jasonchang0621z.github.io/tabVault/privacy-policy.html)

## Install

Install from the [Chrome Web Store](#) (coming soon), or load it manually:

1. Clone this repo
2. `npm install && npm run build`
3. Go to `chrome://extensions` → enable **Developer Mode**
4. Click **Load unpacked** → select `.output/chrome-mv3/`

## Development

```bash
npm install          # Install dependencies
npm run dev          # WXT dev mode with HMR
npm run build        # Production build → .output/chrome-mv3/
npm run test         # Run tests (Vitest)
npm run typecheck    # TypeScript check
```

## Tech Stack

- [WXT](https://wxt.dev) — Chrome Extension framework (Manifest V3)
- React 19 + TypeScript
- Tailwind CSS v4
- Vitest + happy-dom

## License

[MIT](LICENSE)
