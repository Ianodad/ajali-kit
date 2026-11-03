import { describe, expect, it } from "vitest";

import { blobToDataUrl } from "../blob-data-url";

describe("blobToDataUrl", () => {
  it("round-trips bytes through a data URL with the blob's mime type", async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 65, 66, 67]);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const decoded = Uint8Array.from(Buffer.from(base64, "base64"));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("falls back to application/octet-stream when the blob has no type", async () => {
    const dataUrl = await blobToDataUrl(new Blob([new Uint8Array([1])]));
    expect(dataUrl.startsWith("data:application/octet-stream;base64,")).toBe(true);
  });

  it("handles a blob larger than one base64 chunk", async () => {
    const bytes = new Uint8Array(0x8000 + 100).fill(42);
    const dataUrl = await blobToDataUrl(new Blob([bytes], { type: "image/jpeg" }));
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const decoded = Buffer.from(base64, "base64");
    expect(decoded.length).toBe(bytes.length);
  });
});
