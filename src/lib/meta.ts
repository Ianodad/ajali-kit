import "server-only";

import OpenAI from "openai";

// Defaults from SPEC section 10.5. Model ids and base URL come from env vars.
export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MUSE_MODEL = "muse-spark-1.3";
export const DEFAULT_SAM_MODEL = "sam-3.1";

export interface MetaConfig {
  baseURL: string;
  museModel: string;
  samModel: string;
}

// Pure resolver so the defaults can be unit tested without constructing a client
// or needing a real API key. Pass an env object; defaults to process.env.
export function resolveMetaConfig(
  env: Record<string, string | undefined> = process.env,
): MetaConfig {
  return {
    baseURL: env.META_BASE_URL || DEFAULT_BASE_URL,
    museModel: env.MUSE_MODEL || DEFAULT_MUSE_MODEL,
    samModel: env.SAM_MODEL || DEFAULT_SAM_MODEL,
  };
}

const config = resolveMetaConfig();

export const META_BASE_URL = config.baseURL;
export const MUSE_MODEL = config.museModel;
export const SAM_MODEL = config.samModel;

// The OpenAI SDK throws when constructed without a key. In mock mode there is
// no key, and every AI route must still load, so build the client lazily and
// only when a real call is actually made.
let client: OpenAI | null = null;

export function getMetaClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) {
      throw new Error(
        "MODEL_API_KEY is not set. Set it in .env.local, or use mock mode (AJALI_MOCK=1).",
      );
    }
    client = new OpenAI({ baseURL: META_BASE_URL, apiKey });
  }
  return client;
}
