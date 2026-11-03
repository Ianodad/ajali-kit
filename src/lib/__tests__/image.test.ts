import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processImage } from "../image";

// No manual EXIF-orientation transform is tested here: evergreen browsers
// already decode HTMLImageElement pixel data with orientation "from-image",
// so there is nothing left for this module to parse or re-apply. See the
// comment at the top of image.ts.

let fakeImageSize = { width: 3200, height: 2400 };
let fakePixelValue = 200; // 0..255, bright by default so looksTooDark is false

class FakeContext2D {
  drawImage = vi.fn();
  getImageData(_x: number, _y: number, w: number, h: number) {
    const data = new Uint8ClampedArray(Math.max(w, 1) * Math.max(h, 1) * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fakePixelValue;
      data[i + 1] = fakePixelValue;
      data[i + 2] = fakePixelValue;
      data[i + 3] = 255;
    }
    return { data };
  }
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
    this.naturalWidth = fakeImageSize.width;
    this.naturalHeight = fakeImageSize.height;
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

describe("processImage", () => {
  beforeEach(() => {
    fakeImageSize = { width: 3200, height: 2400 };
    fakePixelValue = 200;
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
    expect(await result.blob.text()).toBe("canvas:1600x1200:0.82");
    expect(await result.thumbBlob.text()).toBe("canvas:320x240:0.7");
  });

  it("does not upscale a photo already smaller than the max long side", async () => {
    fakeImageSize = { width: 800, height: 600 };
    const file = new Blob([new Uint8Array([0x00])]);
    const result = await processImage(file);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("flags a photo as too dark when its mean luminance is low", async () => {
    fakePixelValue = 5;
    const file = new Blob([new Uint8Array([0x00])]);
    const result = await processImage(file);

    expect(result.looksTooDark).toBe(true);
    expect(result.looksTooSmall).toBe(false);
  });

  it("does not flag a normally lit photo as too dark", async () => {
    const file = new Blob([new Uint8Array([0x00])]);
    const result = await processImage(file);

    expect(result.looksTooDark).toBe(false);
  });

  it("flags a photo as too small when its long side is under 400px", async () => {
    fakeImageSize = { width: 300, height: 200 };
    const file = new Blob([new Uint8Array([0x00])]);
    const result = await processImage(file);

    expect(result.looksTooSmall).toBe(true);
  });
});
