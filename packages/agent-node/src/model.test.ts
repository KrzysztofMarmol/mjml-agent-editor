import { describe, expect, it } from "vitest";

import { DEFAULT_ANTHROPIC_MODEL, ModelConfigurationError, resolveModelFromEnv } from "./model.js";

/**
 * `LanguageModel` is `string | LanguageModelV3`, so `modelId` is not reachable through it.
 * A provider factory always returns the object form, and the point of these tests is that
 * the right id reached the right backend — which is only visible on the instance.
 */
function resolved(env: Record<string, string | undefined>) {
  return resolveModelFromEnv(env) as Exclude<ReturnType<typeof resolveModelFromEnv>, string>;
}

describe("resolveModelFromEnv", () => {
  it("defaults to Anthropic", () => {
    const model = resolved({ ANTHROPIC_API_KEY: "test-key" });

    expect(model.modelId).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(model.provider).toBe("anthropic.messages");
  });

  it("accepts an Anthropic id with or without the Python-style provider prefix", () => {
    const bare = resolved({
      ANTHROPIC_API_KEY: "test-key",
      AGENT_MODEL: "claude-sonnet-5",
    });
    const prefixed = resolved({
      ANTHROPIC_API_KEY: "test-key",
      AGENT_MODEL: "anthropic:claude-sonnet-5",
    });

    expect(bare.modelId).toBe("claude-sonnet-5");
    expect(prefixed.modelId).toBe("claude-sonnet-5");
  });

  it("refuses Anthropic without a key", () => {
    expect(() => resolveModelFromEnv({})).toThrow(ModelConfigurationError);
  });

  it("resolves the DeepSeek preset", () => {
    const model = resolved({
      AGENT_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test-key",
    });

    expect(model.modelId).toBe("deepseek-chat");
    // Chat Completions, not the Responses API — DeepSeek does not implement the latter.
    expect(model.provider).toBe("openai.chat");
  });

  it("resolves the Gemini preset", () => {
    const model = resolved({
      AGENT_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    });

    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  it("drops a leftover provider prefix rather than sending it to DeepSeek", () => {
    const model = resolved({
      AGENT_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test-key",
      AGENT_MODEL: "anthropic:claude-haiku-4-5",
    });

    expect(model.modelId).toBe("deepseek-chat");
  });

  it("drops a bare Anthropic id too, not just the prefixed spelling", () => {
    // This is the one that actually got through: DeepSeek answered "the supported API
    // model names are deepseek-v4-pro or deepseek-v4-flash, but you passed
    // claude-haiku-4-5" — a message naming neither AGENT_PROVIDER nor AGENT_MODEL.
    const model = resolved({
      AGENT_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test-key",
      AGENT_MODEL: "claude-haiku-4-5",
    });

    expect(model.modelId).toBe("deepseek-chat");
  });

  it("keeps a colon that belongs to a namespaced id", () => {
    // OpenRouter's free tier is spelled "vendor/model:free".
    const model = resolved({
      AGENT_PROVIDER: "openrouter",
      AGENT_BASE_URL: "https://openrouter.ai/api/v1",
      AGENT_MODEL: "deepseek/deepseek-r1:free",
      AGENT_API_KEY: "test-key",
    });

    expect(model.modelId).toBe("deepseek/deepseek-r1:free");
  });

  it("names everything a custom backend is missing", () => {
    expect(() => resolveModelFromEnv({ AGENT_PROVIDER: "custom" })).toThrow(
      /AGENT_BASE_URL, AGENT_MODEL, an API key/,
    );
  });

  it("points at the preset's own key variable when only that is missing", () => {
    expect(() => resolveModelFromEnv({ AGENT_PROVIDER: "gemini" })).toThrow(/GEMINI_API_KEY/);
  });
});
