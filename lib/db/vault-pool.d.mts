import type { Pool } from "@neondatabase/serverless";
export const DATABASE_MARKER: "reshoot_database_public_placeholder";
export function validateDatabaseSession(env?: Record<string, string | undefined>): string;
/** Implements the Promise-based Pool methods consumed by Drizzle. */
export function createVaultPool(base: string, validate?: () => unknown): Pool;
