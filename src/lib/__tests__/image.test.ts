import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseExifOrientation, processImage } from "../image";

describe("parseExifOrientation", () => {
  it("returns 1 for a buffer that is not a JPEG", () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer;
    expect(parseExifOrientation(buffer)).toBe(1);
  });

  it("returns 1 for a JPEG with no EXIF data", () => {
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    expect(parseExifOrientation(buffer)).toBe(1);
  });

  it("reads the orientation tag out of an EXIF APP1 segment", () => {
    // SOI, APP1 (len 0x0022), "Exif\0\0", little-endian TIFF header, one IFD
    // entry: tag 0x0112 (Orientation), type SHORT, count 1, value 6.
    const bytes = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, 0x00, 0x22, // APP1, length 34
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header, IFD at offset 8
      0x01, 0x00, // 1 entry
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // Orientation = 6
      0x00, 0x00, 0x00, 0x00, // next IFD offset
      0xff, 0xd9, // EOI
    ]);
    expect(parseExifOrientation(bytes.buffer)).toBe(6);
  });
});

class FakeContext2D {
  transform = vi.fn();
  drawImage = vi.fn();
}

class FakeCanvas {
  width = 0;
  height = 0;
  getContext(type: string) {
    return type === "2d" ? new FakeContext2D() : null;
  }
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number) {
    callback(new Blob([`canvas:${this.width}x${this.height}:${quality}`], { type: type ?? "image/jpeg" }));
  }
}

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  set src(value: string) {
    this._src = value;
    this.naturalWidth = 3200;
    this.naturalHeight = 2400;
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

describe("processImage", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "canvas") return new FakeCanvas();
        throw new Error(`unexpected createElement(${tag})`);
      },
    });
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scales a 3200x2400 photo down to 1600 on the long side, with a 320px thumbnail", async () => {
    const file = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])]);
    const result = await processImage(file);

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.thumbBlob).toBeInstanceOf(Blob);
  });
});
