// Test-only encoder that mirrors the one_bit range coder inside
// @meta-sam/parser's mask-codec (an adaptive binary range coder over a
// 12-bit neighbourhood context, finished with the same base85-style "pack"
// framing). The published package exports only the decoder
// (decodeMaskToRaster); its own encoder exists only as an unexported
// "internal encoder used to create deterministic synthetic conformance
// data" (see its source comment). This file reproduces that encoder so
// tests can build a small, real, round-trippable mask payload to exercise
// the parser path end to end, instead of mocking the decode step.

const excluded = new Set(['"', "\\", ",", ";", "<", ">", "|"]);
const alphabet = (() => {
  let value = "";
  for (let code = 0x21; code <= 0x7e; code += 1) {
    const character = String.fromCharCode(code);
    if (!excluded.has(character)) value += character;
  }
  return value;
})();
const radix = 85;
const prefixLength = 5;
const top = 1 << 24;
const bottom = 1 << 16;
const contextCount = 1 << 12;
const padding = 2;
const increment = 14;
const countLimit = 4096;

function pack(input: Uint8Array): string {
  let length = input.length;
  const prefix = new Array<string>(prefixLength);
  for (let index = prefixLength - 1; index >= 0; index -= 1) {
    prefix[index] = alphabet[length % radix];
    length = Math.floor(length / radix);
  }
  const output = [...prefix];
  let offset = 0;
  const full = input.length - (input.length % 4);
  for (; offset < full; offset += 4) {
    let value = ((input[offset] << 24) | (input[offset + 1] << 16) | (input[offset + 2] << 8) | input[offset + 3]) >>> 0;
    const digits = new Array<number>(5);
    for (let index = 4; index >= 0; index -= 1) {
      digits[index] = value % radix;
      value = (value - digits[index]) / radix;
    }
    for (const encoded of digits) output.push(alphabet[encoded]);
  }
  const remainder = input.length - offset;
  if (remainder > 0) {
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      value = ((value << 8) | (index < remainder ? input[offset + index] : 0)) >>> 0;
    }
    const digits = new Array<number>(5);
    for (let index = 4; index >= 0; index -= 1) {
      digits[index] = value % radix;
      value = (value - digits[index]) / radix;
    }
    for (let index = 0; index < remainder + 1; index += 1) {
      output.push(alphabet[digits[index]]);
    }
  }
  return output.join("");
}

class RangeEncoder {
  #low = 0;
  #range = 0xffffffff;
  #output: number[] = [];

  encode(cumulative: number, frequency: number, total: number): void {
    const scaled = Math.floor(this.#range / total);
    this.#low = (this.#low + scaled * cumulative) >>> 0;
    this.#range = scaled * frequency;
    while (
      (this.#low ^ (this.#low + this.#range)) >>> 0 < top ||
      (this.#range < bottom && ((this.#range = (-this.#low >>> 0) & (bottom - 1)), true))
    ) {
      this.#output.push((this.#low >>> 24) & 0xff);
      this.#low = (this.#low << 8) >>> 0;
      this.#range = (this.#range << 8) >>> 0;
    }
  }

  finish(): Uint8Array {
    for (let index = 0; index < 4; index += 1) {
      this.#output.push((this.#low >>> 24) & 0xff);
      this.#low = (this.#low << 8) >>> 0;
    }
    return Uint8Array.from(this.#output);
  }
}

function contextAt(raster: Uint8Array, position: number, prior: number, earlier: number): number {
  return (
    raster[position - 1] |
    (raster[position - 2] << 1) |
    (raster[prior - 2] << 2) |
    (raster[prior - 1] << 3) |
    (raster[prior] << 4) |
    (raster[prior + 1] << 5) |
    (raster[prior + 2] << 6) |
    (raster[earlier - 2] << 7) |
    (raster[earlier - 1] << 8) |
    (raster[earlier] << 9) |
    (raster[earlier + 1] << 10) |
    (raster[earlier + 2] << 11)
  );
}

function updateCounts(counts: Uint16Array, offset: number, bit: number): void {
  counts[offset + bit] = counts[offset + bit] + increment;
  if (counts[offset] + counts[offset + 1] >= countLimit) {
    counts[offset] = counts[offset] >> 1 || 1;
    counts[offset + 1] = counts[offset + 1] >> 1 || 1;
  }
}

function encodeRaster(input: Uint8Array, width: number, height: number): string {
  const encoder = new RangeEncoder();
  const counts = new Uint16Array(contextCount * 2).fill(1);
  const paddedWidth = width + 2 * padding;
  const padded = new Uint8Array(paddedWidth * (height + padding));
  for (let y = 0; y < height; y += 1) {
    const row = (y + padding) * paddedWidth + padding;
    for (let x = 0; x < width; x += 1) {
      const position = row + x;
      const context = contextAt(padded, position, position - paddedWidth, position - 2 * paddedWidth);
      const offset = context << 1;
      const zero = counts[offset];
      const one = counts[offset + 1];
      const bit = input[y * width + x];
      if (bit === 0) encoder.encode(0, zero, zero + one);
      else encoder.encode(zero, one, zero + one);
      padded[position] = bit;
      updateCounts(counts, offset, bit);
    }
  }
  return `!${pack(encoder.finish())}`;
}

// Encodes a row-major 0/1 raster into a one_bit SegmentationMask payload,
// the same shape @meta-sam/parser's decodeMaskToRaster accepts.
export function encodeOneBitMask(raster: Uint8Array, width: number, height: number) {
  return {
    encoding: "one_bit" as const,
    payload: encodeRaster(raster, width, height),
    width,
    height,
  };
}
