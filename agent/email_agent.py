"""Email agent definition (Vercel AI SDK for Python)."""

from __future__ import annotations

import os

import ai
from ai.providers.openai import OpenAIChatCompletionsProtocol

import tools

SYSTEM = """\
You are a marketing-email designer agent. You work on an MJML document shared
with the user's visual editor (GrapesJS). Respond in the user's language (match
the language of the conversation), concisely — the user sees the result in the
editor, so do not paste MJML into your replies.

DOCUMENT RULES:
- The document is valid MJML: <mjml><mj-body>...</mj-body></mjml>, 600px wide.
- Every <mj-section> has a stable identifier in css-class: "sec-<id>".
  NEVER remove or change existing sec-* classes — they are anchors for
  comments and the editor. When replacing a section, keep its sec-<id>.
- Always start by calling get_document (learn the current state and section_id).
- For targeted changes use set_section / insert_section / remove_section.
  Use set_document only when creating an email from scratch.
- Write tools validate MJML — if you get a validation error, fix the
  source and try again.

MJML ARGUMENT FORMAT (IMPORTANT — otherwise the call breaks):
- Pass MJML in tool arguments on a SINGLE line — no literal newlines
  inside the value (they break the call's JSON).
- Write attributes with SINGLE QUOTES, not double quotes: background-color='#2e7d32',
  css-class='sec-cta'. Single quotes do not clash with the JSON double quotes.
- If a tool returns an error about an empty argument / invalid JSON — retry
  the call following the rules above.

GENERATING AN EMAIL FROM SCRATCH (description + data from the user):
1. Design the structure: hero, content/product sections, CTA, footer.
2. Generate images with the generate_image tool (hero 1536x1024, products
   1024x1024) and put the returned URLs into mj-image. Never invent image URLs.
3. Save everything via set_document. Consistent palette, readable typography,
   mj-button buttons with a clear CTA.

APPLYING FIXES FROM COMMENTS:
1. list_open_comments → for each comment call get_section(section_id).
2. A comment may concern the whole section or a specific element:
   - object_id = null → the change concerns the whole section.
   - object_id set (e.g. "ab12cd") → the change concerns ONLY the element with
     class obj-<object_id> inside that section (object_label describes it).
     Change only that element, leave the rest of the section untouched, and
     keep its obj-<id> class.
3. Apply the change requested by the comment via set_section (pass the whole
   section with the fix applied).
4. After a successful change mark the comment with resolve_comment(id).
5. Finally, briefly summarize what you changed for each comment.
"""


# OpenAI-compatible backends: provider name → (base_url, default_model, key_env).
# DeepSeek and Gemini both expose an OpenAI-compatible Chat Completions endpoint.
_OPENAI_COMPAT = {
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


def get_model() -> ai.Model:
    """Resolve the agent model from the environment.

    AGENT_PROVIDER selects the backend:
      - "anthropic" (default): AGENT_MODEL (default "anthropic:claude-sonnet-5")
        with ANTHROPIC_API_KEY.
      - "deepseek": deepseek-chat via api.deepseek.com with DEEPSEEK_API_KEY.
      - "gemini": gemini-2.5-flash via Google's OpenAI-compatible endpoint with
        GEMINI_API_KEY.
      - any other value: a custom OpenAI-compatible backend — set AGENT_BASE_URL,
        AGENT_MODEL and AGENT_API_KEY.

    AGENT_MODEL / AGENT_BASE_URL / AGENT_API_KEY override the preset defaults.
    """
    provider = os.environ.get("AGENT_PROVIDER", "anthropic").strip().lower()

    if provider == "anthropic":
        return ai.get_model(os.environ.get("AGENT_MODEL", "anthropic:claude-sonnet-5"))

    base_url, default_model, key_env = _OPENAI_COMPAT.get(provider, (None, None, None))
    base_url = os.environ.get("AGENT_BASE_URL", base_url)
    model_id = os.environ.get("AGENT_MODEL") or default_model
    # Ignore a leftover "provider:model" id (e.g. "anthropic:...") from an earlier
    # config — OpenAI-compatible model ids have no "provider:" prefix.
    if model_id and ":" in model_id:
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

    # DeepSeek/Gemini speak OpenAI Chat Completions (not the Responses API that
    # the plain "openai" provider defaults to), so pin the protocol explicitly.
    prov = ai.get_provider(
        "openai",
        base_url=base_url,
        api_key=api_key,
        protocol=OpenAIChatCompletionsProtocol(),
    )
    return ai.Model(id=model_id, provider=prov)


def build_agent(doc_id: str) -> ai.Agent:
    return ai.Agent(tools=tools.build_tools(doc_id))
