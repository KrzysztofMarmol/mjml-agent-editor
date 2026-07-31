"""The Python-side counterpart of the TypeScript drift test.

`packages/agent-core` owns tool names, descriptions and argument shapes. These tests fail
if this backend stops matching them, which is the only thing making "two implementations
of one contract" a fact rather than a claim.
"""

from __future__ import annotations

import pytest

import tools
from contract import ContractError, load_contract


@pytest.fixture(scope="module")
def contract():
    return load_contract()


class TestContractFile:
    def test_loads_and_is_version_1(self, contract) -> None:
        assert contract.version == 1

    def test_declares_all_nine_tools(self, contract) -> None:
        assert set(contract.tools) == {
            "get_document",
            "get_section",
            "set_document",
            "set_section",
            "insert_section",
            "remove_section",
            "generate_image",
            "list_open_comments",
            "resolve_comment",
        }

    def test_carries_the_shared_system_prompt(self, contract) -> None:
        assert "sec-" in contract.system_prompt
        assert len(contract.system_prompt) > 500

    def test_shared_prompt_excludes_the_python_only_workaround(self, contract) -> None:
        # The hint belongs on individual tool descriptions here, not in the prompt both
        # backends share.
        assert "SINGLE line" not in contract.system_prompt

    def test_reports_a_missing_file_clearly(self) -> None:
        with pytest.raises(ContractError, match="not found"):
            load_contract("/nonexistent/tools.json")


class TestImplementationMatchesContract:
    def test_tool_names_match(self, contract) -> None:
        built = {tool.name for tool in tools.build_tools("doc-1")}
        assert built == set(contract.tools)

    def test_descriptions_come_from_the_contract(self, contract) -> None:
        built = {tool.name: tool.tool.spec.description for tool in tools.build_tools("doc-1")}
        # get_section takes no MJML, so its description is the contract text verbatim.
        assert built["get_section"] == contract.description("get_section")

    def test_mjml_tools_carry_the_python_only_hint(self) -> None:
        built = {tool.name: tool.tool.spec.description for tool in tools.build_tools("doc-1")}
        for name in ("set_document", "set_section", "insert_section"):
            assert "SINGLE line" in built[name], name
        for name in ("get_document", "get_section", "remove_section"):
            assert "SINGLE line" not in built[name], name

    def test_signature_drift_is_detected(self, contract) -> None:
        with pytest.raises(ContractError, match="does not match the contract"):
            contract.check_signatures({"get_document": set()})

    def test_argument_drift_is_detected(self, contract) -> None:
        signatures = {name: spec.required_arguments for name, spec in contract.tools.items()}
        signatures["get_section"] = {"wrong_argument"}
        with pytest.raises(ContractError, match="get_section"):
            contract.check_signatures(signatures)
