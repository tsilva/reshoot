import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { CLERK_PLACEHOLDER, validateClerkSession } from '../../lib/auth/vault-session.mjs';
import { createVaultStorage } from '../../lib/storage/vault-storage.mjs';

let stage = 'session';
try {
  const clerk = process.env.RESHOOT_CLERK_TRANSPORT !== undefined;
  if (clerk) {
    validateClerkSession();
    stage = 'clerk-api';
    const require = createRequire(import.meta.url);
    const { createClerkClient } = createRequire(require.resolve('@clerk/nextjs/server'))('@clerk/backend');
    const client = createClerkClient({ secretKey: CLERK_PLACEHOLDER, publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, apiUrl: process.env.CLERK_API_URL });
    const keys = await client.jwks.getJwks();
    stage = 'clerk-instance-binding';
    if (!keys.keys?.some(key => key.kty === 'RSA' && createHash('sha256').update(`${key.n}:${key.e}`).digest('hex') === process.env.RESHOOT_CLERK_JWKS_SHA256)) throw new Error();
  }
  stage = 'storage';
  const storage = await createVaultStorage().check();
  if (!storage.ok || !storage.isolated) throw new Error();
  console.log(JSON.stringify({ ok: true, read_only: true, clerk_configured: clerk, clerk_backend_authenticated: clerk, isolated_storage: true,
    credential_mode: 'public-placeholder', user_sign_in_tested: false }));
} catch (error) {
  const code = error.errors?.[0]?.code;
  console.log(JSON.stringify({ ok: false, stage, reason: 'Local sign-in/storage check failed; details withheld',
    code: ['relay_upstream','relay_denied','relay_internal'].includes(code) ? code : 'unavailable',
    upstream_http_status: Number.isInteger(error.errors?.[0]?.meta?.status) ? error.errors[0].meta.status : null }));
  process.exitCode = 1;
}
