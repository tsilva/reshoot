import type { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/lib/db/schema";
import { createDatabasePool } from "./connection";
import { validateDatabaseSession } from "./vault-pool.mjs";

const globalForDatabase = globalThis as unknown as {
  reshootPool?: Pool;
  reshootVaultPool?: Pool;
};

const isVault = process.env.RESHOOT_DATABASE_TRANSPORT !== undefined;
if (isVault) validateDatabaseSession();
else if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
export const pool = (isVault ? globalForDatabase.reshootVaultPool : globalForDatabase.reshootPool)
  ?? createDatabasePool();

if (process.env.NODE_ENV !== "production") {
  if (isVault) globalForDatabase.reshootVaultPool = pool;
  else globalForDatabase.reshootPool = pool;
}

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
