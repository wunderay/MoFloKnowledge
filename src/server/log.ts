// One JSON line per event on stderr. Callers pass ids and an error only: never request bodies, headers, cookies or tokens.
const CONNECTION_STRING = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"']*/gi;

function describeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: redact(String(error)) };
  }
  const code = (error as { code?: unknown }).code;
  return {
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
    message: redact(error.message),
    ...(error.stack ? { stack: redact(error.stack) } : {}),
  };
}

function redact(text: string) {
  return text.replace(CONNECTION_STRING, "[redacted-url]");
}

export function logError(msg: string, context: { requestId?: string; jobId?: string; error?: unknown } = {}) {
  const { error, ...ids } = context;
  process.stderr.write(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      msg,
      ...ids,
      ...(error === undefined ? {} : { error: describeError(error) }),
    }) + "\n",
  );
}
