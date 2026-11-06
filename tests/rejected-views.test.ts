import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ user: vi.fn(), owned: vi.fn(), sign: vi.fn(), select: vi.fn(),
  condition: undefined as SQL | undefined, limit: 0,
  rows: [] as Array<{ id: string; label: string; privateError: string; previewKey: string }> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: state.user }));
vi.mock("@/lib/projects/service", () => ({ requireOwnedProject: state.owned }));
vi.mock("@/lib/storage/r2", () => ({ signRead: state.sign }));
vi.mock("@/lib/db", () => ({ db: { select: state.select } }));
import { ApiError } from "../lib/api/errors";
import { GET } from "../app/api/projects/[projectId]/rejected-views/route";
import { parseRejectedRotation } from "../lib/generation/rotation-diagnostics";

const projectId = "5392ef6c-5eb7-4825-a44d-3eb4514ce359";
const detail = { kind: "rotation-review-v1", failure: "The photograph shows the wrong physical side or front/rear surfaces.",
  previewAvailable: true, target: { azimuth: 90, elevation: 0, front: false, rear: false, side: "right" },
  observed: { confident: true, same_product: true, rigid_pose: true, front_visible: true, rear_visible: false,
    physical_side: "right", side_image_edge: "right", same_view_as: null, evidence: "A broad front face is exposed." } };
const request = () => new Request(`https://reshoot.test/api/projects/${projectId}/rejected-views`);
const context = () => ({ params: Promise.resolve({ projectId }) });

describe("private rejected-view evidence", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.condition = undefined; state.limit = 0;
    state.user.mockResolvedValue({ id: "owner" }); state.owned.mockResolvedValue({ id: projectId });
    state.sign.mockResolvedValue("synthetic-signed-preview");
    state.rows = [{ id: "attempt", label: "Right profile", privateError: JSON.stringify(detail), previewKey: "private-preview" }];
    state.select.mockImplementation(() => {
      const query = { from: () => query, innerJoin: () => query,
        where: (condition: SQL) => { state.condition = condition; return query; }, orderBy: () => query,
        limit: async (limit: number) => { state.limit = limit; return state.rows; } };
      return query;
    });
  });

  it.each(["anonymous", "foreign-project", "deleted-project"])("does not read or sign evidence for %s", async (kind) => {
    if (kind === "anonymous") state.user.mockRejectedValue(new ApiError(401, "sign_in_required", "Sign in."));
    else state.owned.mockRejectedValue(new ApiError(404, "project_not_found", "Project not found."));
    const response = await GET(request(), context());
    expect(response.status).toBe(kind === "anonymous" ? 401 : 404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.select).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled();
  });

  it("bounds and scopes every query to this owner/project and signs only rejected previews", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ views: [{ attemptId: "attempt", label: "Right profile", review: detail, previewUrl: "synthetic-signed-preview" }] });
    expect(state.owned).toHaveBeenCalledWith("owner", projectId);
    expect(state.sign).toHaveBeenCalledWith("private-preview", 300); expect(state.limit).toBe(32);
    const sql = new PgDialect().sqlToQuery(state.condition!);
    expect(sql.params).toEqual([projectId, "owner", "owner", "owner", "failed", "failed", "invalid_rotation_output"]);
  });

  it("does not expose historical errors or claim an unavailable preview exists", async () => {
    state.rows.push({ id: "legacy", label: "Old", privateError: "private historical error", previewKey: "not-signed" });
    state.rows[0].privateError = JSON.stringify({ ...detail, previewAvailable: false });
    const response = await GET(request(), context());
    const body = await response.json();
    expect(body.views).toHaveLength(1); expect(body.views[0].previewUrl).toBeNull();
    expect(state.sign).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("historical error");
  });

  it("validates project IDs before querying and rejects unbounded or extra diagnostic fields", async () => {
    expect((await GET(request(), { params: Promise.resolve({ projectId: "invalid" }) })).status).toBe(400);
    expect(state.select).not.toHaveBeenCalled();
    expect(parseRejectedRotation(JSON.stringify({ ...detail, secret: "synthetic" }))).toBeUndefined();
    expect(parseRejectedRotation(JSON.stringify({ ...detail, observed: { ...detail.observed, evidence: "x".repeat(1201) } }))).toBeUndefined();
  });
});
