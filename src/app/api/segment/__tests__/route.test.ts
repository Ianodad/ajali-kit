import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
vi.mock("@/lib/meta", () => ({
  getMetaClient: () => ({ responses: { create: createMock } }),
  SAM_MODEL: "sam-3.1",
}));

const { POST } = await import("../route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/segment", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const conceptBody = { mode: "concept", concept: "car", imageDataUrl: "data:image/jpeg;base64,abcd", width: 1200, height: 1600 };
const boxesBody = {
  mode: "boxes",
  imageDataUrl: "data:image/jpeg;base64,abcd",
  width: 1200,
  height: 1600,
  items: [{ id: 1, box: { left: 100, top: 100, right: 300, bottom: 300 } }],
};

describe("POST /api/segment", () => {
  const originalMock = process.env.AJALI_MOCK;

  beforeEach(() => {
    createMock.mockReset();
    delete process.env.AJALI_MOCK;
  });

  afterEach(() => {
    if (originalMock === undefined) delete process.env.AJALI_MOCK;
    else process.env.AJALI_MOCK = originalMock;
  });

  it("rejects a request matching neither mode", async () => {
    const res = await POST(request({ mode: "nonsense" }));
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("mock concept mode returns one vehicle mask with no model call", async () => {
    const res = await POST(request(conceptBody, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.objects).toHaveLength(1);
    expect(json.data.objects[0].objectId).toBe("vehicle");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("mock boxes mode returns one mask per requested item, geometry-consistent with the sent boxes", async () => {
    const res = await POST(request(boxesBody, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.objects).toHaveLength(1);
    expect(json.data.objects[0].objectId).toBe("1");
    expect(json.data.objects[0].box).toEqual(boxesBody.items[0].box);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects more than 16 box prompts", async () => {
    const items = Array.from({ length: 17 }, (_, i) => ({ id: i + 1, box: { left: 0, top: 0, right: 10, bottom: 10 } }));
    const res = await POST(request({ ...boxesBody, items }, { "x-ajali-mock": "1" }));
    expect(res.status).toBe(400);
  });

  it("parses a real streamed SAM response for a box prompt", async () => {
    // A minimal valid record stream the real parser can decode: see
    // src/lib/__tests__/sam-parse.test.ts for the wire-format mechanics this
    // mirrors against a real, not mocked, @meta-sam/parser.
    const { encodeOneBitMask } = await import("@/lib/__tests__/support/sam-mask-codec-mirror");
    const raster = new Uint8Array(16).fill(1);
    const encoded = encodeOneBitMask(raster, 4, 4);
    const wireText = `<0f>1<|box;x1=100;y1=100;x2=103;y2=103;w=1200;h=1600;c=0.8|><|mask;x=0;y=0;data=${encoded.height},${encoded.width},${encoded.payload};c=0.8|>\n`;
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "response.output_text.done", text: wireText, item_id: "item_1", output_index: 0, content_index: 0 };
        yield { type: "response.completed" };
      },
    });

    const res = await POST(request(boxesBody));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.objects).toHaveLength(1);
    expect(json.data.objects[0].objectId).toBe("1");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok:true with an empty objects array when SAM finds no match (not an error)", async () => {
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "response.output_text.done", text: "", item_id: "item_1", output_index: 0, content_index: 0 };
        yield { type: "response.completed" };
      },
    });
    const res = await POST(request(boxesBody));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.objects).toHaveLength(0);
    expect(json.data.errors).toBeUndefined();
  });
});
