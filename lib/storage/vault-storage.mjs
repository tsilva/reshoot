import { createHash } from 'node:crypto';

export const STORAGE_PLACEHOLDER = 'reshoot_storage_public_placeholder';

export function validateStorageSession(env = process.env) {
  try {
    const base = new URL(env.RESHOOT_STORAGE_BASE_URL);
    const proxy = ['HTTP_PROXY', 'HTTPS_PROXY'].map(k => new URL(env[k]));
    if (env.RESHOOT_STORAGE_TRANSPORT !== 'agent-vault' || env.RESHOOT_STORAGE_TOKEN !== STORAGE_PLACEHOLDER
      || env.NODE_ENV !== 'development' || env.VERCEL || env.VERCEL_ENV || env.NODE_USE_ENV_PROXY !== '1'
      || env.R2_ACCESS_KEY_ID || env.R2_SECRET_ACCESS_KEY || env.AWS_ACCESS_KEY_ID || env.AWS_SECRET_ACCESS_KEY
      || env.NO_PROXY || env.no_proxy || env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      || proxy[0].href !== proxy[1].href || proxy.some(p => p.protocol !== 'http:' || p.host !== '127.0.0.1:8283' || !p.password)
      || ['http_proxy', 'https_proxy'].some(k => env[k] && new URL(env[k]).href !== proxy[0].href)
      || base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.pathname !== '/'
      || base.username || base.password || base.search || base.hash) throw new Error();
    return base.href;
  } catch { throw new Error('Expected the reviewed local storage Vault session'); }
}

export function createVaultStorage(env = process.env) {
  const base = validateStorageSession(env);
  async function call(operation, data, body) {
    if (validateStorageSession(env) !== base) throw new Error('Storage binding changed');
    const headers = { 'Reshoot-Storage-Token': STORAGE_PLACEHOLDER };
    if (body !== undefined) headers['Reshoot-Storage-Metadata'] = JSON.stringify(data);
    else headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(new URL(`v1/storage/${operation}`, base), { method: 'POST', headers,
        body: body === undefined ? JSON.stringify(data) : body, redirect: 'error', signal: AbortSignal.timeout(30000) });
    } catch { throw new Error('Storage connection failed; details withheld'); }
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error('Storage request failed; details withheld');
      error.$metadata = { httpStatusCode: response.status };
      throw error;
    }
    return response;
  }
  function capability(value) {
    const url = new URL(value);
    if (url.origin !== new URL(base).origin || !/^\/objects\/[A-Za-z0-9_-]{43}$/.test(url.pathname)
      || url.search || url.hash || url.username || url.password) throw new Error('Invalid local storage capability');
    return url.href;
  }
  return {
    async check() { return (await call('check', {})).json(); },
    async signUpload(input) {
      const value = await (await call('sign-upload', { ...input, expiresIn: input.expiresIn ?? 600 })).json();
      if (value.headers?.['Content-Type'] !== input.mimeType) throw new Error('Invalid upload headers');
      return { url: capability(value.url), headers: { 'Content-Type': input.mimeType } };
    },
    async signRead(key, expiresIn = 600) { return capability((await (await call('sign-read', { key, expiresIn })).json()).url); },
    async headObject(key) { return (await call('head', { key })).json(); },
    async getObjectBuffer(key) { return Buffer.from(await (await call('get', { key })).arrayBuffer()); },
    async getObjectStream(key) {
      const body = (await call('get', { key })).body;
      if (!body) throw new Error('Stored object has no body');
      return body;
    },
    async putObject(input) {
      const checksum = input.checksumSha256 ?? createHash('sha256').update(input.body).digest('hex');
      await (await call('put', { key: input.key, mimeType: input.mimeType, checksumSha256: checksum }, input.body)).body?.cancel();
      return checksum;
    },
    async deleteObject(key) { await (await call('delete', { key })).body?.cancel(); },
  };
}
