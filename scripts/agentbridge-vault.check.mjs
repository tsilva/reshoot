// Explicit Node runner; the .check name avoids Vitest suite discovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSession } from './infisical/agentbridge_client.mjs';

const proxy = 'http://fixture-session:fixture-password@127.0.0.1:8283';
const session = {
  NODE_ENV: 'development', NODE_USE_ENV_PROXY: '1',
  AGENTBRIDGE_BASE_URL: 'http://127.0.0.1:8082/api/v1',
  AGENTBRIDGE_API_KEY: 'agentbridge_public_placeholder',
  HTTP_PROXY: proxy, HTTPS_PROXY: proxy, NO_PROXY: '', no_proxy: '',
};

test('catalog client requires only a public placeholder in a development proxy session', () => {
  assert.equal(validateSession(session), session.AGENTBRIDGE_BASE_URL);
});

test('catalog client rejects source keys, Sentry credentials and hosted environments', () => {
  for (const change of [
    { AGENTBRIDGE_API_KEY: '' }, { AGENTBRIDGE_API_KEY: 'raw-fixture-key' },
    { OPENROUTER_API_KEY: 'upstream-fixture-key' }, { SENTRY_AUTH_TOKEN: 'sentry-fixture-key' },
    { NODE_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { NODE_USE_ENV_PROXY: '0' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  ]) assert.throws(() => validateSession({ ...session, ...change }));
});

test('catalog client rejects bypasses, missing proxy authentication and conflicting sessions', () => {
  for (const change of [
    { NO_PROXY: '*' }, { no_proxy: '127.0.0.1' }, { HTTP_PROXY: '' },
    { HTTP_PROXY: 'http://127.0.0.1:8283' },
    { HTTP_PROXY: 'http://fixture:fixture@unreviewed.invalid:8283' },
    { HTTPS_PROXY: 'http://other:other@127.0.0.1:8283' },
    { http_proxy: 'http://other:other@127.0.0.1:8283' },
    { https_proxy: 'http://other:other@127.0.0.1:8283' },
  ]) assert.throws(() => validateSession({ ...session, ...change }));
});

test('catalog client rejects unreviewed gateway origins and URL modifications', () => {
  for (const base of [
    'https://openrouter.ai/api/v1', 'http://remote.invalid/api/v1',
    'http://user:password@127.0.0.1:8082/api/v1',
    'http://127.0.0.1:8082/dashboard', 'http://127.0.0.1:8082/api/v1?override=yes',
    'http://127.0.0.1:8082/api/v1#override',
  ]) assert.throws(() => validateSession({ ...session, AGENTBRIDGE_BASE_URL: base }));
});
