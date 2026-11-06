
delete from public.observations where indicator_id in ('vix','vixeq','vixeq_vix_ratio');
insert into public.observations (indicator_id,as_of,reference_period,actual,unit,source_url,evidence_grade,data_quality,updated_at) values
('vix','2026-11-05','2026-11-05',28.18,'index','https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv','E1','OK',now()),
('vixeq','2026-11-05','2026-11-05',49.68,'index','https://cdn.cboe.com/api/global/us_indices/daily_prices/VIXEQ_History.csv','E1','OK',now()),
('vixeq_vix_ratio','2026-11-05','2026-11-05',1.763,'x','Cboe VIXEQ/VIX','E1','OK',now());
update public.indicators set source_hint='Cboe VIX_History.csv' where id='vix';
update public.indicators set source_hint='Cboe VIXEQ_History.csv' where id='vixeq';
update public.indicators set source_hint='Cboe VIXEQ/VIX', name='VIXEQ/VIX' where id='vixeq_vix_ratio';
