import { Pool, type PoolConfig } from "pg";
import {
  CheckpointSchema,
  ProgressSchema,
  type Progress,
  type Proposal,
  type SafeJobError,
} from "../contracts";
export interface Job {
  id: string;
  company_id: string;
  requested_by: string;
  requested_url: string;
  started_at?: string | Date | null;
  options: Record<string, number>;
  lease_token: string;
  status: string;
  checkpoint: Record<string, unknown>;
  progress: Progress;
  cancel_requested_at: string | null;
  source_captures?: Record<string, unknown>[];
  current_entries?: {
    id: string;
    kind: string;
    current_revision: number;
    content: Record<string, unknown>;
  }[];
}
export interface JobRepository {
  claim(workerId: string): Promise<Job | null>;
  heartbeat(job: Job): Promise<Job>;
  checkpoint(
    job: Job,
    checkpoint: Record<string, unknown>,
    progress: Progress,
  ): Promise<Job>;
  source(
    job: Job,
    capture: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  finish(job: Job, proposals: Proposal[], coverage: unknown[]): Promise<Job>;
  fail(job: Job, error: SafeJobError): Promise<Job>;
  /** Hands the lease back so the next claim resumes the job from its checkpoint. */
  release(job: Job): Promise<Job>;
  close(): Promise<void>;
}
/** Connection must be a dedicated restricted worker login, never a service-role key. */
export class PostgresJobRepository implements JobRepository {
  private readonly pool: Pool;
  constructor(config: PoolConfig) {
    this.pool = new Pool({
      ...config,
      max: 2,
      application_name: "MoFloKnowledge-worker",
    });
  }
  private async call<T>(name: string, args: unknown[]): Promise<T> {
    const result = await this.pool.query(
      `select * from private.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    );
    return (result.rows[0] ?? null) as T;
  }
  async claim(workerId: string) {
    const result = await this.pool.query(
      "select private.claim_job($1) as job",
      [workerId],
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
    return result.rows[0]?.job as Job | null;
  }
  heartbeat(j: Job) {
    return this.call<Job>("heartbeat_job", [j.id, j.company_id, j.lease_token]);
  }
  checkpoint(j: Job, checkpoint: Record<string, unknown>, progress: Progress) {
    return this.call<Job>("checkpoint_job", [
      j.id,
      j.company_id,
      j.lease_token,
      JSON.stringify(CheckpointSchema.parse(checkpoint)),
      JSON.stringify(ProgressSchema.parse(progress)),
    ]);
  }
  source(j: Job, capture: Record<string, unknown>) {
    return this.call<Record<string, unknown>>("insert_source_capture", [
      j.id,
      j.company_id,
      j.lease_token,
      JSON.stringify(capture),
    ]);
  }

  finish(j: Job, proposals: Proposal[], coverage: unknown[]) {
    return this.call<Job>("finish_job", [
      j.id,
      j.company_id,
      j.lease_token,
      JSON.stringify({ candidates: proposals, decisions: [] }),
      JSON.stringify(coverage),
    ]);
  }
  fail(j: Job, error: SafeJobError) {
    return this.call<Job>("fail_job", [
      j.id,
      j.company_id,
      j.lease_token,
      JSON.stringify(error),
    ]);
  }
  release(j: Job) {
    return this.call<Job>("release_job", [j.id, j.company_id, j.lease_token]);
  }
  close() {
    return this.pool.end();
  }
}
