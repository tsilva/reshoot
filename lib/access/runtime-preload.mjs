import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { validateClerkSession, clerkRequestAllowed } from '../../lib/auth/vault-session.mjs';
import { validateStorageSession } from '../../lib/storage/vault-storage.mjs';
/** Inherited by the opt-in Next workers; no service credentials enter this process. */
const marker = 'agentbridge_public_placeholder';
const dbMarker = 'reshoot_database_public_placeholder';
function session() {
  try {
    if (process.env.RESHOOT_CLERK_TRANSPORT !== undefined) validateClerkSession();
    if (process.env.RESHOOT_STORAGE_TRANSPORT !== undefined) validateStorageSession();
    const p = ['HTTP_PROXY','HTTPS_PROXY'].map(k=>new URL(process.env[k]));
    const d = new URL(process.env.RESHOOT_DATABASE_BASE_URL);
    if (process.env.RESHOOT_DATABASE_TRANSPORT !== 'agent-vault' || process.env.RESHOOT_DATABASE_CONNECTION !== dbMarker
        || process.env.AGENTBRIDGE_API_KEY !== marker || process.env.AGENTBRIDGE_BASE_URL !== 'http://127.0.0.1:8082/api/v1'
        || process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED
        || (process.env.CLERK_SECRET_KEY && process.env.RESHOOT_CLERK_TRANSPORT !== 'agent-vault')
        || process.env.R2_SECRET_ACCESS_KEY || process.env.STRIPE_TEST_SECRET_KEY || process.env.SENTRY_AUTH_TOKEN
        || process.env.NODE_ENV !== 'development' || process.env.VERCEL || process.env.VERCEL_ENV
        || process.env.NO_PROXY || process.env.no_proxy || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
        || process.env.NODE_USE_ENV_PROXY !== '1' || p[0].href !== p[1].href
        || p.some(x=>x.protocol!=='http:'||x.host!=='127.0.0.1:8283'||!x.password)
        || ['http_proxy','https_proxy'].some(k=>process.env[k]&&new URL(process.env[k]).href!==p[0].href)
        || d.protocol!=='http:'||d.hostname!=='127.0.0.1'||!d.port||d.pathname!=='/'||d.search||d.hash||d.username||d.password) throw new Error();
    return d;
  } catch { throw new Error('Expected the reviewed local application Vault session'); }
}
const database = session();
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  session();
  const target = new URL(typeof input==='string'||input instanceof URL ? input : input.url);
  const method = (init?.method ?? input.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? input.headers);
  const db = target.origin === database.origin && method==='POST'
    && ['/v1/db/open','/v1/db/query','/v1/db/close'].includes(target.pathname)
    && headers.get('Reshoot-Database-Connection')===dbMarker;
  const ai = target.origin==='http://127.0.0.1:8082' && headers.get('Authorization')===`Bearer ${marker}`
    && ((method==='GET'&&['/api/v1/models','/api/v1/openrouter/key'].includes(target.pathname))
      ||(method==='POST'&&['/api/v1/chat/completions','/api/v1/images'].includes(target.pathname)));
  const clerk = process.env.RESHOOT_CLERK_TRANSPORT === 'agent-vault' && clerkRequestAllowed(target, method, headers);
  const storage = process.env.RESHOOT_STORAGE_TRANSPORT === 'agent-vault'
    && target.origin === new URL(process.env.RESHOOT_STORAGE_BASE_URL).origin && method === 'POST'
    && headers.get('Reshoot-Storage-Token') === 'reshoot_storage_public_placeholder'
    && /^\/v1\/storage\/(check|sign-upload|sign-read|head|get|put|delete)$/.test(target.pathname);
  if ((!db&&!ai&&!clerk&&!storage)||(!clerk&&target.search)||target.hash||target.username||target.password||headers.has('cookie')||headers.has('x-api-key')) throw new Error('Request is outside the reviewed local services');
  if (ai&&target.pathname.endsWith('/openrouter/key')) target.hostname='localhost';
  try {
    const forwarded = input instanceof Request ? new Request(target, input) : target;
    const response=await original(forwarded,{...init,method,headers,redirect:'error'});
    if(!response.ok){
      if(clerk){
        const value = await response.json().catch(()=>null);
        const error = value?.errors?.[0];
        if(['relay_upstream','relay_denied','relay_internal'].includes(error?.code)) {
          const status = error.meta?.status;
          return Response.json({errors:[{code:error.code,message:'Clerk service failed; details withheld',
            meta:Number.isInteger(status)&&status>=400&&status<=599?{status}:{}}]}, {status:response.status});
        }
      } else await response.body?.cancel();
      return Response.json({ok:false,reason:'Service request failed; details withheld'},{status:response.status});
    }
    return response;
  }catch{throw new Error('Service connection failed; details withheld');}
};

// Keep Next's generated type declarations in this launch's isolated output.
const root = fileURLToPath(new URL('../../', import.meta.url));
const nextEnv = resolve(root, 'next-env.d.ts');
const generated = resolve(root, process.env.NEXT_DEV_OUTPUT_DIR, 'next-env.vault.d.ts');
const writeFile = fsPromises.writeFile.bind(fsPromises);
fsPromises.writeFile = async (file, ...args) => {
  const name = file instanceof URL ? fileURLToPath(file) : String(file);
  if (resolve(name) === nextEnv) {
    await fsPromises.mkdir(resolve(root, process.env.NEXT_DEV_OUTPUT_DIR), { recursive: true });
    return writeFile(generated, ...args);
  }
  return writeFile(file, ...args);
};
fs.promises.writeFile = fsPromises.writeFile;
syncBuiltinESMExports();
