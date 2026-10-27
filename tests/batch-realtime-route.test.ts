import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: vi.fn(), seal: vi.fn(), resume: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: state.user }));
vi.mock("@/lib/generation/realtime", () => ({ sealBatchRealtime: state.seal }));
vi.mock("@/lib/generation/resume", () => ({ resumeGenerationBatch: state.resume }));
import { GET } from "../app/api/generation-batches/[batchId]/realtime/route";
import { POST } from "../app/api/generation-batches/[batchId]/resume/route";
import { ApiError } from "../lib/api/errors";

const batchId = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ batchId }) };
const url = `https://reshoot.tsilva.eu/api/generation-batches/${batchId}`;
describe("private generation subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user.mockResolvedValue({ id: "cookie-owner" });
    state.seal.mockResolvedValue({ url: "wss://neon.invalid", query: { capability: "sealed" } });
  });
  it("uses the cookie identity and never caches capabilities", async () => {
    const response = await GET(new Request(`${url}/realtime?ownerId=someone-else`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.seal).toHaveBeenCalledWith("cookie-owner", batchId);
  });
  it("rejects unsigned requests before sealing", async () => {
    state.user.mockRejectedValue(new ApiError(401, "session_required", "Open your workspace."));
    const response = await GET(new Request(url), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.seal).not.toHaveBeenCalled();
  });
  it("rejects malformed batch IDs", async () => {
    expect((await GET(new Request(url), { params: Promise.resolve({ batchId: "bad" }) })).status).toBe(400);
    expect(state.seal).not.toHaveBeenCalled();
  });
  it("does not start workflows when authorizing or renewing a subscription", async () => {
    await GET(new Request(url), context);
    await GET(new Request(url), context);
    expect(state.resume).not.toHaveBeenCalled();
  });
  it("resumes only through an authenticated same-origin mutation", async () => {
    expect((await POST(new Request(`${url}/resume`, { method: "POST", headers: { origin: "https://evil.invalid" } }), context)).status).toBe(403);
    expect(state.resume).not.toHaveBeenCalled();
    expect((await POST(new Request(`${url}/resume`, { method: "POST", headers: { origin: "https://reshoot.tsilva.eu" } }), context)).status).toBe(204);
    expect(state.resume).toHaveBeenCalledWith("cookie-owner", batchId);
  });
  it("accepts the browser authority when the development server normalizes its URL", async () => {
    const response = await POST(new Request(`http://localhost:4000/api/generation-batches/${batchId}/resume`, {
      method: "POST", headers: { host: "127.0.0.1:4000", origin: "http://127.0.0.1:4000" },
    }), context);
    expect(response.status).toBe(204);
  });
});
