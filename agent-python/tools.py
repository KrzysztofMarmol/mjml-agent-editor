"""Agent tools, built per request as closures over doc_id.

Descriptions come from the shared contract rather than from docstrings here, so this
backend and the TypeScript one describe the same tools to the model in the same words.
The signatures are checked against the contract at import time.

Unlike the TypeScript implementation, the argument-format hint stays: the Vercel AI SDK
for Python replaces malformed tool-call argument JSON with ``{}``, so the model has to be
told to keep MJML on one line. That was measured to be unnecessary on the TypeScript SDK,
which parses streamed arguments incrementally — see ``docs/agent-contract.md``.
"""

from __future__ import annotations

import base64
import json
import os
import uuid

import ai
import openai

import db
import mjml_compile
import mjml_doc
from contract import load_contract

CONTRACT = load_contract()

_openai_client: openai.AsyncOpenAI | None = None


def _openai() -> openai.AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = openai.AsyncOpenAI()
    return _openai_client


# Appended to the description of every tool that takes MJML. See the module docstring.
_ARGUMENT_FORMAT_HINT = (
    "\n\nPass MJML on a SINGLE line (no literal newlines) and write attributes with "
    "single quotes, e.g. background-color='#2e7d32', so the tool-call JSON stays valid."
)

_MJML_ARGUMENT_TOOLS = frozenset({"set_document", "set_section", "insert_section"})


def _described(name: str):
    """Decorator that sources the tool's description from the shared contract."""

    def decorate(fn):
        description = CONTRACT.description(name)
        if name in _MJML_ARGUMENT_TOOLS:
            description += _ARGUMENT_FORMAT_HINT
        fn.__doc__ = description
        return ai.tool(fn)

    return decorate


# When the argument JSON is invalid the SDK hands the tool empty values instead of
# failing, so a clear instruction is the only way for the model to recover.
_EMPTY_ARG_HINT = (
    "ERROR: argument arrived empty — the tool call JSON was invalid. Retry the call, "
    "passing MJML on a SINGLE line (no literal newlines) and with single-quoted "
    "attributes, e.g. <mj-section css-class='sec-x' background-color='#2e7d32'>...</mj-section>."
)


def _validated_save(doc_id: str, mjml: str) -> str:
    """Compiles the whole document and saves only if it is valid."""
    ok, result = mjml_compile.compile_mjml(mjml)
    if not ok:
        return f"ERROR: MJML validation failed — document was NOT saved:\n{result}"
    db.set_document_mjml(doc_id, mjml)
    return "OK, saved."


def build_tools(doc_id: str) -> list[ai.AgentTool]:
    @_described("get_document")
    async def get_document() -> str:
        mjml = db.get_document_mjml(doc_id)
        sections = json.dumps(mjml_doc.list_sections(mjml), ensure_ascii=False)
        return f"SECTIONS: {sections}\n\nMJML:\n{mjml}"

    @_described("get_section")
    async def get_section(section_id: str) -> str:
        mjml = db.get_document_mjml(doc_id)
        section = mjml_doc.get_section(mjml, section_id)
        return section or f"ERROR: no section with id '{section_id}'"

    @_described("set_document")
    async def set_document(mjml: str = "") -> str:
        if not mjml.strip():
            return _EMPTY_ARG_HINT
        try:
            return _validated_save(doc_id, mjml_doc.ensure_section_ids(mjml))
        except mjml_doc.MjmlDocumentError as error:
            return f"ERROR: {error}"

    @_described("set_section")
    async def set_section(section_id: str = "", mjml: str = "") -> str:
        if not section_id.strip() or not mjml.strip():
            return _EMPTY_ARG_HINT
        doc = db.get_document_mjml(doc_id)
        try:
            updated = mjml_doc.replace_section(doc, section_id, mjml)
        except mjml_doc.MjmlDocumentError as error:
            return f"ERROR: {error}"
        if updated is None:
            return f"ERROR: no section with id '{section_id}'"
        return _validated_save(doc_id, updated)

    @_described("insert_section")
    async def insert_section(mjml: str = "", after_section_id: str | None = None) -> str:
        if not mjml.strip():
            return _EMPTY_ARG_HINT
        doc = db.get_document_mjml(doc_id)
        try:
            updated, section_id = mjml_doc.insert_section(doc, mjml, after_section_id)
        except mjml_doc.MjmlDocumentError as error:
            return f"ERROR: {error}"
        result = _validated_save(doc_id, updated)
        return f"{result} New section: {section_id}" if result.startswith("OK") else result

    @_described("remove_section")
    async def remove_section(section_id: str) -> str:
        doc = db.get_document_mjml(doc_id)
        updated = mjml_doc.remove_section(doc, section_id)
        if updated is None:
            return f"ERROR: no section with id '{section_id}'"
        return _validated_save(doc_id, updated)

    @_described("generate_image")
    async def generate_image(prompt: str, size: str = "1536x1024") -> str:
        # Image mode is explicit. The spike inferred "placeholder" from a missing
        # OPENAI_API_KEY, so a misconfigured deployment silently began paying for the
        # most expensive call in the system.
        if os.environ.get("IMAGE_MODE", "placeholder") != "generate":
            try:
                width, height = (int(part) for part in size.lower().split("x", 1))
            except ValueError:
                width, height = 1536, 1024
            seed = uuid.uuid5(uuid.NAMESPACE_URL, prompt).hex[:12]
            return f"https://picsum.photos/seed/{seed}/{width}/{height}"

        result = await _openai().images.generate(
            model=os.environ.get("IMAGE_MODEL", "gpt-image-2"),
            prompt=prompt,
            size=size,
            quality=os.environ.get("IMAGE_QUALITY", "low"),
        )
        data = base64.b64decode(result.data[0].b64_json)
        return db.upload_image(f"{doc_id}/{uuid.uuid4().hex}.png", data)

    @_described("list_open_comments")
    async def list_open_comments() -> str:
        comments = db.list_open_comments(doc_id)
        if not comments:
            return "No open comments."
        return json.dumps(comments, ensure_ascii=False, default=str)

    @_described("resolve_comment")
    async def resolve_comment(comment_id: str) -> str:
        db.resolve_comment(comment_id)
        return "OK"

    return [
        get_document,
        get_section,
        set_document,
        set_section,
        insert_section,
        remove_section,
        generate_image,
        list_open_comments,
        resolve_comment,
    ]


def _implemented_signatures() -> dict[str, set[str]]:
    """Argument names of each tool, for the contract check below."""
    import inspect

    return {
        tool.name: set(inspect.signature(tool.fn).parameters)
        for tool in build_tools("contract-check")
    }


# Fails at import rather than at the first agent turn if a signature has drifted.
CONTRACT.check_signatures(_implemented_signatures())
