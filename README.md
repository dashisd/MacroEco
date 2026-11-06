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

`data/` holds CSV extracts and SQL batches used to load history. `scripts/` are local ingest helpers (`scripts/seed-demo.mjs`, `scripts/ingest-dgs10-tnx.mjs`). They read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment at runtime and exit if those are missing. Do not commit those keys.

## License

GPL-3.0. See [LICENSE](LICENSE).
