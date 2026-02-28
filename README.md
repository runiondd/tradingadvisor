# Mac Trading Assistant

Electron + React desktop app for researching stocks, commodities, and options with macro, sentiment, and statistical analysis. Read-only: no order placement; supports CSV and future broker read-only integration.

## Repo layout

- **`apps/desktop/`** – Electron + TypeScript/React app (main process, renderer, domain logic, tests).

## Branching and release strategy

- **`main`** – Always deployable; tagged for each release (e.g. `v0.1.0`).
- **`develop`** – Integration branch for the next release. Feature branches merge here.
- **`feature/*`** – Short-lived branches for new work (e.g. `feature/options-optimizer`). Branch from `develop`, merge back into `develop`.
- **`hotfix/*`** – Emergency fixes from `main`. Merge into both `main` and `develop`, then tag.

### Release flow

1. Create `release/vX.Y.Z` from `develop`.
2. Stabilize on the release branch, then merge into `main`.
3. Tag `vX.Y.Z` on `main`.
4. Merge `main` back into `develop` if needed.

### Rollback

- Install a previous version from [GitHub Releases](https://github.com/runiondd/tradingadvisor/releases), or check out the desired tag (e.g. `git checkout v0.1.0`) and build locally.

## Running the desktop app

```bash
cd apps/desktop
npm install
npm run dev
```

- **Dev:** Vite serves the React app at http://localhost:5173; Electron opens a window loading it. Run `npm run build:electron` first if the main process changes.
- **Production build:** `npm run build` then `NODE_ENV=production npx electron .`

## Tests and CI

```bash
cd apps/desktop
npm test
npm run lint
npm run typecheck
```

GitHub Actions (`.github/workflows/desktop-ci.yml`) run on push/PR to `main` and `develop`: lint, typecheck, tests, and a macOS build. Generate a lockfile once with `npm install` in `apps/desktop` so `npm ci` works in CI.

## Data providers and config

- **Market / Research:** Quote and price history use **Polygon** when you have a Polygon API key (Settings → Options). Otherwise **Alpha Vantage** is used (set API key in Settings). One Polygon key covers Research + Options.
- **Options:** Polygon.io Option Chain Snapshot API for real-time pricing and greeks (delta, gamma, theta, vega, IV, open interest). Set Polygon API key in Settings. Greeks and bid/ask require a plan with options quotes—see [Polygon pricing](https://polygon.io/pricing). **Historical options (heatmap):** P/C history can be extended with flat-file data. To use [Massive flat files](https://massive.com/docs/flat-files/quickstart) (options day-aggregates, trades, etc.), set up S3 access per [Setting up S3 access](https://massive.com/docs/flat-files/quickstart#setting-up-s3-access), then download the files and use the app’s **Import historical P/C** with a CSV in the [supported format](#historical-pc-csv-format) (or convert Massive’s schema to that format).
- **Real-time stocks:** WebSocket connection to `wss://socket.massive.com/stocks` for live quotes and trades. Use the same Polygon/Massive API key. From the renderer: `tradingApp.invoke("realtime:subscribe", { symbol: "AAPL" })` and `tradingApp.onRealtimeData((data) => { ... })` to receive streamed updates.
- **Macro:** FRED (optional). **News/sentiment:** Yahoo Finance + Google News RSS (free, no API key). Optional: LLM (OpenAI/Anthropic) for AI summarization and sentiment; NewsAPI as fallback.

Secrets are intended to be stored via system keychain (e.g. `keytar`); API keys are not sent to the renderer.

### Historical P/C CSV format

For **Import historical P/C** (Options screen), use either:

- **Aggregated:** CSV with headers `date`, `symbol` (or `underlying`/`ticker`), `ratio_vol`, optional `ratio_oi` — one row per symbol per date.
- **Contract-level:** CSV with `date`, `symbol`, `option_type` (put/call), `volume`, optional `open_interest` — the app aggregates by (symbol, date) and computes put/call ratios.

**Broker / portfolio:** CSV import is supported now. A read-only Fidelity account connection is planned for syncing positions and transactions.

**Alpha Vantage options:** Add an Alpha Vantage API key in Settings (optional) to use as fallback when Polygon fails or returns no data. Alpha Vantage Historical Options includes Greeks and bid/ask; requires a [Premium](https://www.alphavantage.co/premium/) plan.
