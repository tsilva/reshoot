/** Promise-only Drizzle adapter for the opt-in local database relay. */
import { Pool, types } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';

export const DATABASE_MARKER = 'reshoot_database_public_placeholder';
const marker = DATABASE_MARKER;
function value(input) {
  if (input == null) return null;
  if (input instanceof Date) return input.toISOString();
  if (Buffer.isBuffer(input)) return `\\x${input.toString('hex')}`;
  if (Array.isArray(input)) return `{${input.map(v => v == null ? 'NULL' : `"${value(v).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
  if (typeof input === 'object') return JSON.stringify(input);
  if (['number', 'boolean', 'bigint', 'string'].includes(typeof input)) return String(input);
  throw new Error('Unsupported parameter');
}

export function createVaultPool(base, validate = () => validateDatabaseSession()) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Expected a reviewed loopback relay');
  validate();
  const fetchImpl = globalThis.fetch;
  const owner = randomBytes(24).toString('hex');
  const active = new Set();
  const closures = new Set();
  let ended = false;
  async function dispatch(path, body) {
    validate();
    let response;
    try {
      response = await fetchImpl(new URL(path, url), { method: 'POST', headers: {
        'Content-Type': 'application/json', 'Reshoot-Database-Connection': marker, 'X-Reshoot-Owner': owner,
      }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength;
        if(size>1048576){await reader.cancel();throw new Error();} chunks.push(value); }
      const raw = Buffer.concat(chunks).toString('utf8');
      const result = JSON.parse(raw);
      if (typeof result.ok !== 'boolean') throw new Error();
      return result;
    } catch { throw new Error('Database transport failed; operation was not retried'); }
  }
  class VaultPool extends Pool {
    constructor() { super({ connectionString: 'postgresql://placeholder@placeholder.invalid/agent_vault_local' }); }
    async connect(...args) {
      if (args.length) throw new Error('Callback database clients are not supported');
      if (ended) throw new Error('Pool is closed');
      const opened = await dispatch('/v1/db/open', {});
      if (!opened.ok || !/^[a-f0-9]{48}$/.test(opened.connection)) throw new Error('Invalid database session');
      const connection = opened.connection;
      let sequence = 0, released = false, broken = false, queue = Promise.resolve();
      const client = {
        query(config, values) {
          if (released) return Promise.reject(new Error('Database client released'));
          config = typeof config === 'string' ? { text: config } : config;
          const body = { sql: config.text, parameters: (values ?? config.values ?? []).map(value) };
          const pending = queue.then(async () => {
            if (broken) throw new Error('Database session failed; no further dispatch');
            const result = await dispatch('/v1/db/query', { connection, sequence: sequence++, ...body });
            if (!result.ok) { const e = new Error('Database query rejected; details withheld'); e.code = result.code; throw e; }
            if (!Array.isArray(result.fields) || !Array.isArray(result.rows)) throw new Error('Invalid database response');
            const fields = result.fields;
            const parsers = fields.map(f => config.types?.getTypeParser(f.dataTypeID, 'text') ?? types.getTypeParser(f.dataTypeID, 'text'));
            const rows = result.rows.map(row => {
              if (!Array.isArray(row) || row.length !== fields.length) throw new Error('Invalid database row');
              const values = row.map((v, i) => v === null ? null : parsers[i](v));
              return config.rowMode === 'array' ? values : Object.fromEntries(fields.map((f,i) => [f.name, values[i]]));
            });
            return { ...result, rows };
          });
          queue = pending.catch(error => { if (!/^[A-Z0-9]{5}$/.test(error.code ?? '')) broken = true; });
          return pending;
        },
        release() {
          if (released) return;
          released = true;
          const closing = queue.then(() => dispatch('/v1/db/close', { connection, sequence: sequence++ })).catch(() => {}).finally(() => { active.delete(client); closures.delete(closing); });
          closures.add(closing);
        },
      };
      active.add(client);
      return client;
    }
    async query(config, values) {
      if (typeof config === 'function' || typeof values === 'function') throw new Error('Callback queries are not supported');
      const client = await this.connect();
      try { return await client.query(config, values); } finally { client.release(); }
    }
    async end() {
      ended = true;
      for (const c of active) c.release();
      await Promise.all([...closures]);
    }
  }
  return new VaultPool();
}

export function validateDatabaseSession(env = process.env) {
  try {
    const proxies = ['HTTP_PROXY', 'HTTPS_PROXY'].map(k => new URL(env[k]));
    const base = new URL(env.RESHOOT_DATABASE_BASE_URL);
    if (env.RESHOOT_DATABASE_TRANSPORT !== 'agent-vault' || env.RESHOOT_DATABASE_CONNECTION !== marker
        || env.DATABASE_URL || env.DATABASE_URL_UNPOOLED || env.NODE_ENV !== 'development'
        || env.VERCEL || env.VERCEL_ENV || env.NODE_USE_ENV_PROXY !== '1'
        || env.NO_PROXY || env.no_proxy || env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
        || proxies[0].href !== proxies[1].href || proxies.some(p => p.protocol !== 'http:' || p.host !== '127.0.0.1:8283' || !p.password)
        || ['http_proxy', 'https_proxy'].some(k => env[k] && new URL(env[k]).href !== proxies[0].href)
        || base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.pathname !== '/'
        || base.username || base.password || base.search || base.hash) throw new Error();
    return base.href;
  } catch { throw new Error('Expected the reviewed local database Vault session'); }
}
