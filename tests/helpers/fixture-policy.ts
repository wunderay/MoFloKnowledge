/** Test-only egress allowlist. Production code must never import this module. */
const origins = new Set(
  (process.env.MOFLO_TEST_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin),
);

export function assertTestFixtureOrigin(input: string | URL): URL {
  const url = input instanceof URL ? input : new URL(input);
  if (!origins.has(url.origin)) {
    throw new Error(`Test fixture egress denied for origin ${url.origin}; configure MOFLO_TEST_ALLOWED_ORIGINS explicitly`);
  }
  return url;
}

export function getTestFixtureOrigins(): readonly string[] {
  return [...origins].sort();
}
