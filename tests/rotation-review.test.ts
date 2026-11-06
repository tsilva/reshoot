import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@/lib/generation/provider-calls", () => ({ callProviderJson: state.call }));
import { reviewRotationOutput, rotationReviewFailure } from "../lib/generation/rotation-review";
import { ROTATION_COORDINATE_FRAME, UPRIGHT_DISPLAY_POSE, rotationTarget } from "../lib/generation/rotation";
import { buildGenerationPrompt } from "../lib/generation/request";

const observed = { confident: true, same_product: true, rigid_pose: true,
  front_visible: false, rear_visible: false, physical_side: "left", evidence: "The original asymmetric surface landmark is occluded on the far side." };
const review = (patch = {}) => JSON.stringify({ ...observed, ...patch });

describe("physical rotation acceptance", () => {
  beforeEach(() => { state.call.mockReset(); });

  it("requires opposite sides at both profiles and front/rear quarters", () => {
    for (const [azimuth, front, rear, side] of [
      [0, true, false, "neither"], [45, true, false, "right"], [90, false, false, "right"],
      [135, false, true, "right"], [180, false, true, "neither"], [225, false, true, "left"],
      [270, false, false, "left"], [315, true, false, "left"],
    ] as const) {
      expect(rotationTarget({ label: "View", azimuth })).toMatchObject({ front, rear, side });
      expect(rotationReviewFailure(review({ front_visible: front, rear_visible: rear, physical_side: side }), { label: "View", azimuth })).toBeUndefined();
      if (side !== "neither") {
        expect(rotationReviewFailure(review({ front_visible: front, rear_visible: rear, physical_side: side === "left" ? "right" : "left" }), { label: "View", azimuth })).toContain("wrong physical side");
      }
    }
  });

  it.each([
    { confident: false }, { same_product: false }, { rigid_pose: false },
    { front_visible: true }, { rear_visible: true }, { physical_side: "uncertain" },
  ])("rejects unverified identity, pose, confidence and broad-face exposure: %j", (patch) => {
    expect(rotationReviewFailure(review(patch), { label: "Left", azimuth: 270 })).toBeTypeOf("string");
  });

  it.each([undefined, "not JSON", "{}", '{"confident":"true"}', "[]", "null"])("fails closed on %s", (content) => {
    expect(rotationReviewFailure(content, { label: "Left", azimuth: 270 })).toBeTypeOf("string");
  });

  it("allows genuine rotational symmetry while rejecting uncertainty or changed geometry", () => {
    const symmetric = { physical_side: "indistinguishable", evidence: "Uniform unmarked assembly is rotationally symmetric about its vertical axis." };
    expect(rotationReviewFailure(review(symmetric), { label: "Front", azimuth: 0 })).toBeUndefined();
    expect(rotationReviewFailure(review({ ...symmetric, confident: false }), { label: "Front", azimuth: 0 })).toBeTypeOf("string");
    expect(rotationReviewFailure(review({ ...symmetric, rigid_pose: false }), { label: "Front", azimuth: 0 })).toBeTypeOf("string");
  });

  it("keeps generation and review instructions object-independent", async () => {
    expect(buildGenerationPrompt({ label: "Left", azimuth: 315 }, 1)).toContain("visible physical side LEFT");
    state.call.mockResolvedValue({ ok: true, result: { choices: [{ message: { content: review() } }] } });
    await reviewRotationOutput({ ownerId: "owner", projectId: "project", generationAttemptId: "attempt",
      shot: { label: "Left", azimuth: 270 }, guide: { kind: "direction-frame-v1", azimuth: 270, elevation: 0, image: "guide" },
      references: ["original"], candidate: "candidate" });
    const messages = state.call.mock.calls[0][0].body.messages;
    expect(JSON.stringify(messages)).not.toMatch(/\b(?:watch|watches|crown|dial|strap|mug|cup|phone|doll)\b/i);
    expect(messages[0].content).toContain("asymmetric landmarks");
  });

  it("uses original bytes and an independent observed-side review, with ledger attribution", async () => {
    state.call.mockResolvedValue({ ok: true, result: { choices: [{ message: { content: review() } }] } });
    expect(await reviewRotationOutput({ ownerId: "owner", projectId: "project", generationAttemptId: "attempt",
      shot: { label: "Left", azimuth: 270 }, guide: { kind: "direction-frame-v1", azimuth: 270, elevation: 0, image: "guide" },
      references: ["original", "supporting"], candidate: "candidate" })).toBeUndefined();
    const input = state.call.mock.calls[0][0];
    expect(input).toMatchObject({ ownerId: "owner", projectId: "project", generationAttemptId: "attempt", purpose: "rotation_review" });
    expect(input.body.messages[1].content.slice(1).map((item: { image_url: { url: string } }) => item.image_url.url)).toEqual(["original", "supporting", "guide", "candidate"]);
    expect(input.body.messages[0].content).toContain("OBSERVED physical side");
  });

  it("does not retry a failed reviewer or accept an image without a verdict", async () => {
    state.call.mockRejectedValue(new Error("private provider output"));
    const input = { ownerId: "owner", projectId: "project", generationAttemptId: "attempt", shot: { label: "Left", azimuth: 270 },
      guide: { kind: "direction-frame-v1" as const, azimuth: 270, elevation: 0, image: "guide" }, references: ["original"], candidate: "candidate" };
    expect(await reviewRotationOutput(input)).toBe("The orientation review could not be completed.");
    expect(state.call).toHaveBeenCalledOnce();
  });

  it("preserves the validated observation on rejection without logging raw provider content", async () => {
    const onObservation = vi.fn();
    state.call.mockResolvedValue({ ok: true, result: { choices: [{ message: { content: review({ front_visible: true }) } }] } });
    expect(await reviewRotationOutput({ ownerId: "owner", projectId: "project", generationAttemptId: "attempt",
      shot: { label: "Left", azimuth: 270 }, guide: { kind: "direction-frame-v1", azimuth: 270, elevation: 0, image: "guide" },
      references: ["original"], candidate: "candidate", onObservation })).toContain("wrong physical side");
    expect(onObservation).toHaveBeenCalledWith(expect.objectContaining({ front_visible: true, physical_side: "left" }));
    const instructions = state.call.mock.calls[0][0].body.messages[0].content;
    expect(instructions).toContain("not merely that a thin rim");
    expect(buildGenerationPrompt({ label: "Right", azimuth: 90 }, 1)).toContain("EXACT EDGE-ON PROFILE");
    expect(buildGenerationPrompt({ label: "Front", azimuth: 0 }, 1)).not.toContain("EXACT EDGE-ON PROFILE");
  });

  it("reviews continuity against earlier accepted views and rejects component inversion", async () => {
    state.call.mockResolvedValue({ ok: true, result: { choices: [{ message: { content: review({ rigid_pose: false,
      evidence: "A flexible component has reversed curvature relative to the earlier views." }) } }] } });
    expect(await reviewRotationOutput({ ownerId: "owner", projectId: "project", generationAttemptId: "attempt",
      shot: { label: "Left", azimuth: 270 }, guide: { kind: "direction-frame-v1", azimuth: 270, elevation: 0, image: "guide" },
      references: ["original"], previousViews: [{ image: "front", azimuth: 0, elevation: 0 }, { image: "rear", azimuth: 180, elevation: 0 }],
      candidate: "inverted",
    })).toContain("construction or rigid display pose changed");
    const messages = state.call.mock.calls[0][0].body.messages;
    expect(messages[1].content.slice(1).map((item: { image_url: { url: string } }) => item.image_url.url))
      .toEqual(["original", "front", "rear", "guide", "inverted"]);
    expect(messages[1].content[0].text).toContain("REFERENCE 2 is an earlier generated view at 0 degrees");
    expect(messages[0].content).toContain("Set rigid_pose=false for an inside-out inversion");
  });
});

