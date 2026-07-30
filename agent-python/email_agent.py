"""Email agent definition (Vercel AI SDK for Python).

The system prompt is not written here. It lives in `@mjml-agent-editor/core` and reaches
this backend through `contract/tools.json`, so both implementations instruct the model
with the same words. The Python-only argument-format workaround is applied to individual
tool descriptions in `tools.py`, not to the shared prompt.
"""

from __future__ import annotations

import os

import ai
from ai.providers.openai import OpenAIChatCompletionsProtocol

import tools
from contract import Contract

SYSTEM: str = tools.CONTRACT.system_prompt

DEFAULT_MODEL = "anthropic:claude-haiku-4-5"

# OpenAI-compatible backends: provider name → (base_url, default_model, key_env).
# Both DeepSeek and Gemini expose an OpenAI-compatible Chat Completions endpoint, which
# is the cheapest way to reach either without a second SDK.
_OPENAI_COMPAT: dict[str, tuple[str, str, str]] = {
    "deepseek": (
        "https://api.deepseek.com",
        "deepseek-chat",
        "DEEPSEEK_API_KEY",
    ),
    "gemini": (
        "https://generativelanguage.googleapis.com/v1beta/openai/",
        "gemini-2.5-flash",
        "GEMINI_API_KEY",
    ),
}

# Ceiling on tool-call rounds in a single turn. The spike had none, so a confused model
# could loop until the provider cut it off, re-sending the whole conversation each round.
DEFAULT_MAX_STEPS = 24


def get_model() -> ai.Model:
    """Resolve the agent model from the environment.

    `AGENT_PROVIDER` selects the backend:

    - `anthropic` (default): `AGENT_MODEL` (a `provider:model` id) with
      `ANTHROPIC_API_KEY`.
    - `deepseek`: `deepseek-chat` via api.deepseek.com with `DEEPSEEK_API_KEY`.
    - `gemini`: `gemini-2.5-flash` via Google's OpenAI-compatible endpoint with
      `GEMINI_API_KEY`.
    - anything else: a custom OpenAI-compatible backend — set `AGENT_BASE_URL`,
      `AGENT_MODEL` and `AGENT_API_KEY`.

    `AGENT_BASE_URL` / `AGENT_MODEL` / `AGENT_API_KEY` override the preset defaults.
    """
    provider = os.environ.get("AGENT_PROVIDER", "anthropic").strip().lower()

    if provider == "anthropic":
        return ai.get_model(os.environ.get("AGENT_MODEL", DEFAULT_MODEL))

    base_url, default_model, key_env = _OPENAI_COMPAT.get(provider, ("", "", ""))
    base_url = os.environ.get("AGENT_BASE_URL", base_url)
    model_id = os.environ.get("AGENT_MODEL") or default_model
    # One variable, two meanings: AGENT_MODEL belongs to whichever backend AGENT_PROVIDER
    # selected, so flipping the provider and forgetting the model leaves an id addressed
    # to the wrong vendor. The backend answers with a 404 that names neither variable, so
    # fall back to the preset default instead. Two spellings of a leftover id reach here:
    #
    #   - "anthropic:claude-haiku-4-5" — the "provider:model" form this SDK resolves. A
    #     colon alone does not prove it: OpenRouter ids such as
    #     "deepseek/deepseek-r1:free" are legitimate, and there the prefix follows a slash.
    #   - "claude-haiku-4-5" — the TypeScript backend accepts a bare id, so a shared .env
    #     can hold one.
    #
    # This is a guard against a stale config, not model-id validation: an id belonging to
    # some third vendor still goes through and still fails at the backend.
    head = model_id.split(":", 1)[0]
    looks_provider_prefixed = ":" in model_id and "/" not in head
    looks_anthropic = model_id.startswith("claude-")
    if default_model and (looks_provider_prefixed or looks_anthropic):
        model_id = default_model
    api_key = os.environ.get("AGENT_API_KEY") or (os.environ.get(key_env, "") if key_env else "")

    missing = [
        name
        for name, value in (
            ("AGENT_BASE_URL", base_url),
            ("AGENT_MODEL", model_id),
            ("an API key", api_key),
        )
        if not value
    ]
    if missing:
        hint = f" (e.g. set {key_env})" if key_env and not api_key else ""
        raise ai.ConfigurationError(
            f"AGENT_PROVIDER='{provider}' requires {', '.join(missing)}{hint}"
        )

    # DeepSeek and Gemini speak OpenAI Chat Completions, not the Responses API that the
    # plain "openai" provider defaults to, so pin the protocol explicitly.
    prov = ai.get_provider(
        "openai",
        base_url=base_url,
        api_key=api_key,
        protocol=OpenAIChatCompletionsProtocol(),
    )
    return ai.Model(id=model_id, provider=prov)


def contract() -> Contract:
    return tools.CONTRACT


def build_agent(doc_id: str) -> ai.Agent:
    return ai.Agent(tools=tools.build_tools(doc_id))
