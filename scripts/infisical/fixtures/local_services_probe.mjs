import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateClerkSession, CLERK_PLACEHOLDER } from '../../../lib/auth/vault-session.mjs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next('data:text/javascript,export{}', context);
  if (specifier.startsWith('.') && context.parentURL?.endsWith('/r2.ts')) {
    const value = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(value))) return next(value.href, context);
  }
  return next(specifier, context);
} });

let stage = 'session';
try {
  validateClerkSession();
  stage = 'sdk-import';
  const require = createRequire(import.meta.url);
  const { createClerkClient, verifyToken } = createRequire(require.resolve('@clerk/nextjs/server'))('@clerk/backend');
  stage = 'sdk-create';
  const options = { secretKey: CLERK_PLACEHOLDER, apiUrl: process.env.FIXTURE_CLERK_BASE,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY };
  const client = createClerkClient(options);
  stage = 'verify-token';
  const payload = await verifyToken(process.env.FIXTURE_SESSION, options);
  assert.equal(payload.sub, 'user_fixture');
  stage = 'authenticate-request';
  const state = await client.authenticateRequest(new Request('http://127.0.0.1:3000/', {
    headers: { Authorization: `Bearer ${process.env.FIXTURE_SESSION}` } }), { acceptsToken: 'session_token' });
  assert.equal(state.toAuth().userId, 'user_fixture');
  stage = 'current-user';
  const user = await client.users.getUser('user_fixture');
  assert.equal(user.id, 'user_fixture');
  assert.equal(user.emailAddresses[0].emailAddress, 'fixture@example.invalid');
  assert.deepEqual(user.emailAddresses[0].linkedTo, []);
  assert.deepEqual(user.privateMetadata, {});
  stage = 'handshake';
  const handshake = await client.clients.getHandshakePayload({ nonce: 'fixture-nonce' });
  assert.deepEqual(handshake.directives, []);
  stage = 'tampered-session';
  const pieces = process.env.FIXTURE_SESSION.split('.');
  pieces[1] = Buffer.from(JSON.stringify({ sub: 'user_other', exp: Date.now() / 1000 + 900 })).toString('base64url');
  await assert.rejects(verifyToken(pieces.join('.'), options));
  stage = 'denied-write';
  const denied = await fetch(`${options.apiUrl}/v1/users`, { method: 'POST', body: '{}',
    headers: { Authorization: `Bearer ${CLERK_PLACEHOLDER}` } });
  assert.equal(denied.status, 403); await denied.body?.cancel();
  const oauth = await fetch(`${options.apiUrl}/v1/users/user_fixture/oauth_access_tokens/google`, {
    headers: { Authorization: `Bearer ${CLERK_PLACEHOLDER}` } });
  assert.equal(oauth.status, 403); await oauth.body?.cancel();
  stage = 'storage';
  const storage = await import('../../../lib/storage/r2.ts');
  const body = Buffer.from('Synthetic local storage fixture.');
  const key = 'users/fixture/projects/project/originals/asset/source';
  const checksum = await storage.putObject({ key, body, mimeType: 'image/png' });
  assert.equal((await storage.headObject(key)).Metadata.sha256, checksum);
  assert.deepEqual(await storage.getObjectBuffer(key), body);
  assert.deepEqual(Buffer.from(await new Response(await storage.getObjectStream(key)).arrayBuffer()), body);
  const upload = await storage.signUpload({ key, mimeType: 'image/png', checksumSha256: checksum });
  const read = await storage.signRead(key);
  assert.ok(upload.url.startsWith(process.env.RESHOOT_STORAGE_BASE_URL + 'objects/'));
  assert.ok(read.startsWith(process.env.RESHOOT_STORAGE_BASE_URL + 'objects/'));
  await storage.deleteObject(key);
  await assert.rejects(storage.headObject(key), error => error.$metadata?.httpStatusCode === 404);
  stage = 'sandbox';
  // The sandbox must prevent direct upstream/relay access even without fetch guards.
  const net = await import('node:net');
  const direct = await new Promise(resolve => {
    const socket = net.connect(Number(new URL(process.env.RESHOOT_STORAGE_BASE_URL).port), '127.0.0.1');
    socket.on('error', () => resolve(true)); socket.on('connect', () => { socket.destroy(); resolve(false); });
  });
  assert.equal(direct, true);
  assert.throws(()=>readFileSync(process.env.FIXTURE_PRIVATE_CANARY), error=>error.code==='EPERM'||error.code==='EACCES');
  console.log(JSON.stringify({ ok: true, checks: ['clerk_jwks_via_vault', 'valid_session_verified', 'sdk_authenticate_request',
    'sdk_current_user', 'sdk_handshake', 'tampered_session_rejected', 'proxy_denied_clerk_write', 'relay_denied_oauth_tokens', 'private_metadata_filtered', 'actual_r2_adapter_vault_roundtrip',
    'head_checksum', 'binary_stream', 'browser_urls_minted', 'delete_missing_404', 'sandbox_direct_network_denied', 'sandbox_private_files_denied'],
    credential_mode: 'public-placeholder' }));
} catch { console.log(JSON.stringify({ ok: false, stage, reason: 'Synthetic service probe failed; details withheld' })); process.exitCode = 1; }
