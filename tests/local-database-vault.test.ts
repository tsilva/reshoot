import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabasePool } from "../lib/db/connection";
import { validateDatabaseSession } from "../lib/db/vault-pool.mjs";

const env = { RESHOOT_DATABASE_TRANSPORT: "agent-vault", RESHOOT_DATABASE_CONNECTION: "reshoot_database_public_placeholder",
  RESHOOT_DATABASE_BASE_URL: "http://127.0.0.1:17643/", NODE_ENV: "development", NODE_USE_ENV_PROXY: "1",
  HTTP_PROXY: "http://fake:session@127.0.0.1:8283", HTTPS_PROXY: "http://fake:session@127.0.0.1:8283" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("explicit local database transport", () => {
  it("preserves the existing default and hosted database connection", async () => {
    const pool=createDatabasePool({ DATABASE_URL:"postgresql://synthetic:fake@127.0.0.1:1/synthetic", NODE_ENV:"production" });
    expect(pool.options.connectionString).toBe("postgresql://synthetic:fake@127.0.0.1:1/synthetic"); await pool.end();
    expect(()=>createDatabasePool({})).toThrow("DATABASE_URL is not configured");
  });
  it("preserves the missing-configuration failure even with a cached connection", async () => {
    const cached = createDatabasePool({ DATABASE_URL: "postgresql://synthetic:fake@127.0.0.1:1/synthetic" });
    vi.resetModules();
    vi.stubGlobal("reshootPool", cached);
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("RESHOOT_DATABASE_TRANSPORT", undefined);
    try { await expect(import("../lib/db/index")).rejects.toThrow("DATABASE_URL is not configured"); }
    finally { await cached.end(); }
  });
  it("accepts only a scoped, placeholder-only Development session", async () => {
    expect(validateDatabaseSession(env)).toBe(env.RESHOOT_DATABASE_BASE_URL);
    const pool=createDatabasePool(env); expect(pool.options.connectionString).toContain("placeholder.invalid"); await pool.end();
  });
  it.each([
    {NODE_ENV:"production"}, {VERCEL_ENV:"preview"}, {VERCEL:"1"}, {DATABASE_URL:"synthetic-private"},
    {DATABASE_URL_UNPOOLED:"synthetic-private"}, {RESHOOT_DATABASE_TRANSPORT:"other"},
    {RESHOOT_DATABASE_TRANSPORT:""}, {RESHOOT_DATABASE_CONNECTION:"synthetic-private"},
    {RESHOOT_DATABASE_BASE_URL:"https://example.com/"}, {NO_PROXY:"*"},
    {NODE_TLS_REJECT_UNAUTHORIZED:"0"}, {HTTP_PROXY:"http://127.0.0.1:8283"},
    {HTTPS_PROXY:"http://fake:other@127.0.0.1:8283"},
  ])("rejects hosted runs, raw credentials, bypasses and unknown transports", change=>{
    expect(()=>createDatabasePool({...env,...change})).toThrow();
  });
  it("keeps readiness disabled with the normal defaults and on hosted runs", async()=>{
    const { GET }=await import("../app/api/internal/local-database/route");
    vi.stubEnv("NODE_ENV","production"); vi.stubEnv("RESHOOT_DATABASE_TRANSPORT","agent-vault");
    expect((await GET(new Request("http://localhost/api/internal/local-database"))).status).toBe(404);
    vi.stubEnv("NODE_ENV","development"); vi.stubEnv("RESHOOT_DATABASE_TRANSPORT","");
    expect((await GET(new Request("http://localhost/api/internal/local-database"))).status).toBe(404);
  });
});
