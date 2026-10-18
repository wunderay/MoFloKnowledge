export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}
const CONFLICT = "This value changed since the page was loaded. Reload the page to get the latest, then try again.";

/** A failed request in words: a stale revision (409) gets the reload wording, anything else its own message. */
export function errorMessage(error: unknown, fallback = "The request could not be completed."): string {
  if (error instanceof ApiError && error.status === 409) {return CONFLICT;}
  return (error as Error | undefined)?.message || fallback;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    // A FormData body needs the browser's own multipart Content-Type.
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- init.headers is a plain object at every call site
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  // An error page or empty body is not JSON; report it like any other failed request.
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: { message?: string; details?: unknown };
  } | null;
  if (!response.ok || !body || body.error) {
    throw new ApiError(
      body?.error?.message ?? "The request could not be completed.",
      response.status,
      body?.error?.details,
    );
  }
  return body.data as T;
}
export function write(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
export function companyPath(companyId: string, suffix = "") {
  return `/api/companies/${encodeURIComponent(companyId)}${suffix}`;
}
