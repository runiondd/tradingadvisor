# Mac Trading Assistant (Desktop)

Electron + React + TypeScript app. See [root README](../README.md) for branching, release, and run instructions.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server and Electron (waits for Vite then launches). |
| `npm run dev:renderer` | Vite only (http://localhost:5173). |
| `npm run dev:electron` | Build electron + run Electron (expects Vite already running). |
| `npm run build` | Build renderer and electron to `dist/`. |
| `npm run lint` | ESLint on `src/` and `electron/`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest (unit tests). |

## Structure

- `electron/` – Main process and preload; storage (SQLite) runs in main.
- `src/` – Renderer (React), domain (data-providers, analytics, portfolio, recommendations), config, IPC types.
- `config/` – Provider config (re-exports); API keys via keychain when wired.
