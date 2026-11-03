import { z } from "zod";

// Request schemas for /api/segment, SPEC section 8.3. "concept" asks SAM for
// one noun-phrase mask (the vehicle); "boxes" asks for up to 16 box-prompted
// masks (the damage items, or one user-drawn box for "Add missed damage").
// A prompt is either a noun phrase or box prompts, never both (SPEC 10.4).

const PixelBoxSchema = z.object({
  left: z.number().int().min(0),
  top: z.number().int().min(0),
  right: z.number().int().min(0),
  bottom: z.number().int().min(0),
});

const BaseFields = {
  imageDataUrl: z.string().startsWith("data:image/"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
};

export const SegmentConceptRequestSchema = z.object({
  mode: z.literal("concept"),
  concept: z.string().min(1).default("car"),
  ...BaseFields,
});

export const SegmentBoxesRequestSchema = z.object({
  mode: z.literal("boxes"),
  items: z
    .array(z.object({ id: z.number().int().min(1), box: PixelBoxSchema }))
    .min(1)
    .max(16),
  ...BaseFields,
});

export const SegmentRequestSchema = z.discriminatedUnion("mode", [
  SegmentConceptRequestSchema,
  SegmentBoxesRequestSchema,
]);

export type SegmentRequest = z.infer<typeof SegmentRequestSchema>;
