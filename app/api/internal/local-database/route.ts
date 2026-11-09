import { NextResponse } from "next/server";

/** Readiness only: no application rows or credentials are returned. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || process.env.VERCEL_ENV
      || process.env.RESHOOT_DATABASE_TRANSPORT !== "agent-vault"
      || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    const result = await db.transaction(tx => tx.execute(sql`select current_database() as db, current_user as role, current_setting('transaction_read_only') as read_only`), { accessMode: "read only" });
    const identity = result.rows[0] as { db: string; role: string; read_only: string };
    if (identity.db !== "reshoot_agent_vault_dev" || identity.role !== "reshoot_agent_vault_app" || identity.read_only !== "on") {
      throw new Error("Unexpected local identity");
    }
    return NextResponse.json({ ok: true, transport: "agent-vault", isolated: true, transaction_read_only: true },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "Local database readiness failed" }, { status: 503 });
  }
}
