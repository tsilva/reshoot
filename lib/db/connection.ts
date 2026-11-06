import { Pool } from "@neondatabase/serverless";
import { createVaultPool, validateDatabaseSession } from "./vault-pool.mjs";

export function createDatabasePool(env: Record<string, string | undefined> = process.env): Pool {
  if (env.RESHOOT_DATABASE_TRANSPORT !== undefined) {
    const base = validateDatabaseSession(env);
    return createVaultPool(base, () => validateDatabaseSession(env));
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  return new Pool({ connectionString: env.DATABASE_URL });
}
