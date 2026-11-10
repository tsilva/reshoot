/** Fixed Next entrypoint; no environment injection launcher is used. */
import { constants, copyFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
if(process.argv.slice(2).join(' ')!=='--port auto')throw new Error('Only --port auto is supported');
const require=createRequire(import.meta.url);
const owner = process.env.NEXT_DEV_OUTPUT_DIR?.match(/^[.]next-dev-([0-9]+)$/)?.[1];
if (!owner) throw new Error('Expected an owned output directory');
const config=`.tsconfig.vault-local-${owner}.json`;
copyFileSync(new URL('../../tsconfig.json',import.meta.url),new URL(`../../${config}`,import.meta.url), constants.COPYFILE_EXCL);
process.env.RESHOOT_VAULT_TSCONFIG=config;
process.on('exit',()=>{try{unlinkSync(new URL(`../../${config}`,import.meta.url));}catch{}});
const cli=require.resolve('next/dist/bin/next');
process.argv=[process.execPath,cli,'dev','--webpack','--hostname','127.0.0.1','--port','0'];
await import(pathToFileURL(cli).href);
