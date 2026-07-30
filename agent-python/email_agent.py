"""Email agent definition (Vercel AI SDK for Python).

The system prompt is not written here. It lives in `@mjml-agent-editor/core` and reaches
this backend through `contract/tools.json`, so both implementations instruct the model
with the same words. The Python-only argument-format workaround is applied to individual
tool descriptions in `tools.py`, not to the shared prompt.
"""

from __future__ import annotations

import os

import ai

import tools
from contract import Contract

SYSTEM: str = tools.CONTRACT.system_prompt

DEFAULT_MODEL = "anthropic:claude-haiku-4-5"

# Ceiling on tool-call rounds in a single turn. The spike had none, so a confused model
# could loop until the provider cut it off, re-sending the whole conversation each round.
DEFAULT_MAX_STEPS = 24


def get_model() -> ai.Model:
    return ai.get_model(os.environ.get("AGENT_MODEL", DEFAULT_MODEL))


def contract() -> Contract:
    return tools.CONTRACT


def build_agent(doc_id: str) -> ai.Agent:
    return ai.Agent(tools=tools.build_tools(doc_id))
