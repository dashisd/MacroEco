# MacroEco

US macro short-term dashboard. A React + Vite + TypeScript + Tailwind + ECharts frontend that reads rates, volatility, and market series from Supabase.

There is no backend app in this repo. Data lives in Supabase. The browser uses the publishable anon key only.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run build
npm run preview
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. Never put a `service_role` key in the frontend or in git.

## Data and scripts

`data/` holds CSV extracts and SQL batches used to load history. `scripts/` are local ingest helpers (`scripts/seed-demo.mjs`, `scripts/ingest-dgs10-tnx.mjs`, `scripts/ingest-etf.mjs`). They read `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` from the environment at runtime and exit if those are missing. Do not commit those keys.

The top bar switches between the macro board and an independent US ETF board (SPY, RSP, QQQ, IWM, sector SPDRs, HYG, LQD, TLT). ETF prices and the five total-return ratios (`SPY/RSP`, `QQQ/SPY`, `IWM/SPY`, `XLK/XLF`, `HYG/LQD`) are read from `etf_prices` and `etf_ratio_series`. The schema is in `supabase/migrations/001_etf_phase1_prices_and_ratios.sql`. The browser never writes those tables. `node scripts/ingest-etf.mjs` upserts about five years of daily bars (Yahoo adjusted close, Nasdaq OHLC if Yahoo fails) and rebuilds the ratios. It does not delete rows that a source omits. `node scripts/ingest-etf.mjs --dry-run` fetches and prints counts without writing.

## License

GPL-3.0. See [LICENSE](LICENSE).
