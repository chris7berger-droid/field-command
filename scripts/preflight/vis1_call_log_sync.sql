-- VIS-1 read-only: extra call_log rows for live Parked/Scheduled jobs
-- whose Sales stage is outside the existing Field stage list.
SELECT cl.id, cl.job_number, cl.stage, j.job_id, j.status, j.deleted
FROM public.jobs j
JOIN public.call_log cl ON cl.id = j.call_log_id
WHERE (j.deleted IS NULL OR j.deleted = 'No')
  AND (j.status = 'Parked' OR j.status = 'Scheduled')
  AND cl.stage NOT IN ('Scheduled','In Progress','Parked','mobilized','in_progress')
ORDER BY cl.job_number, cl.id;
