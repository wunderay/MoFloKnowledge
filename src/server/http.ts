import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { appOrigin } from "../lib/config/server";
import { verifiedSession } from "../lib/supabase/server";
import { IdSchema } from "../contracts/api-common";
import {
  ArchivedEntryResponseSchema,
  RestoredEntryResponseSchema,
  CompanyRowSchema,
  RevisionResponseSchema,
} from "../contracts/api-responses";
import type { ApiError } from "../contracts/api-common";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export function mapDatabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
}): HttpError {
  const value = error.message || "";
  let details: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(error.details ?? "{}") as unknown;
    const safe = z
      .object({
        currentRevision: z.number().int().positive().optional(),
        currentGeneration: z.number().int().nonnegative().optional(),
        activeJobId: z.string().uuid().optional(),
      })
      .strip()
      .parse(parsed);
    if (Object.keys(safe).length) {
      details = safe;
    }
  } catch {
    /* Provider details are never forwarded. */
  }

  if (value.includes('not_authenticated')) {
    return new HttpError(401, "signed_out", "Sign in to continue.");
  }
  if (value.includes('entry_has_dependents')) {
    return new HttpError(
      422,
      "entry_has_dependents",
      "Another entry cites this one's sources. Remove that citation first.",
    );
  }
  if (/not_found|unavailable|not_member/.test(value)) {
    return new HttpError(404, "unavailable", "Resource unavailable.");
  }
  if (/forbidden|insufficient_role|owner_required/.test(value)) {
    return new HttpError(
      403,
      "forbidden",
      "Your role cannot perform this action.",
    );
  }
  if (
    error.code === "23505" &&
    `${value} ${error.details ?? ""}`.includes('knowledge_entries_singleton_idx')
  ) {
    return new HttpError(
      409,
      "conflict",
      "The saved state changed. Refresh and compare your changes.",
    );
  }
  if (/stale|conflict|active_job/.test(value)) {
    return new HttpError(
      409,
      "conflict",
      "The saved state changed. Refresh and compare your changes.",
      details,
    );
  }
  if (value.includes('rate_limit')) {
    return new HttpError(429, "rate_limited", "Please wait before retrying.");
  }
  if (
    /invalid|validation|archived|last_owner|unreviewed|approval|approved|evidence|coverage|edited_leaf_requires_user_origin|unsupported_origin|unsupported_candidate_origin/.test(
      value,
    ) ||
    error.code === "23514"
  ) {
    return new HttpError(
      422,
      "validation",
      "Review the supplied values and approval requirements.",
    );
  }
  return new HttpError(
    503,
    "unavailable",
    "The service is temporarily unavailable. Please retry.",
  );
}
export function assertWriteOrigin(request: Request) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== appOrigin()
  ) {
    throw new HttpError(
      403,
      "invalid_origin",
      "Request origin is not allowed.",
    );
  }
}
export async function readJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new HttpError(400, "invalid_json", "Send application/json.");
  }
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      size += result.value.byteLength;
      if (size > 1048576) {
        await reader.cancel();
        throw new HttpError(400, "body_too_large", "JSON body exceeds 1 MiB.");
      }
      chunks.push(result.value);
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
  } catch (error) {
    const business =
      error instanceof z.ZodError &&
      error.issues.some((issue) =>
        ["content", "provenance"].includes(String(issue.path[0])),
      );
    throw new HttpError(
      business ? 422 : 400,
      business ? "validation" : "invalid_input",
      business
        ? "Review the business values and evidence."
        : "Check the request fields.",
    );
  }
}
export function json(data: unknown, requestId: string, status = 200) {
  return Response.json(
    { data, error: null, requestId },
    {
      status,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    },
  );
}
export interface RouteContext { params: Promise<Record<string, string>> }
type Session = Awaited<ReturnType<typeof verifiedSession>>;
/** The session as `route` hands it to a handler: signed-in, so `user` is never null. */
export type SignedInSession = Session & { user: NonNullable<Session["user"]> };
export function route(
  handler: (
    request: Request,
    context: RouteContext,
    auth: SignedInSession,
    requestId: string,
  ) => Promise<unknown>,
  status = 200,
) {
  return async (request: Request, context: RouteContext) => {
    const requestId = randomUUID();
    try {
      assertWriteOrigin(request);
      const auth = await verifiedSession();
      if (!auth.user) {
        throw new HttpError(401, "signed_out", "Sign in to continue.");
      }
      const data = await handler(request, context, auth as SignedInSession, requestId);
      return data instanceof Response ? data : json(data, requestId, status);
    } catch (error) {
      const safe =
        error instanceof HttpError
          ? error
          : error instanceof z.ZodError
            ? new HttpError(400, "invalid_input", "Check the request fields.")
            : new HttpError(
                503,
                "unavailable",
                "The service is temporarily unavailable. Please retry.",
              );
      const body: ApiError = {
        code: safe.code,
        message: safe.message,
        ...(safe.details ? { details: safe.details } : {}),
      };
      return Response.json(
        { data: null, error: body, requestId },
        {
          status: safe.status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  };
}
export async function rpc(
  client: Awaited<ReturnType<typeof verifiedSession>>["client"],
  name: string,
  args: Record<string, unknown>,
) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
  const { data, error } = await client.rpc(name, args);
  if (error) {
    throw mapDatabaseError(error);
  }
  if (name === "create_company") {
    return parseResponse(IdSchema, data);
  }
  if (["update_company", "archive_company"].includes(name)) {
    return parseResponse(CompanyRowSchema, data);
  }
  if (name === "archive_entry") {
    return parseResponse(ArchivedEntryResponseSchema, data);
  }
  if (name === "restore_entry") {
    return parseResponse(RestoredEntryResponseSchema, data);
  }
  if (
    [
      "create_entry",
      "save_entry_revision",
      "revert_entry",
      "apply_proposal",
    ].includes(name)
  ) {
    return parseResponse(RevisionResponseSchema, data);
  }
  return data as unknown;
}

export function parseResponse<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      503,
      "invalid_response",
      "The service returned an invalid response. Please retry.",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
  return result.data as z.output<S>;
}
