"""Agent tools. Built per request (closure over doc_id)."""

from __future__ import annotations

import base64
import json
import os
import uuid

import openai

import ai
import db
import mjml_compile
import mjml_doc

_openai_client: openai.AsyncOpenAI | None = None


def _openai() -> openai.AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = openai.AsyncOpenAI()
    return _openai_client


def _validated_save(doc_id: str, mjml: str) -> str:
    """Validates the whole document with the mjml compiler; saves only if valid."""
    ok, result = mjml_compile.compile_mjml(mjml)
    if not ok:
        return f"ERROR: MJML validation failed — document was NOT saved:\n{result}"
    db.set_document_mjml(doc_id, mjml)
    return "OK, saved."


# When the tool-call argument JSON is invalid (most often a literal newline
# or a double quote inside the `mjml` field), the Vercel AI SDK replaces the
# arguments with "{}" — fields arrive empty. Instead of failing silently we
# give the model a clear instruction.
_EMPTY_ARG_HINT = (
    "ERROR: argument arrived empty — the tool call JSON was invalid. "
    "Retry the call, passing MJML on a SINGLE line (no literal newlines) "
    "and with single-quoted attributes, e.g. <mj-section css-class='sec-x' "
    "background-color='#2e7d32'>...</mj-section>."
)


def build_tools(doc_id: str) -> list[ai.AgentTool]:
    @ai.tool
    async def get_document() -> str:
        """Returns the document's full MJML source along with the list of sections (section_id)."""
        mjml = db.get_document_mjml(doc_id)
        sections = json.dumps(mjml_doc.list_sections(mjml), ensure_ascii=False)
        return f"SECTIONS: {sections}\n\nMJML:\n{mjml}"

    @ai.tool
    async def get_section(section_id: str) -> str:
        """Returns the MJML source of a single section with the given section_id."""
        mjml = db.get_document_mjml(doc_id)
        section = mjml_doc.get_section(mjml, section_id)
        return section or f"ERROR: no section with id '{section_id}'"

    @ai.tool
    async def set_document(mjml: str = "") -> str:
        """Replaces the ENTIRE document with new MJML source (use when generating an email from scratch).

        The document must be complete (<mjml><mj-body>...</mj-body></mjml>).
        Pass MJML on a SINGLE line, with single-quoted attributes (e.g. background-color='#fff'),
        so the call's JSON stays valid. Sections without a sec-* class get one automatically.
        """
        if not mjml.strip():
            return _EMPTY_ARG_HINT
        mjml = mjml_doc.ensure_section_ids(mjml)
        return _validated_save(doc_id, mjml)

    @ai.tool
    async def set_section(section_id: str = "", mjml: str = "") -> str:
        """Replaces a single section. `mjml` is one <mj-section>...</mj-section>
        on a SINGLE line, with single-quoted attributes. Keep the section's sec-<id> class."""
        if not section_id.strip() or not mjml.strip():
            return _EMPTY_ARG_HINT
        doc = db.get_document_mjml(doc_id)
        try:
            updated = mjml_doc.replace_section(doc, section_id, mjml)
        except ValueError as e:
            return f"ERROR: {e}"
        if updated is None:
            return f"ERROR: no section with id '{section_id}'"
        return _validated_save(doc_id, updated)

    @ai.tool
    async def insert_section(mjml: str = "", after_section_id: str | None = None) -> str:
        """Inserts a new section (one <mj-section>, on a single line, single-quoted attributes)
        after the section after_section_id (or at the end of the email)."""
        if not mjml.strip():
            return _EMPTY_ARG_HINT
        doc = db.get_document_mjml(doc_id)
        try:
            updated, sid = mjml_doc.insert_section(doc, mjml, after_section_id)
        except ValueError as e:
            return f"ERROR: {e}"
        result = _validated_save(doc_id, updated)
        return f"{result} New section: {sid}" if result.startswith("OK") else result

    @ai.tool
    async def remove_section(section_id: str) -> str:
        """Removes the section with the given section_id."""
        doc = db.get_document_mjml(doc_id)
        updated = mjml_doc.remove_section(doc, section_id)
        if updated is None:
            return f"ERROR: no section with id '{section_id}'"
        return _validated_save(doc_id, updated)

    @ai.tool
    async def generate_image(prompt: str, size: str = "1536x1024") -> str:
        """Generates an image and returns a public URL to put into mj-image src.

        `prompt` in English, descriptive (style, composition, palette). `size`:
        1024x1024, 1536x1024 (landscape/hero) or 1024x1536 (portrait).

        TEMPORARY: without OPENAI_API_KEY returns a placeholder from picsum.photos
        (deterministic per prompt, correct size) — the spike works without an
        OpenAI key. When the key is set, it uses the real gpt-image model.
        """
        if not os.environ.get("OPENAI_API_KEY"):
            try:
                width, height = (int(x) for x in size.lower().split("x", 1))
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
        name = f"{doc_id}/{uuid.uuid4().hex}.png"
        url = db.upload_image(name, data)
        return url

    @ai.tool
    async def list_open_comments() -> str:
        """Returns open comments on this document's sections (id, section_id, body)."""
        comments = db.list_open_comments(doc_id)
        if not comments:
            return "No open comments."
        return json.dumps(comments, ensure_ascii=False, default=str)

    @ai.tool
    async def resolve_comment(comment_id: str) -> str:
        """Marks a comment as resolved (after applying the change it asked for)."""
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
