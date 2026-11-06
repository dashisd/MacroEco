
delete from public.observations where indicator_id in ('vix','vixeq','vixeq_vix_ratio');
insert into public.observations (indicator_id,as_of,reference_period,actual,unit,source_url,evidence_grade,data_quality,updated_at) values
('vix','2026-11-03','2026-11-03',20.83,'index','https://www.cboe.com/tradable_products/vix/','E2','OK',now()),
('vixeq','2026-11-03','2026-11-03',42.8,'index','https://www.cboe.com/','E2','OK',now()),
('vixeq_vix_ratio','2026-11-03','2026-11-03',2.0547,'x','derived','E2','OK',now());
update public.indicators set name='VIXEQ/VIX' where id='vixeq_vix_ratio';
