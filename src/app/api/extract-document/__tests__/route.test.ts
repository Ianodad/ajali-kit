import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// route.ts imports "@/lib/meta", a server-only module; replace it wholesale,
// the same approach analyze-photo's route test uses.
const createMock = vi.fn();
vi.mock("@/lib/meta", () => ({
  getMetaClient: () => ({ responses: { create: createMock } }),
  MUSE_MODEL: "muse-spark-1.3",
}));

const { POST } = await import("../route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/extract-document", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = { imageDataUrl: "data:image/jpeg;base64,abcd", docType: "driving_licence" };

describe("POST /api/extract-document", () => {
  const originalMock = process.env.AJALI_MOCK;

  beforeEach(() => {
    createMock.mockReset();
    delete process.env.AJALI_MOCK;
  });

  afterEach(() => {
    if (originalMock === undefined) delete process.env.AJALI_MOCK;
    else process.env.AJALI_MOCK = originalMock;
    vi.useRealTimers();
  });

  it("rejects a malformed request body with ok:false, before touching the model", async () => {
    const res = await POST(request({ docType: "driving_licence" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown docType", async () => {
    const res = await POST(request({ imageDataUrl: validBody.imageDataUrl, docType: "passport" }));
    expect(res.status).toBe(400);
  });

  it("returns the licence mock fixture via the mock header with no model call", async () => {
    const res = await POST(request(validBody, { "x-ajali-mock": "1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.detectedDocType).toBe("driving_licence");
    expect(json.data.fields.some((f: { key: string }) => f.key === "full_name")).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the logbook mock fixture for docType logbook", async () => {
    const res = await POST(request({ ...validBody, docType: "logbook" }, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.detectedDocType).toBe("logbook");
    expect(json.data.fields.some((f: { key: string }) => f.key === "registration")).toBe(true);
  });

  it("returns the insurance certificate mock fixture for docType insurance_certificate", async () => {
    const res = await POST(request({ ...validBody, docType: "insurance_certificate" }, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.detectedDocType).toBe("insurance_certificate");
    expect(json.data.fields.some((f: { key: string }) => f.key === "insurer")).toBe(true);
  });

  it("returns the mock fixture via AJALI_MOCK=1 with no header", async () => {
    process.env.AJALI_MOCK = "1";
    const res = await POST(request(validBody));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("parses a real structured-output response into the mapped shape", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        detected_doc_type: "driving_licence",
        fields: [{ key: "full_name", value: "Real Name", confidence: "high" }],
      }),
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const res = await POST(request(validBody));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.fields).toHaveLength(1);
    expect(json.data.fields[0].value).toBe("Real Name");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on an invalid JSON response, then succeeds", async () => {
    vi.useFakeTimers();
    createMock
      .mockResolvedValueOnce({ output_text: "not json", usage: {} })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({ detected_doc_type: "logbook", fields: [] }),
        usage: {},
      });
    const resPromise = POST(request(validBody));
    await vi.advanceTimersByTimeAsync(5000);
    const res = await resPromise;
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.detectedDocType).toBe("logbook");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated schema-invalid responses and returns ok:false", async () => {
    vi.useFakeTimers();
    createMock.mockResolvedValue({ output_text: JSON.stringify({ not: "the expected shape" }), usage: {} });
    const resPromise = POST(request(validBody));
    await vi.advanceTimersByTimeAsync(30000);
    const res = await resPromise;
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(4);
  });
});
