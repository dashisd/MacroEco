-- Allow the style/theme ETF group and seed the six added tickers.
-- Upsert-only. Does not delete existing universe or price rows.

alter table public.etf_universe drop constraint if exists etf_universe_group_id_check;

alter table public.etf_universe add constraint etf_universe_group_id_check
  check (group_id = any (array[
    'broad'::text,
    'sector'::text,
    'credit_rates'::text,
    'style_theme'::text
  ]));

insert into public.etf_universe (ticker, name, group_id, issuer, sort_order) values
  ('XBI', 'SPDR S&P Biotech ETF', 'sector', 'SSGA', 115),
  ('SGOV', 'iShares 0-3 Month Treasury Bond ETF', 'credit_rates', 'iShares', 145),
  ('SCHD', 'Schwab US Dividend Equity ETF', 'style_theme', 'Schwab', 160),
  ('MTUM', 'iShares MSCI USA Momentum Factor ETF', 'style_theme', 'iShares', 170),
  ('QUAL', 'iShares MSCI USA Quality Factor ETF', 'style_theme', 'iShares', 180),
  ('ARKK', 'ARK Innovation ETF', 'style_theme', 'ARK', 190)
on conflict (ticker) do update set
  name = excluded.name,
  group_id = excluded.group_id,
  issuer = excluded.issuer,
  sort_order = excluded.sort_order;
