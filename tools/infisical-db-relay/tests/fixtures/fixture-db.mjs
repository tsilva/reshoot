import { pathToFileURL } from 'node:url';
const root=process.env.FIXTURE_REPO;
const { db,pool }=await import(pathToFileURL(root+'/lib/db/index.ts').href);
const { validateDatabaseSession }=await import(pathToFileURL(root+'/lib/db/vault-pool.mjs').href);
export { db,pool };
export const validate=()=>validateDatabaseSession();
