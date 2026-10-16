import 'server-only';
export function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return { url, key };
}
export function appOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error('APP_ORIGIN_NOT_CONFIGURED');
  return new URL(value).origin;
}
