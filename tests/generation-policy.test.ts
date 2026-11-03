import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/workflows/generation", () => ({ generationJobWorkflow: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/projects/service", () => ({ requireOwnedProject: async () => ({ primaryAssetId: "00000000-0000-4000-8000-000000000001" }) }));
vi.mock("@/lib/db", () => ({ db: { select: state.select, insert: state.insert, transaction: state.transaction } }));

import { createGenerationBatch } from "../lib/generation/batches";
import { STUDIO_VIEWS } from "../lib/client/shoot-plan";
import { POST } from "../app/api/projects/[projectId]/generation-quotes/route";

type Row = { id: string; [key: string]: unknown };
const primaryId = "00000000-0000-4000-8000-000000000001";
const quoteIds = ["quote-one", "quote-two"];
const shot = { clientId: "front", label: "Front", referenceAssetIds: [primaryId] };

// READ COMMITTED selects and transaction-held row locks reproduce confirmations
// racing from two tabs. All data is disposable; no database or provider is used.
function database() {
  const tables: Record<string, Row[]> = {
    generation_batches: [], shots: [], generation_jobs: [], generation_inputs: [],
    workflow_outbox: [], credit_holds: [], credit_ledger: [],
    generation_quotes: quoteIds.map((id) => ({ id, ownerId: "owner", projectId: "project", priceVersionId: "pricing", shots: [shot], totalCredits: 40, expiresAt: new Date(Date.now() + 900_000), usedAt: null, usedBatchId: null })),
    credit_accounts: [{ id: "account", userId: "owner", availableCredits: 1000, heldCredits: 0 }],
    price_versions: [{ id: "pricing", active: true }],
    price_bands: [{ id: "band", priceVersionId: "pricing", referenceCount: 1, creditsPerShot: 40 }],
    projects: [{ id: "project", ownerId: "owner" }],
  };
  const dialect = new PgDialect();
  const locks = new Map<string, Promise<void>>();
  function matching(name: string, condition: SQL) {
    const query = dialect.sqlToQuery(condition);
    const filters = [...query.sql.matchAll(/"\w+"\."(\w+)" = \$(\d+)/g)];
    return tables[name].filter((row) => filters.every((match) => {
      const column = match[1].replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return row[column] === query.params[Number(match[2]) - 1];
    }));
  }
  const select = (selection?: Record<string, unknown>) => ({ from: (table: Table) => {
    const name = getTableName(table);
    const query = {
      innerJoin: () => query,
      where: (condition: SQL) => {
        const read = async () => name === "assets"
          ? [{ assetId: primaryId, key: "private/reference.webp", checksum: "checksum" }]
          : selection && "value" in selection ? [{ value: 0 }]
          : matching(name, condition).map((row) => ({ ...row }));
        return { limit: read, then: (resolve: (rows: unknown[]) => void) => read().then(resolve) };
      },
    };
    return query;
  } });
  const insert = (table: Table) => ({ values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
    const rows = (Array.isArray(values) ? values : [values]).map((value) => ({ id: crypto.randomUUID(), ...value }));
    tables[getTableName(table)].push(...rows);
    return { returning: async () => rows };
  } });
  const update = (table: Table) => ({ set: (patch: Record<string, unknown>) => ({ where: async (condition: SQL) => {
    matching(getTableName(table), condition).forEach((row) => Object.assign(row, patch));
  } }) });
  state.select.mockImplementation(select);
  state.insert.mockImplementation(insert);
  state.transaction.mockImplementation(async (callback) => {
    const unlock: Array<() => void> = [];
    const execute = async (query: SQL) => {
      const parsed = dialect.sqlToQuery(query);
      const key = `${/from "(\w+)"/.exec(parsed.sql)?.[1]}:${parsed.params[0]}`;
      const previous = locks.get(key) ?? Promise.resolve();
      let release = () => {};
      locks.set(key, new Promise<void>((resolve) => { release = resolve; }));
      await previous;
      unlock.push(release);
    };
    try { return await callback({ select, insert, update, execute }); }
    finally { unlock.reverse().forEach((release) => release()); }
  });
  return tables;
}

function confirm(quoteId = quoteIds[0], idempotencyKey = "first-confirmation") {
  return createGenerationBatch({ userId: "owner", projectId: "project", quoteId, idempotencyKey });
}
function request(shots: unknown[] = [shot]) {
  return POST(new Request("https://reshoot.tsilva.eu/api/projects/project/generation-quotes", {
    method: "POST", body: JSON.stringify({ shots }),
  }), { params: Promise.resolve({ projectId: "project" }) });
}

describe("one generation per shoot", () => {
  beforeEach(() => vi.clearAllMocks());
  it("quotes and confirms all eight views in one batch and credit hold", async () => {
    const tables = database();
    const response = await request(STUDIO_VIEWS.map(({ id, ...view }) => ({
      ...view, clientId: id, presetKey: id,
    })));
    expect(response.status).toBe(201);
    const { quote } = await response.json();
    expect(quote.totalCredits).toBe(320);
    await confirm(quote.id);
    expect(tables.generation_batches).toHaveLength(1);
    expect(tables.shots.map((row) => row.azimuth)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(tables.generation_jobs).toHaveLength(8);
    expect(tables.credit_holds).toHaveLength(1);
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 680, heldCredits: 320 });
  });
  it("rejects both explicit regeneration and fresh-set quotes for an existing shoot", async () => {
    const tables = database();
    expect((await request([{ ...shot, shotId: primaryId }])).status).toBe(409);
    tables.shots.push({ id: "existing", ownerId: "owner", projectId: "project" });
    const response = await request();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "regeneration_not_allowed" } });
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects pre-existing quotes that request another version before reserving credits", async () => {
    const tables = database();
    tables.generation_quotes[0].shots = [{ ...shot, shotId: "existing" }];
    await expect(confirm()).rejects.toMatchObject({ status: 409, code: "regeneration_not_allowed" });
    expect(tables.credit_accounts[0].availableCredits).toBe(1000);
    expect(tables.generation_batches).toHaveLength(0);
  });
  it("preserves confirmation replay without creating another batch or hold", async () => {
    const tables = database();
    const first = await confirm();
    expect((await confirm()).id).toBe(first.id);
    expect(tables.generation_batches).toHaveLength(1);
    expect(tables.credit_holds).toHaveLength(1);
  });
  it("accepts only one of two concurrent confirmations using different quotes", async () => {
    const tables = database();
    const results = await Promise.allSettled([confirm(quoteIds[0], "tab-one"), confirm(quoteIds[1], "tab-two")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "regeneration_not_allowed" } });
    expect(tables.generation_batches).toHaveLength(1);
    expect(tables.credit_holds).toHaveLength(1);
    expect(tables.credit_accounts[0]).toMatchObject({ availableCredits: 960, heldCredits: 40 });
  });
});
