import 'server-only';
import { HttpError,mapDatabaseError } from './http';
import type { verifiedSession } from '../lib/supabase/server';
type Client=Awaited<ReturnType<typeof verifiedSession>>['client'];
export async function authorizeCompany(client:Client,companyId:string,userId:string,write=false,owner=false) {
  const {data,error}=await client.from('company_members').select('role').eq('company_id',companyId).eq('user_id',userId).maybeSingle();
  if(error) throw mapDatabaseError(error);
  if(!data) throw new HttpError(404,'unavailable','Resource unavailable.');
  if((write && data.role==='viewer') || (owner && data.role!=='owner')) throw new HttpError(403,'forbidden','Your role cannot perform this action.');
  return data.role as 'owner'|'editor'|'viewer';
}
