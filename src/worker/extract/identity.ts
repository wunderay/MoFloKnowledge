export { stableId } from "../../lib/identity";

const TRACKING_PARAM = /^(?:utm_.*|ref|ref_src|ref_url|fbclid|gclid|igshid|mc_cid|mc_eid)$/i;
/** Profile URLs are compared and stored without share/tracking query parameters. */
export function stripTrackingParams(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.href;
  } catch {
    return raw;
  }
}
/** The stored phone is exactly ten digits; a leading country code 1 is dropped, anything else is refused. */
export function bareTenDigitPhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, "").replace(/^\+?1(?=\d{10}$)/, "");
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? digits : null;
}
