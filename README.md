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

## Scheduled FRED ingest

`supabase/functions/fred-board-ingest` is a scheduled Edge Function for five official FRED series. pg_cron calls it through pg_net. The function fetches FRED and upserts the board tables. The SQL schedule does not fetch sources.

| FRED series | Board id | Unit |
| --- | --- | --- |
| DCOILWTICO | `wti` | USD/bbl |
| BAMLH0A0HYM2 | `hy_oas` | % |
| BAMLC0A0CM | `ig_oas` | % |
| T10Y2Y | `t10y2y` | pp |
| T10YIE | `t10yie` | % |

Those ids are the ones already on `indicators`. The job writes `series_1y` and `observations` only. Each run upserts real prints from the 21 days ending on that trade date and leaves older rows unchanged. A FRED `"."` (or blank / `NA`) is a missing print: that date is left out of `series_1y`, and the target trade date is stored on `observations` with `data_quality = 'NA'` and a null actual. An existing OK or REVISED print for that same key is left in place. A failed FRED request is not a missing print, so an outage does not write `NA` over the last good value. Rows are never deleted, and a missing source is never filled in. `series_ohlc` is left alone, because these prints are single values. `report_meta` and `report_notes` are not written.

Nominal yields `dgs2`, `dgs10`, and `dgs30` stay on WSJ closes. This job does not ingest them from FRED DGS. It also does not ingest ETF prices or ratios, VIX, VIXEQ, DSPX, the S&P, Nasdaq, or Dow, Brent, gold, or BTC.

Schedule, Asia/Shanghai (UTC+8, no daylight-saving time), Monday–Saturday:

| Shanghai | UTC cron | Behavior |
| --- | --- | --- |
| 08:00 | `0 0 * * 1-6` | Fetch and upsert |
| 10:00 | `0 2 * * 1-6` | Exit with no write when that trade date already has all five series |
| 14:00 | `0 6 * * 1-6` | Same completeness check as 10:00 |

The three jobs are declared in `supabase/migrations/20261116093853_fred_board_ingest_schedule.sql`. Nothing in the function creates or drops cron jobs. pg_cron and pg_net are enabled in that migration. The platform JWT check is off for this function because the cron call carries the secret key on the `apikey` header. The handler still rejects every other caller.

Secrets stay in Supabase. Before the jobs can succeed, store Vault secrets named `project_url` and `secret_key` (placeholders `<PROJECT_URL>` and `<SUPABASE_SECRET_KEY>`), and set the Edge Function secret `FRED_API_KEY` to `<FRED_API_KEY>`. `secret_key` has to be the project's default secret key: the cron request sends it on the `apikey` header, and the function accepts that default key. Writes use the secret key the platform injects into the function. Do not commit those values, a service-role key, or a daily data file.

This job is not enabled on production. It starts only after this pull request is merged and the migration is applied, the function is deployed, and the secrets above exist. Until that is accepted in production, the existing bot ingest keeps running.

The sidebar has two pages. 美国市场 opens 市场追踪 (KPI sparklines, the multi-series chart, and tabbed 市场数据 cards). 宏观数据 opens the summary, notes, and the remaining macro readings. ETF prices (SPY, RSP, QQQ, IWM, sector SPDRs plus XBI, HYG, LQD, TLT, SGOV, and style/theme funds SCHD, MTUM, QUAL, ARKK) sit in those 市场数据 tabs and as individual series toggles on the home chart. The chart does not plot the five total-return ratios. Prices are read from `etf_prices`. `etf_ratio_series` remains in the database for ingest, and the browser does not draw it. The schema is in `supabase/migrations/001_etf_phase1_prices_and_ratios.sql`. The browser never writes those tables. `node scripts/ingest-etf.mjs` upserts about five years of daily bars (Yahoo adjusted close, Nasdaq OHLC if Yahoo fails) and rebuilds the ratios. It does not delete rows that a source omits. `node scripts/ingest-etf.mjs --dry-run` fetches and prints counts without writing.

## License

GPL-3.0. See [LICENSE](LICENSE).
