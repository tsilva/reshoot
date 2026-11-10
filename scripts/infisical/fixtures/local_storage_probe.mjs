/** Synthetic fixture IPC is consumed by the trusted test controller, never logged. */
import assert from 'node:assert/strict';
import { createVaultStorage } from '../../../lib/storage/vault-storage.mjs';
const storage = createVaultStorage();
const prefix = process.env.FIXTURE_STORAGE_PREFIX;
if (!/^users\/vault-fixture\/projects\/[a-f0-9]{32}$/.test(prefix)) throw new Error('Expected synthetic fixture namespace');
const source = `${prefix}/originals/synthetic/source`;
const browser = `${prefix}/originals/browser/source`;
try {
  if (process.env.FIXTURE_STORAGE_MODE === 'cleanup') {
    await storage.deleteObject(source); await storage.deleteObject(browser);
    console.log(JSON.stringify({ok:true,deleted:true}));
  } else {
    const body = Buffer.from('Synthetic local Reshoot storage check. No personal data.');
    const checksum = await storage.putObject({key:source,body,mimeType:'image/png'});
    assert.deepEqual(await storage.getObjectBuffer(source),body);
    assert.deepEqual(Buffer.from(await new Response(await storage.getObjectStream(source)).arrayBuffer()),body);
    assert.equal((await storage.headObject(source)).Metadata.sha256,checksum);
    const upload = await storage.signUpload({key:browser,mimeType:'image/png',checksumSha256:checksum});
    const read = await storage.signRead(browser);
    // Only the controller's private pipe receives these temporary synthetic-object capabilities.
    process.stdout.write(JSON.stringify({ok:true,checksum,upload,read})+'\n');
  }
} catch { console.log(JSON.stringify({ok:false,reason:'Synthetic local storage check failed; details withheld'})); process.exitCode=1; }
