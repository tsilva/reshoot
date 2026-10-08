import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireProject: vi.fn(),
  sign: vi.fn(),
  condition: null as SQL | null,
  rows: [] as Array<{ label: string; output: { id: string; version: number; mimeType: string; r2Key: string } }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/projects/service", () => ({ requireOwnedProject: state.requireProject }));
vi.mock("@/lib/storage/r2", () => ({ signDownload: state.sign }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ innerJoin: () => ({ where: (condition: SQL) => {
    state.condition = condition;
    return { limit: async () => state.rows };
  } }) }) }),
} }));

import { ApiError } from "../lib/api/errors";
import { GET } from "../app/api/projects/[projectId]/outputs/[outputId]/download/route";

const request = new Request("https://reshoot.tsilva.eu/api/projects/project/outputs/output/download");
const context = { params: Promise.resolve({ projectId: "project", outputId: "output" }) };

describe("private output downloads", () => {
  beforeEach(() => {
    state.requireProject.mockReset();
    state.sign.mockReset();
    state.condition = null;
    state.rows = [{ label: "Front", output: { id: "output", version: 1, mimeType: "image/jpeg", r2Key: "private/original" } }];
  });

  it("signs a fresh download on each request with the correct filename and no cached redirect", async () => {
    state.sign.mockResolvedValueOnce("https://storage.example/fresh-1").mockResolvedValueOnce("https://storage.example/fresh-2");
    const first = await GET(request, context);
    const second = await GET(request, context);
    expect([first.status, second.status]).toEqual([302, 302]);
    expect(first.headers.get("location")).toBe("https://storage.example/fresh-1");
    expect(second.headers.get("location")).toBe("https://storage.example/fresh-2");
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(state.sign).toHaveBeenCalledWith("private/original", "front-v1-output.jpg");
    expect(state.requireProject).toHaveBeenCalledWith("owner", "project");
    expect(new PgDialect().sqlToQuery(state.condition!).params).toEqual(["output", "project", "owner", "owner"]);
  });

  it("does not sign storage when the project belongs to another workspace", async () => {
    state.requireProject.mockRejectedValue(new ApiError(404, "project_not_found", "Project not found."));
    expect((await GET(request, context)).status).toBe(404);
    expect(state.condition).toBeNull();
    expect(state.sign).not.toHaveBeenCalled();
  });

  it("does not sign a missing output even when the project is owned", async () => {
    state.rows = [];
    expect((await GET(request, context)).status).toBe(404);
    expect(state.sign).not.toHaveBeenCalled();
  });
});
