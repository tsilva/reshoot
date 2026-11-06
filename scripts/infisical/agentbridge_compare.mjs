/** The existing comparison client, under the opt-in Vault transport only. */
import { validateSession } from './agentbridge_tools_client.mjs';
validateSession();
for (const name of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CLERK_SECRET_KEY', 'NEON_REALTIME_SECRET', 'AWS_SECRET_ACCESS_KEY']) {
  if (process.env[name]) throw new Error('Application credentials are not allowed.');
}
try {
  await import('../compare-image-models.mjs');
} catch {
  console.log(JSON.stringify({ ok: false, reason: 'Comparison failed; provider details withheld.' }));
  process.exitCode = 1;
}

if (!process.exitCode) {
  const { parseArgs } = await import('node:util');
  const { readdir, readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const { values } = parseArgs({ options: { phase: { type: 'string' }, model: { type: 'string' }, 'output-dir': { type: 'string' } } });
  const records = (await readdir(values['output-dir'])).filter(name => name.startsWith(`${values.phase}-`)
    && (!values.model || name.includes(values.model.split('/')[1])) && name.endsWith('.json'));
  let succeeded = 0;
  for (const name of records) {
    const record = JSON.parse(await readFile(resolve(values['output-dir'], name), 'utf8'));
    if (record.state === 'succeeded') succeeded++;
  }
  const expected = (values.phase === 'candidate' ? 3 : 2) * (values.model ? 1 : 2);
  const ok = succeeded === expected && records.length === expected;
  console.log(JSON.stringify({ ok, recorded: records.length, succeeded, expected }));
  if (!ok) process.exitCode = 1;
}
