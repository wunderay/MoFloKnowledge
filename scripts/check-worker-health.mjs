import pg from "pg";

const connectionString = process.env.MOFLO_OPS_DATABASE_URL;
if (!connectionString) {
  console.error("NOT_RUN: MOFLO_OPS_DATABASE_URL is required for the private read-only operations command");
  process.exitCode = 2;
} else {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");
    const { rows } = await client.query(`
      SELECT
        EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status = 'queued')))::bigint AS oldest_queued_age_seconds,
        COUNT(*) FILTER (WHERE lease_expires_at IS NOT NULL AND lease_expires_at < now())::int AS expired_lease_count,
        COUNT(*) FILTER (WHERE finished_at >= now() - interval '24 hours' AND status IN ('succeeded','partial','failed','cancelled'))::int AS terminal_jobs_24h,
        COUNT(*) FILTER (WHERE finished_at >= now() - interval '24 hours' AND status = 'failed')::int AS failed_jobs_24h,
        MAX(heartbeat_at) AS latest_job_heartbeat_at
      FROM public.scrape_jobs
    `);
    const row = rows[0];
    const terminalJobs = Number(row.terminal_jobs_24h);
    const failedJobs = Number(row.failed_jobs_24h);
    const heartbeatAt = row.latest_job_heartbeat_at ? new Date(row.latest_job_heartbeat_at).toISOString() : null;
    const heartbeatAge = heartbeatAt ? Math.max(0, Math.floor((Date.now() - Date.parse(heartbeatAt)) / 1000)) : null;
    const summary = {
      oldestQueuedAgeSeconds: row.oldest_queued_age_seconds === null ? null : Number(row.oldest_queued_age_seconds),
      expiredLeaseCount: Number(row.expired_lease_count),
      terminalJobs24h: terminalJobs,
      failedJobs24h: failedJobs,
      terminalFailureRate24h: terminalJobs === 0 ? null : Number((failedJobs / terminalJobs).toFixed(4)),
      latestJobHeartbeatAt: heartbeatAt,
      workerHeartbeat: heartbeatAge === null ? "unknown" : heartbeatAge <= 60 ? "recent-job-heartbeat" : "stale-job-heartbeat",
      workerHeartbeatAgeSeconds: heartbeatAge,
    };
    await client.query("COMMIT");
    console.log(JSON.stringify(summary));
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    console.error("HEALTH_CHECK_FAILED: verify the private operator credential, read-only grants, and scrape_jobs migration");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
