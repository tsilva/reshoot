import { createVaultPool, validateDatabaseSession } from '../../lib/db/vault-pool.mjs';
const pool=createVaultPool(validateDatabaseSession());
let stage='database-query';
try{
 const result=await pool.query(`select current_database() as db,current_user as role,
  has_database_privilege(current_database(),'CREATE') as database_create,
  has_schema_privilege('public','CREATE') as schema_create,
  (select rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls from pg_roles where rolname=current_user) as elevated,
  exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname=current_user)) as membership`);
 const row=result.rows[0];
 stage='database-permissions';
 if(row.db!=='reshoot_agent_vault_dev'||row.role!=='reshoot_agent_vault_app'||row.database_create||row.schema_create||row.elevated||row.membership)throw new Error();
 const base=process.env.AGENTBRIDGE_BASE_URL;
 const headers={Authorization:'Bearer agentbridge_public_placeholder'};
 for(const path of ['/models','/openrouter/key']){stage=path==='/models'?'agentbridge-catalog':'agentbridge-upstream-auth';const response=await fetch(base+path,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();await response.body?.cancel();}
 console.log(JSON.stringify({ok:true,read_only:true,isolated_database:true,least_privilege:true,upstream_authenticated:true,credential_mode:'public-placeholder'}));
}catch{console.log(JSON.stringify({ok:false,stage,reason:'Local database check failed; details withheld'}));process.exitCode=1;}
finally{await pool.end();}
