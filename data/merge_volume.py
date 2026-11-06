#!/usr/bin/env python3
"""Merge futures Volume into series_ohlc for dgs2/dgs10/dgs30/t10y2y; emit SQL batches."""
import csv
from datetime import datetime
from pathlib import Path

def load_vol(path):
    rows = {}
    with open(path, newline='') as f:
        r = csv.DictReader(f)
        # normalize keys
        for row in r:
            d = { (k or '').strip(): (v or '').strip() for k, v in row.items() }
            date_s = d.get('Date') or d.get('date')
            vol_s = d.get('Volume') or d.get('volume') or d.get('Vol')
            if not date_s or not vol_s:
                continue
            vol_s = vol_s.replace(',', '')
            if vol_s in ('-', 'null', 'None', ''):
                continue
            try:
                vol = float(vol_s)
            except ValueError:
                continue
            if vol <= 0:
                continue
            # parse date
            for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
                try:
                    dt = datetime.strptime(date_s, fmt).strftime('%Y-%m-%d')
                    break
                except ValueError:
                    dt = None
            if not dt:
                continue
            rows[dt] = vol
    return rows

base = Path('/workspace/us-macro-dashboard/data')
mapping = {
    'dgs2': base / 'zt_futures_5y.csv',
    'dgs10': base / 'zn_futures_5y.csv',
    'dgs30': base / 'zb_futures_5y.csv',
}
vols = {k: load_vol(p) for k, p in mapping.items() if p.exists()}
print({k: len(v) for k, v in vols.items()})
# t10y2y: use ZN volume (curve liquidity proxy)
if 'dgs10' in vols:
    vols['t10y2y'] = vols['dgs10']

out = base / 'vol_batches'
out.mkdir(exist_ok=True)
for f in out.glob('*.sql'):
    f.unlink()
idx = 0
for ind, vmap in vols.items():
    dates = sorted(vmap)
    chunk = []
    for i, dt in enumerate(dates):
        chunk.append(f"('{ind}','{dt}'::date,{vmap[dt]})")
        if len(chunk) == 400 or i == len(dates) - 1:
            sql = (
                "update public.series_ohlc as s set volume = v.volume from (values\n"
                + ',\n'.join(chunk)
                + "\n) as v(indicator_id, date, volume)\n"
                "where s.indicator_id = v.indicator_id and s.date = v.date;"
            )
            (out / f'{idx:03d}_{ind}_vol.sql').write_text(sql)
            idx += 1
            chunk = []
print('files', idx)
