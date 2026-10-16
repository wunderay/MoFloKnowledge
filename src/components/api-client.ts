export class ApiError extends Error { constructor(message: string, public status: number, public details?: unknown) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path,{...init,cache:'no-store',headers:{'Content-Type':'application/json',...init?.headers}}); const body = await response.json(); if(!response.ok || body.error) throw new ApiError(body.error?.message ?? 'The request could not be completed.',response.status,body.error?.details); return body.data as T; }
export function write(method: string, body: unknown): RequestInit { return {method,body:JSON.stringify(body)}; }
export function companyPath(companyId:string, suffix='') { return `/api/companies/${encodeURIComponent(companyId)}${suffix}`; }
