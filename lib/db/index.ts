import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const globalForDatabase = globalThis as unknown as {
  reshootPool?: Pool;
};

export const pool =
  globalForDatabase.reshootPool ?? new Pool({ connectionString: databaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.reshootPool = pool;
}

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
