import { pathToFileURL } from 'node:url';

const marker = 'agentbridge_public_placeholder';

/** @param {Record<string, string | undefined>} [env] */
export function validateSession(env = process.env) {
  if (env.AGENTBRIDGE_API_KEY !== marker || env.OPENROUTER_API_KEY || env.SENTRY_AUTH_TOKEN
      || env.NODE_ENV !== 'development' || env.VERCEL_ENV || env.NODE_USE_ENV_PROXY !== '1'
      || env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || (env.NO_PROXY || '').trim() || (env.no_proxy || '').trim()) {
    throw new Error('Unexpected placeholder or client environment.');
  }
  const base = new URL(env.AGENTBRIDGE_BASE_URL);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port
      || base.pathname !== '/api/v1' || base.username || base.password || base.search || base.hash) {
    throw new Error('Expected the reviewed loopback endpoint.');
  }
  const proxies = ['HTTP_PROXY', 'HTTPS_PROXY'].map(key => new URL(env[key]));
  for (const proxy of proxies) {
    if (proxy.protocol !== 'http:' || proxy.host !== '127.0.0.1:8283' || !proxy.password) {
      throw new Error('Expected the reviewed Agent Vault session.');
    }
  }
  if (proxies[0].href !== proxies[1].href) throw new Error('Conflicting proxy sessions.');
  for (const key of ['http_proxy', 'https_proxy']) {
    if (env[key] && new URL(env[key]).href !== proxies[0].href) throw new Error('Conflicting proxy settings.');
  }
  return base.href;
}

async function readModels(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new Error('Model response exceeds the allowed size.');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  if (process.argv.length !== 2 || !process.versions.node.startsWith('24.')
      || !process.execArgv.includes('--use-env-proxy')) throw new Error('Expected the reviewed Node 24 startup.');
  const base = validateSession();
  const adapter = await import(pathToFileURL(process.env.AGENTBRIDGE_APP_CONFIG).href);
  const appBase = adapter.providerBaseUrl?.(process.env) ?? adapter.agentBridgeBaseUrl(process.env);
  const appKey = adapter.providerApiKey?.(process.env) ?? process.env.AGENTBRIDGE_API_KEY;
  const appModel = adapter.agentBridgeModel(process.env.AGENTBRIDGE_DEFAULT_MODEL);
  if (appBase !== base || appKey !== marker || typeof appModel !== 'string') throw new Error('Unexpected application routing.');
  const response = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${appKey}` },
    redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    await response.body?.cancel();
    console.log(JSON.stringify({ ok: false, status: response.status, reason: 'Gateway model check failed; provider details withheld.' }));
    process.exitCode = 1;
    return;
  }
  const body = await readModels(response);
  if (!Array.isArray(body.data) || !body.data.length || !body.data.every(model => typeof model.id === 'string')) {
    throw new Error('Unexpected model catalog.');
  }
  console.log(JSON.stringify({ ok: true, read_only: true, credential_mode: 'public-placeholder',
    model_count: body.data.length, configured_default_listed: body.data.some(model => model.id === appModel) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.log(JSON.stringify({ ok: false, reason: 'AgentBridge check failed; diagnostic details withheld.' }));
    process.exitCode = 1;
  });
}
