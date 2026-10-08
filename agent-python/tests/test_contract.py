"""The Python-side counterpart of the TypeScript drift test.

`packages/agent-core` owns tool names, descriptions and argument shapes. These tests fail
if this backend stops matching them, which is the only thing making "two implementations
of one contract" a fact rather than a claim.
"""

from __future__ import annotations

import asyncio

import pytest

import tools
from contract import ContractError, load_contract


class _Reviewer:
    def __init__(self) -> None:
        self.requests: list[tools.EmailVisualReviewRequest] = []

    async def review(self, request: tools.EmailVisualReviewRequest) -> str:
        self.requests.append(request)
        return "Looks balanced."


def _inspect(reviewer: _Reviewer):
    built = {tool.name: tool for tool in tools.build_tools("doc-1", reviewer)}
    return built["inspect_rendered_email"].fn


@pytest.fixture(scope="module")
def contract():
    return load_contract()


class TestContractFile:
    def test_loads_and_is_version_1(self, contract) -> None:
        assert contract.version == 1

    def test_declares_all_ten_tools(self, contract) -> None:
        assert set(contract.tools) == {
            "get_document",
            "get_section",
            "set_document",
            "set_section",
            "insert_section",
            "remove_section",
            "generate_image",
            "inspect_rendered_email",
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
        built = {tool.name for tool in tools.build_tools("doc-1", _Reviewer())}
        assert built == set(contract.tools)

    def test_visual_review_is_offered_only_with_a_reviewer(self) -> None:
        built = {tool.name for tool in tools.build_tools("doc-1")}
        assert "inspect_rendered_email" not in built

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


class TestInspectRenderedEmail:
    @pytest.fixture(autouse=True)
    def document(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(tools.db, "get_document_mjml", lambda doc_id: "<mjml>doc</mjml>")

    def test_reviews_the_compiled_document(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))
        reviewer = _Reviewer()

        assert asyncio.run(_inspect(reviewer)()) == "Looks balanced."
        assert reviewer.requests == [
            tools.EmailVisualReviewRequest(
                document_id="doc-1", mjml="<mjml>doc</mjml>", html="<html/>"
            )
        ]

    def test_does_not_review_a_document_that_fails_to_compile(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (False, "bad tag"))
        reviewer = _Reviewer()

        result = asyncio.run(_inspect(reviewer)())

        assert result.startswith("ERROR: MJML validation failed")
        assert "bad tag" in result
        assert reviewer.requests == []

    def test_reports_reviewer_failures_to_the_model(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))

        class Failing:
            async def review(self, request: tools.EmailVisualReviewRequest) -> str:
                raise RuntimeError("renderer down")

        built = {tool.name: tool for tool in tools.build_tools("doc-1", Failing())}
        assert asyncio.run(built["inspect_rendered_email"].fn()) == "ERROR: renderer down"
