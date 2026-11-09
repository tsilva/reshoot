import { z } from "zod";

export const rotationObservationSchema = z.object({
  confident: z.boolean(), same_product: z.boolean(), rigid_pose: z.boolean(),
  front_visible: z.boolean(), rear_visible: z.boolean(),
  physical_side: z.enum(["right", "left", "neither", "indistinguishable", "uncertain"]),
  evidence: z.string().trim().min(1).max(1200),
}).strict();

export const anchoredRotationObservationSchema = rotationObservationSchema.extend({
  side_image_edge: z.enum(["left", "right", "neither", "indistinguishable", "uncertain"]),
  same_view_as: z.number().min(0).max(359).nullable(),
}).strict();

export type RotationObservation = z.infer<typeof rotationObservationSchema> | z.infer<typeof anchoredRotationObservationSchema>;

export const rejectedRotationSchema = z.object({
  kind: z.literal("rotation-review-v1"),
  failure: z.string().min(1).max(240),
  previewAvailable: z.boolean(),
  target: z.object({
    azimuth: z.number().min(0).max(359), elevation: z.number().min(-90).max(90),
    front: z.boolean(), rear: z.boolean(), side: z.enum(["left", "right", "neither"]),
  }).strict(),
  observed: z.union([anchoredRotationObservationSchema, rotationObservationSchema]).nullable(),
}).strict();

// Read only our bounded structured record, never arbitrary historical errors.
export function parseRejectedRotation(value: string | null) {
  if (!value) return undefined;
  try {
    const parsed = rejectedRotationSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
