/**
 * Backend selection from the environment.
 *
 * `createChatHandler` takes a model instance and does not care where it came from, which
 * is the right boundary — a host with one hardcoded provider should not have to think
 * about any of this. But every host that wants to swap providers ends up writing the same
 * thirty lines, and the cost difference between them is the difference between a demo
 * that is free to run and one that bills per visitor. So it ships here as an opt-in
 * helper rather than being baked into the handler.
 *
 * This mirrors `agent-python/email_agent.py:get_model()`; the two read the same variables
 * and pick the same defaults.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

/**
 * OpenAI-compatible presets. Both DeepSeek and Gemini expose an OpenAI-compatible Chat
 * Completions endpoint, so one provider package reaches either without a second SDK.
 *
 * That package is `@ai-sdk/openai` and not the more obvious `@ai-sdk/openai-compatible`:
 * every published version of the latter depends on `@ai-sdk/provider` 4.x, which pairs
 * with `ai` v7, while this package is on `ai` v6 / provider 3.x. Mixing them compiles to
 * `LanguageModelV4 is not assignable to LanguageModel`. Revisit when the repo moves to
 * `ai` v7.
 */
const OPENAI_COMPATIBLE: Record<string, { baseURL: string; defaultModel: string; keyEnv: string }> =
  {
    deepseek: {
      baseURL: "https://api.deepseek.com",
      defaultModel: "deepseek-chat",
      keyEnv: "DEEPSEEK_API_KEY",
    },
    gemini: {
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      defaultModel: "gemini-2.5-flash",
      keyEnv: "GEMINI_API_KEY",
    },
  };

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

/**
 * Resolve the agent model from a set of environment variables.
 *
 * `AGENT_PROVIDER` selects the backend:
 *
 * - `anthropic` (default): `AGENT_MODEL` with `ANTHROPIC_API_KEY`.
 * - `deepseek`: `deepseek-chat` via api.deepseek.com with `DEEPSEEK_API_KEY`.
 * - `gemini`: `gemini-2.5-flash` via Google's OpenAI-compatible endpoint with
 *   `GEMINI_API_KEY`.
 * - anything else: a custom OpenAI-compatible backend — set `AGENT_BASE_URL`,
 *   `AGENT_MODEL` and `AGENT_API_KEY`.
 *
 * `AGENT_BASE_URL` / `AGENT_MODEL` / `AGENT_API_KEY` override the preset defaults.
 *
 * The environment is a parameter so this can be tested without mutating `process.env`.
 */
export function resolveModelFromEnv(env: Record<string, string | undefined>): LanguageModel {
  const provider = (env["AGENT_PROVIDER"] ?? "anthropic").trim().toLowerCase();

  if (provider === "anthropic") {
    const apiKey = env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new ModelConfigurationError("AGENT_PROVIDER='anthropic' requires ANTHROPIC_API_KEY");
    }
    // The Python side spells these "anthropic:claude-haiku-4-5" because its SDK resolves
    // "provider:model" strings; here the provider is already chosen, so strip the prefix
    // rather than making the two backends disagree about the same variable.
    const configured = env["AGENT_MODEL"] ?? DEFAULT_ANTHROPIC_MODEL;
    const modelId = configured.startsWith("anthropic:") ? configured.slice(10) : configured;
    return createAnthropic({ apiKey })(modelId);
  }

  const preset = OPENAI_COMPATIBLE[provider];
  const baseURL = env["AGENT_BASE_URL"] ?? preset?.baseURL ?? "";
  const apiKey = env["AGENT_API_KEY"] ?? (preset ? (env[preset.keyEnv] ?? "") : "");
  let modelId = env["AGENT_MODEL"] || (preset?.defaultModel ?? "");

  // One variable, two meanings: AGENT_MODEL belongs to whichever backend AGENT_PROVIDER
  // selected, so flipping the provider and forgetting the model leaves an id addressed to
  // the wrong vendor. The backend answers with a 404 that names neither variable
  // ("supported API model names are …, but you passed claude-haiku-4-5"), so fall back to
  // the preset default instead. Two spellings of a leftover id reach here:
  //
  //  - "anthropic:claude-haiku-4-5" — the Python side's "provider:model" form. A colon
  //    alone does not prove it: OpenRouter ids such as "deepseek/deepseek-r1:free" are
  //    legitimate, and there the prefix follows a slash.
  //  - "claude-haiku-4-5" — this package strips the prefix, so a bare Anthropic id is a
  //    valid thing to find in a .env file.
  //
  // This is a guard against a stale config, not model-id validation: an id belonging to
  // some third vendor still goes through and still fails at the backend.
  const head = modelId.split(":", 1)[0] ?? "";
  const looksProviderPrefixed = modelId.includes(":") && !head.includes("/");
  const looksAnthropic = modelId.startsWith("claude-");
  if (preset && (looksProviderPrefixed || looksAnthropic)) {
    modelId = preset.defaultModel;
  }

  const missing: string[] = [];
  if (!baseURL) missing.push("AGENT_BASE_URL");
  if (!modelId) missing.push("AGENT_MODEL");
  if (!apiKey) missing.push("an API key");
  if (missing.length > 0) {
    const hint = preset && !apiKey ? ` (e.g. set ${preset.keyEnv})` : "";
    throw new ModelConfigurationError(
      `AGENT_PROVIDER='${provider}' requires ${missing.join(", ")}${hint}`,
    );
  }

  // `.chat()` rather than the provider's default: DeepSeek and Gemini speak OpenAI Chat
  // Completions, not the Responses API. Same pin as `OpenAIChatCompletionsProtocol()` on
  // the Python side.
  return createOpenAI({ baseURL, apiKey }).chat(modelId);
}
