import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ claim: vi.fn(), execute: vi.fn(), sleep: vi.fn(), archive: vi.fn() }));
vi.mock("workflow", () => ({ sleep: state.sleep }));
vi.mock("../workflows/generation/steps", () => ({ claimGenerationJob: state.claim, executeGenerationJob: state.execute }));
vi.mock("../workflows/generation/archive-step", () => ({ prepareGenerationArchive: state.archive }));
import { generationJobWorkflow } from "../workflows/generation";

describe("sequential job orchestration", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("sleeps durably while waiting and dispatches exactly once after predecessors settle", async () => {
    state.claim.mockResolvedValueOnce({ kind: "waiting" }).mockResolvedValueOnce({ kind: "waiting" })
      .mockResolvedValueOnce({ kind: "execute", attemptId: "attempt", leaseOwner: "lease" });
    state.execute.mockResolvedValue({ status: "succeeded" });
    state.sleep.mockImplementation(async () => { expect(state.execute).not.toHaveBeenCalled(); });
    expect(await generationJobWorkflow("job")).toEqual({ status: "succeeded" });
    expect(state.sleep).toHaveBeenCalledTimes(2);
    expect(state.sleep).toHaveBeenCalledWith("10s");
    expect(state.execute).toHaveBeenCalledExactlyOnceWith("job", "attempt", "lease");
    expect(state.archive).toHaveBeenCalledOnce();
  });
  it("does no paid work if another run finishes the job while this run waits", async () => {
    state.claim.mockResolvedValueOnce({ kind: "waiting" }).mockResolvedValueOnce({ kind: "terminal" });
    expect(await generationJobWorkflow("job")).toEqual({ status: "terminal" });
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.archive).not.toHaveBeenCalled();
  });
});
