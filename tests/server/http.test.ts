import { describe,it,expect,vi } from 'vitest';
import { z } from 'zod';
vi.mock('server-only',()=>({}));
vi.mock('../../src/lib/supabase/server',()=>({verifiedSession:vi.fn(async()=>({user:null,client:{}}))}));
import { assertWriteOrigin,readJson,route,mapDatabaseError } from '../../src/server/http';
describe('safe HTTP boundaries',()=>{
 it('requires configured write origin and rejects cross-origin requests',()=>{process.env.APP_ORIGIN='https://app.example';expect(()=>assertWriteOrigin(new Request('https://app.example/api',{method:'POST',headers:{origin:'https://evil.example'}}))).toThrow('origin');expect(()=>assertWriteOrigin(new Request('https://app.example/api',{method:'POST',headers:{origin:'https://app.example'}}))).not.toThrow();});
 it('validates body shape and bounds bytes while streaming',async()=>{const req=(body:string)=>new Request('https://app.example',{method:'POST',headers:{'content-type':'application/json'},body});await expect(readJson(req('{"author":"forged"}'),z.object({}).strict())).rejects.toThrow('fields');await expect(readJson(req(' '.repeat(1048577)),z.object({}))).rejects.toThrow('1 MiB');});
 it('returns signed-out envelope without executing operation',async()=>{const operation=vi.fn();const response=await route(operation)(new Request('https://app.example/api'));expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toContain('no-store');expect((await response.json()).error.code).toBe('signed_out');expect(operation).not.toHaveBeenCalled();});
 it('does not leak provider/database error text',()=>{const error=mapDatabaseError({message:'password=private internal database failure'});expect(error.status).toBe(503);expect(error.message).not.toContain('password');expect(mapDatabaseError({message:'stale_revision'}).status).toBe(409);});
});