describe("blind anchored orientation review", () => {
  it("does not reject a verified true profile for an inapplicable broad-face edge label", () => {
    const actualLeftObservation = review({ physical_side: "left", front_visible: false, rear_visible: false,
      side_image_edge: "right", same_view_as: null, evidence: "Only the thin edge opposite the asymmetric control is visible." });
    expect(rotationReviewFailure(actualLeftObservation, { label: "Left", azimuth: 270 }, "verified-rotation-v2")).toBeUndefined();
    expect(rotationReviewFailure(review({ physical_side: "right", front_visible: false, rear_visible: false,
      side_image_edge: "left", same_view_as: null }), { label: "Right", azimuth: 90 }, "verified-rotation-v2")).toBeUndefined();
    // The correction does not excuse an exposed front face or the wrong side.
    expect(rotationReviewFailure(review({ physical_side: "left", front_visible: true, side_image_edge: "right", same_view_as: null }),
      { label: "Left", azimuth: 270 }, "verified-rotation-v2")).toContain("wrong physical side");
    expect(rotationReviewFailure(review({ physical_side: "right", side_image_edge: "right", same_view_as: null }),
      { label: "Left", azimuth: 270 }, "verified-rotation-v2")).toContain("wrong physical side");
    expect(rotationReviewFailure(review({ physical_side: "left", side_image_edge: "right", same_view_as: 90 }),
      { label: "Left", azimuth: 270 }, "verified-rotation-v2")).toContain("repeats another angle");
  });

  it("can bootstrap the front without anchors using the generator's coordinate frame and display pose", async () => {
    state.call.mockResolvedValue({ ok: true, result: { choices: [{ message: { content: review({
      front_visible: true, physical_side: "neither", side_image_edge: "neither", same_view_as: null,
    }) } }] } });
    expect(await reviewRotationOutput({ ownerId: "owner", projectId: "project", generationAttemptId: "attempt",
      shot: { label: "SECRET-FRONT-TARGET", azimuth: 0 },
      guide: { kind: "direction-frame-v1", azimuth: 0, elevation: 0, image: "TARGET-GUIDE" },
      references: ["tilted-original"], candidate: "upright-candidate", policy: "verified-rotation-v2",
    })).toBeUndefined();
    const body = state.call.mock.calls.at(-1)![0].body;
    expect(body.messages[0].content).toContain(ROTATION_COORDINATE_FRAME);
    expect(body.messages[0].content).toContain(UPRIGHT_DISPLAY_POSE);
    expect(body.messages[0].content).toContain("A rigid reorientation of the whole assembly");
    expect(body.messages[0].content).toContain("Camera elevation to verify: 0 degrees");
    expect(JSON.stringify(body)).not.toContain("SECRET-FRONT-TARGET");
    expect(JSON.stringify(body)).not.toContain("TARGET-GUIDE");
    expect(buildGenerationPrompt({ label: "View", azimuth: 0 }, 1)).toContain(ROTATION_COORDINATE_FRAME);
    expect(buildGenerationPrompt({ label: "View", azimuth: 0 }, 1)).toContain(UPRIGHT_DISPLAY_POSE);
  });

  it("rejects the reported rear-quarter duplicate even when physical-side words match the requested answer", () => {
    const content=review({rear_visible:true,physical_side:"left",side_image_edge:"left",same_view_as:135});
    expect(rotationReviewFailure(content,{label:"Rear left",azimuth:225},"verified-rotation-v2")).toContain("wrong image edge");
    expect(rotationReviewFailure(review({rear_visible:true,physical_side:"left",side_image_edge:"right",same_view_as:135}),
      {label:"Rear left",azimuth:225},"verified-rotation-v2")).toContain("repeats another angle");
    expect(rotationReviewFailure(review({rear_visible:true,physical_side:"left",side_image_edge:"right",same_view_as:null}),
      {label:"Rear left",azimuth:225},"verified-rotation-v2")).toBeUndefined();
  });

  it("withholds the target label and guide, and supplies cardinal and opposite-quarter evidence", async () => {
    state.call.mockResolvedValue({ok:true,result:{choices:[{message:{content:review({rear_visible:true,physical_side:"left",side_image_edge:"right",same_view_as:null})}}]}});
    const result=await reviewRotationOutput({ownerId:"owner",projectId:"project",generationAttemptId:"attempt",
      shot:{label:"SECRET TARGET rear-left",azimuth:225},guide:{kind:"direction-frame-v1",azimuth:225,elevation:0,image:"TARGET-GUIDE"},
      references:["original"],previousViews:[{image:"front",azimuth:0,elevation:0},{image:"opposite",azimuth:135,elevation:0}],candidate:"candidate",policy:"verified-rotation-v2"});
    expect(result).toBeUndefined();
    const request=state.call.mock.calls.at(-1)![0];
    expect(request.body.model).toContain("gpt-4.1");
    expect(JSON.stringify(request.body)).not.toContain("SECRET TARGET");
    expect(JSON.stringify(request.body)).not.toContain("TARGET-GUIDE");
    expect(request.body.messages[1].content.filter((i:{type:string})=>i.type==="image_url").map((i:{image_url:{url:string}})=>i.image_url.url)).toEqual(["candidate","original","front","opposite"]);
    expect(request.body.messages[1].content[0].text).toContain("IMAGE 1 IS THE CANDIDATE");
    expect(JSON.stringify(request.body.messages[1].content)).toContain("IMAGE 2: AUTHORITATIVE ORIGINAL 1");
    expect(JSON.stringify(request.body.messages[1].content)).toContain("IMAGE 3: ACCEPTED 0-degree ANCHOR");
    expect(request.body.messages[1].content.at(-1).text).toContain("inspect IMAGE 1");
  });
});
