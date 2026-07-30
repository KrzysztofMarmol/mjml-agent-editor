"""Loads the shared tool contract so this backend cannot drift from the TypeScript one.

Descriptions and argument names live in ``packages/agent-core`` and are emitted to
``contract/tools.json`` by its build. Previously they were duplicated in Python
decorators and docstrings, which meant a change on one side silently produced two
backends that described the same tools differently to the model.

``check_signatures`` is the Python-side counterpart of the drift test in
``packages/agent-core/src/tools.test.ts``: it fails at import time if a tool's Python
signature stops matching the contract.
"""

from __future__ import annotations

import json
import os
import pathlib
from dataclasses import dataclass
from typing import Any

_DEFAULT_PATH = (
    pathlib.Path(__file__).resolve().parent.parent
    / "packages"
    / "agent-core"
    / "contract"
    / "tools.json"
)


class ContractError(RuntimeError):
    """Raised when the contract is missing or a tool has drifted from it."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]

    @property
    def required_arguments(self) -> set[str]:
        return set(self.input_schema.get("required", []))


@dataclass(frozen=True)
class Contract:
    version: int
    system_prompt: str
    tools: dict[str, ToolSpec]
    mutating_tools: frozenset[str]

    def description(self, name: str) -> str:
        try:
            return self.tools[name].description
        except KeyError:
            raise ContractError(f"tool {name!r} is not part of the contract") from None

    def check_signatures(self, signatures: dict[str, set[str]]) -> None:
        """Verifies the implemented tools match the contract exactly."""
        implemented = set(signatures)
        expected = set(self.tools)

        if implemented != expected:
            missing = sorted(expected - implemented)
            extra = sorted(implemented - expected)
            raise ContractError(
                f"tool set does not match the contract (missing: {missing}, extra: {extra})"
            )

        for name, arguments in signatures.items():
            required = self.tools[name].required_arguments
            if arguments != required:
                raise ContractError(
                    f"tool {name!r} takes {sorted(arguments)} but the contract "
                    f"requires {sorted(required)}"
                )


def load_contract(path: str | os.PathLike[str] | None = None) -> Contract:
    """Reads the contract. ``TOOLS_CONTRACT_PATH`` overrides the default location."""
    resolved = pathlib.Path(path or os.environ.get("TOOLS_CONTRACT_PATH") or _DEFAULT_PATH)
    if not resolved.exists():
        raise ContractError(
            f"tool contract not found at {resolved}. Build it with "
            "`pnpm --filter @mjml-agent-editor/core build`, or point TOOLS_CONTRACT_PATH at it."
        )

    raw = json.loads(resolved.read_text())
    tools = {
        entry["name"]: ToolSpec(
            name=entry["name"],
            description=entry["description"],
            input_schema=entry["input_schema"],
        )
        for entry in raw["tools"]
    }
    return Contract(
        version=raw["version"],
        system_prompt=raw["system_prompt"],
        tools=tools,
        mutating_tools=frozenset(raw["mutating_tools"]),
    )
