import { parseImageStream } from "@meta-sam/parser";
import { describe, expect, it } from "vitest";

import { pairSamRecords } from "../sam-parse";
import { encodeOneBitMask } from "./support/sam-mask-codec-mirror";

// Builds one SAM API wire record: "<id><|box;...|><|mask;...|>", the exact
// grammar @meta-sam/parser's segmentation parser reads (see its
// readApiRecord / #acceptApiLine). box x1/y1/x2/y2 are inclusive pixel
// coordinates in the frame; w/h are the *frame's* width and height, not the
// box's own size (the parser validates x2 < w and y2 < h against them).
function buildRecord(objectId: number, box: { x1: number; y1: number; x2: number; y2: number }, frame: { width: number; height: number }, mask: { raster: Uint8Array; width: number; height: number }, confidence: number) {
  const encoded = encodeOneBitMask(mask.raster, mask.width, mask.height);
  const boxToken = `<|box;x1=${box.x1};y1=${box.y1};x2=${box.x2};y2=${box.y2};w=${frame.width};h=${frame.height};c=${confidence}|>`;
  const maskToken = `<|mask;x=0;y=0;data=${encoded.height},${encoded.width},${encoded.payload};c=${confidence}|>`;
  return `${objectId}${boxToken}${maskToken}`;
}

function singlePixelFrameEvents(wireText: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "response.output_text.done", text: wireText, item_id: "item_1", output_index: 0, content_index: 0 };
      yield { type: "response.completed" };
    },
  };
}

describe("pairSamRecords (parser path, synthetic fixture)", () => {
  it("decodes a real one_bit mask and pairs it with its box by objectId", async () => {
    // An 8x8 mask raster with a filled 4x4 quadrant: a small, deterministic,
    // non-rectangular-looking synthetic "damage mask" inside its box.
    const maskWidth = 8;
    const maskHeight = 8;
    const raster = new Uint8Array(maskWidth * maskHeight);
    for (let y = 2; y < 6; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        raster[y * maskWidth + x] = 1;
      }
    }
    const onesCount = raster.reduce((sum, v) => sum + v, 0);
    expect(onesCount).toBe(16);

    const frame = { width: 100, height: 100 };
    const box = { x1: 10, y1: 10, x2: 17, y2: 17 }; // inclusive -> 8x8 px box, same size as the raster
    const line = `<0f>${buildRecord(1, box, frame, { raster, width: maskWidth, height: maskHeight }, 0.92)}\n`;

    const parsed = parseImageStream(singlePixelFrameEvents(line));
    const result = await parsed.finalResult;

    expect(result.outcome.status).toBe("completed");
    expect(result.diagnostics).toHaveLength(0);

    const objects = pairSamRecords(result.records);
    expect(objects).toHaveLength(1);
    const [object] = objects;
    expect(object.objectId).toBe("1");
    expect(object.box).toEqual({ left: 10, top: 10, right: 18, bottom: 18 });
    expect(object.rasterWidth).toBe(8);
    expect(object.rasterHeight).toBe(8);
    expect(object.confidence).toBeCloseTo(0.92, 5);
    // Raster area (64px) == box area (64px) here, so the scaled area equals
    // the raw 1-count (16px) exactly.
    expect(object.areaPx).toBe(16);
    expect(object.svgPath.length).toBeGreaterThan(0);
  });

  it("pairs multiple objects in one frame independently", async () => {
    const frame = { width: 200, height: 200 };
    const smallRaster = new Uint8Array(16).fill(1); // 4x4, fully filled
    const rec1 = buildRecord(1, { x1: 0, y1: 0, x2: 3, y2: 3 }, frame, { raster: smallRaster, width: 4, height: 4 }, 0.8);
    const rec2 = buildRecord(2, { x1: 50, y1: 50, x2: 53, y2: 53 }, frame, { raster: smallRaster, width: 4, height: 4 }, 0.5);
    const line = `<0f>${rec1},${rec2}\n`;

    const parsed = parseImageStream(singlePixelFrameEvents(line));
    const result = await parsed.finalResult;
    expect(result.outcome.status).toBe("completed");

    const objects = pairSamRecords(result.records);
    expect(objects.map((o) => o.objectId).sort()).toEqual(["1", "2"]);
    for (const object of objects) {
      expect(object.areaPx).toBe(16); // fully-filled 4x4 raster over an equal-size box
    }
  });

  it("returns no objects, with no error, for empty output text (a valid 'no match', SPEC 8.3)", async () => {
    const parsed = parseImageStream(singlePixelFrameEvents(""));
    const result = await parsed.finalResult;
    expect(result.outcome.status).toBe("completed");
    expect(result.diagnostics).toHaveLength(0);
    expect(pairSamRecords(result.records)).toHaveLength(0);
  });
});
