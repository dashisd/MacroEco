-- Phase 1 ETF board tables. Already applied on project skmicrenvtejngqbyoqs.
-- Upsert-only. Anon/authenticated are SELECT-only. service_role writes.

create table if not exists public.etf_universe (
  ticker text primary key,
  name text not null,
  group_id text not null check (group_id = any (array['broad'::text, 'sector'::text, 'credit_rates'::text])),
  issuer text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.etf_prices (
  ticker text not null references public.etf_universe(ticker),
  trade_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  adj_close numeric,
  volume numeric,
  source text,
  quality_flag text not null default 'single_source'
    check (quality_flag = any (array[
      'official_confirmed'::text,
      'third_party_cross_checked'::text,
      'single_source'::text,
      'delayed'::text,
      'stale'::text,
      'missing'::text
    ])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ticker, trade_date)
);

create index if not exists etf_prices_trade_date_idx on public.etf_prices (trade_date);

create table if not exists public.etf_ratio_series (
  ratio_id text not null,
  trade_date date not null,
  value numeric not null,
  numerator_ticker text not null,
  denominator_ticker text not null,
  source text,
  quality_flag text not null default 'single_source'
    check (quality_flag = any (array[
      'official_confirmed'::text,
      'third_party_cross_checked'::text,
      'single_source'::text,
      'delayed'::text,
      'stale'::text,
      'missing'::text
    ])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ratio_id, trade_date)
);

create index if not exists etf_ratio_series_trade_date_idx on public.etf_ratio_series (trade_date);

insert into public.etf_universe (ticker, name, group_id, issuer, sort_order) values
  ('SPY', 'SPDR S&P 500 ETF', 'broad', 'SSGA', 10),
  ('RSP', 'Invesco S&P 500 Equal Weight', 'broad', 'Invesco', 20),
  ('QQQ', 'Invesco QQQ', 'broad', 'Invesco', 30),
  ('IWM', 'iShares Russell 2000', 'broad', 'iShares', 40),
  ('XLK', 'Technology Select Sector SPDR', 'sector', 'SSGA', 50),
  ('XLF', 'Financial Select Sector SPDR', 'sector', 'SSGA', 60),
  ('XLI', 'Industrial Select Sector SPDR', 'sector', 'SSGA', 70),
  ('XLE', 'Energy Select Sector SPDR', 'sector', 'SSGA', 80),
  ('XLV', 'Health Care Select Sector SPDR', 'sector', 'SSGA', 90),
  ('XLP', 'Consumer Staples Select Sector SPDR', 'sector', 'SSGA', 100),
  ('XLU', 'Utilities Select Sector SPDR', 'sector', 'SSGA', 110),
  ('HYG', 'iShares iBoxx High Yield Corporate', 'credit_rates', 'iShares', 120),
  ('LQD', 'iShares iBoxx Investment Grade Corporate', 'credit_rates', 'iShares', 130),
  ('TLT', 'iShares 20+ Year Treasury Bond', 'credit_rates', 'iShares', 140)
on conflict (ticker) do update set
  name = excluded.name,
  group_id = excluded.group_id,
  issuer = excluded.issuer,
  sort_order = excluded.sort_order;

alter table public.etf_universe enable row level security;
alter table public.etf_prices enable row level security;
alter table public.etf_ratio_series enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'etf_universe_anon_select') then
    create policy etf_universe_anon_select on public.etf_universe
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'etf_prices_anon_select') then
    create policy etf_prices_anon_select on public.etf_prices
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'etf_ratio_series_anon_select') then
    create policy etf_ratio_series_anon_select on public.etf_ratio_series
      for select to anon, authenticated using (true);
  end if;
end$$;

grant select on public.etf_universe, public.etf_prices, public.etf_ratio_series to anon, authenticated;
revoke insert, update, delete on public.etf_universe, public.etf_prices, public.etf_ratio_series from anon, authenticated;
