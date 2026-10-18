-- A worker that runs out of time hands its lease back instead of failing the job. The next claim resumes it from its
-- checkpoint. Pausing is not an attempt that failed, so it is not counted against the three attempts claim_job allows.
BEGIN;
SET ROLE moflo_owner;
CREATE FUNCTION private.release_job(p_job uuid,p_company uuid,p_lease_token uuid) RETURNS public.scrape_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.scrape_jobs:=private.worker_job(p_job,p_company,p_lease_token,true);
BEGIN UPDATE public.scrape_jobs SET lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now(),attempt_count=greatest(attempt_count-1,0),heartbeat_at=now(),updated_at=now() WHERE id=p_job RETURNING * INTO j; RETURN j; END $$;
GRANT EXECUTE ON FUNCTION private.release_job(uuid,uuid,uuid) TO moflo_worker;
COMMIT;
