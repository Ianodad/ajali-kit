import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// meta.ts is a server-only module. Replace the server-only guard so the pure
// config resolver can be imported and tested in a plain Node environment.
vi.mock("server-only", () => ({}));

// Spy on the OpenAI constructor so we can prove the client is never built at
// import time or in mock mode (no key). No real SDK, so no network.
const openaiCtor = vi.fn();
vi.mock("openai", () => ({
  default: class {
    constructor(...args: unknown[]) {
      openaiCtor(...args);
    }
  },
}));

const {
  resolveMetaConfig,
  getMetaClient,
  DEFAULT_BASE_URL,
  DEFAULT_MUSE_MODEL,
  DEFAULT_SAM_MODEL,
} = await import("../meta");

describe("resolveMetaConfig", () => {
  it("falls back to the SPEC defaults when no env vars are set", () => {
    const config = resolveMetaConfig({});
    expect(config.baseURL).toBe(DEFAULT_BASE_URL);
    expect(config.museModel).toBe(DEFAULT_MUSE_MODEL);
    expect(config.samModel).toBe(DEFAULT_SAM_MODEL);
  });

  it("uses env var values when they are set", () => {
    const config = resolveMetaConfig({
      META_BASE_URL: "https://example.test/v1",
      MUSE_MODEL: "muse-spark-1.2",
      SAM_MODEL: "sam-3.1-test",
    });
    expect(config.baseURL).toBe("https://example.test/v1");
    expect(config.museModel).toBe("muse-spark-1.2");
    expect(config.samModel).toBe("sam-3.1-test");
  });

  it("matches the documented default model ids", () => {
    expect(DEFAULT_MUSE_MODEL).toBe("muse-spark-1.3");
    expect(DEFAULT_SAM_MODEL).toBe("sam-3.1");
    expect(DEFAULT_BASE_URL).toBe("https://api.meta.ai/v1");
  });
});

describe("getMetaClient in mock mode with no key", () => {
  const originalMock = process.env.AJALI_MOCK;
  const originalKey = process.env.MODEL_API_KEY;

  beforeEach(() => {
    openaiCtor.mockClear();
    // Mock mode on, no API key, as the app runs by default.
    process.env.AJALI_MOCK = "1";
    delete process.env.MODEL_API_KEY;
  });

  afterEach(() => {
    if (originalMock === undefined) delete process.env.AJALI_MOCK;
    else process.env.AJALI_MOCK = originalMock;
    if (originalKey === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = originalKey;
  });

  it("never constructs the OpenAI client just by importing the module", () => {
    expect(openaiCtor).not.toHaveBeenCalled();
  });

  it("throws instead of constructing a client when no key is set", () => {
    expect(() => getMetaClient()).toThrow(/MODEL_API_KEY/);
    expect(openaiCtor).not.toHaveBeenCalled();
  });
});
