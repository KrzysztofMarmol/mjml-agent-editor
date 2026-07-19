"""Narzędzia agenta. Budowane per żądanie (closure na doc_id)."""

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
    """Waliduje cały dokument kompilatorem mjml; zapisuje tylko poprawny."""
    ok, result = mjml_compile.compile_mjml(mjml)
    if not ok:
        return f"BŁĄD walidacji MJML — dokument NIE został zapisany:\n{result}"
    db.set_document_mjml(doc_id, mjml)
    return "OK, zapisano."


def build_tools(doc_id: str) -> list[ai.AgentTool]:
    @ai.tool
    async def get_document() -> str:
        """Zwraca pełne źródło MJML dokumentu wraz z listą sekcji (section_id)."""
        mjml = db.get_document_mjml(doc_id)
        sections = json.dumps(mjml_doc.list_sections(mjml), ensure_ascii=False)
        return f"SEKCJE: {sections}\n\nMJML:\n{mjml}"

    @ai.tool
    async def get_section(section_id: str) -> str:
        """Zwraca źródło MJML pojedynczej sekcji o podanym section_id."""
        mjml = db.get_document_mjml(doc_id)
        section = mjml_doc.get_section(mjml, section_id)
        return section or f"BŁĄD: brak sekcji o id '{section_id}'"

    @ai.tool
    async def set_document(mjml: str) -> str:
        """Zastępuje CAŁY dokument nowym źródłem MJML (użyj przy generowaniu maila od zera).

        Dokument musi być kompletny (<mjml><mj-body>...</mj-body></mjml>).
        Sekcje bez klasy sec-* dostaną ją automatycznie.
        """
        mjml = mjml_doc.ensure_section_ids(mjml)
        return _validated_save(doc_id, mjml)

    @ai.tool
    async def set_section(section_id: str, mjml: str) -> str:
        """Podmienia jedną sekcję. `mjml` to pojedynczy element <mj-section>...</mj-section>."""
        doc = db.get_document_mjml(doc_id)
        try:
            updated = mjml_doc.replace_section(doc, section_id, mjml)
        except ValueError as e:
            return f"BŁĄD: {e}"
        if updated is None:
            return f"BŁĄD: brak sekcji o id '{section_id}'"
        return _validated_save(doc_id, updated)

    @ai.tool
    async def insert_section(mjml: str, after_section_id: str | None = None) -> str:
        """Wstawia nową sekcję po sekcji after_section_id (albo na końcu maila)."""
        doc = db.get_document_mjml(doc_id)
        try:
            updated, sid = mjml_doc.insert_section(doc, mjml, after_section_id)
        except ValueError as e:
            return f"BŁĄD: {e}"
        result = _validated_save(doc_id, updated)
        return f"{result} Nowa sekcja: {sid}" if result.startswith("OK") else result

    @ai.tool
    async def remove_section(section_id: str) -> str:
        """Usuwa sekcję o podanym section_id."""
        doc = db.get_document_mjml(doc_id)
        updated = mjml_doc.remove_section(doc, section_id)
        if updated is None:
            return f"BŁĄD: brak sekcji o id '{section_id}'"
        return _validated_save(doc_id, updated)

    @ai.tool
    async def generate_image(prompt: str, size: str = "1536x1024") -> str:
        """Generuje obraz (OpenAI) i zwraca publiczny URL do wstawienia w mj-image src.

        `prompt` po angielsku, opisowy (styl, kompozycja, paleta). `size`:
        1024x1024, 1536x1024 (landscape/hero) lub 1024x1536 (portrait).
        """
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
        """Zwraca otwarte komentarze do sekcji tego dokumentu (id, section_id, body)."""
        comments = db.list_open_comments(doc_id)
        if not comments:
            return "Brak otwartych komentarzy."
        return json.dumps(comments, ensure_ascii=False, default=str)

    @ai.tool
    async def resolve_comment(comment_id: str) -> str:
        """Oznacza komentarz jako rozwiązany (po wprowadzeniu zmiany, o którą prosił)."""
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
