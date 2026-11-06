export const CLERK_PLACEHOLDER = 'sk_test_reshoot_vault_public_placeholder';

export function validateClerkSession(env = process.env) {
  try {
    const key = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const host = key?.startsWith('pk_test_') ? Buffer.from(key.slice(8), 'base64').toString('utf8') : '';
    const proxies = ['HTTP_PROXY', 'HTTPS_PROXY'].map(k => new URL(env[k]));
    if (env.RESHOOT_CLERK_TRANSPORT !== 'agent-vault' || env.CLERK_SECRET_KEY !== CLERK_PLACEHOLDER
      || !/^[a-z0-9-]+\.clerk\.accounts\.dev\$$/.test(host)
      || env.NODE_ENV !== 'development' || env.VERCEL || env.VERCEL_ENV || env.NODE_USE_ENV_PROXY !== '1'
      || env.NO_PROXY || env.no_proxy || env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      || env.CLERK_JWT_KEY || env.CLERK_PROXY_URL || env.NEXT_PUBLIC_CLERK_PROXY_URL
      || (env.CLERK_API_URL && env.CLERK_API_URL !== 'https://api.clerk.com')
      || proxies[0].href !== proxies[1].href
      || proxies.some(p => p.protocol !== 'http:' || p.host !== '127.0.0.1:8283' || !p.password)
      || ['http_proxy', 'https_proxy'].some(k => env[k] && new URL(env[k]).href !== proxies[0].href)) throw new Error();
    return true;
  } catch { throw new Error('Expected the reviewed Development Clerk Vault session'); }
}

export function clerkRequestAllowed(url, method, headers) {
  if (url.origin !== 'https://api.clerk.com' || method !== 'GET'
    || headers.get('Authorization') !== `Bearer ${CLERK_PLACEHOLDER}`) return false;
  if (url.pathname === '/v1/clients/handshake_payload') {
    return [...url.searchParams.keys()].join() === 'nonce' && /^[A-Za-z0-9_.-]{1,2048}$/.test(url.searchParams.get('nonce'));
  }
  return !url.search && (url.pathname === '/v1/jwks' || /^\/v1\/users\/user_[A-Za-z0-9]+$/.test(url.pathname));
}
