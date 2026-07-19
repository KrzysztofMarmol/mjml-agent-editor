"""Operacje na dokumencie MJML w oparciu o stabilne ID sekcji.

Sekcje (mj-section) są adresowane klasą ``sec-<id>`` w atrybucie ``css-class``
(walidator MJML odrzuca niestandardowe atrybuty, więc css-class to jedyne
legalne miejsce na metadane). mj-section nie zagnieżdża się w sobie, więc
parsowanie regexem jest wystarczające na potrzeby spike'a.
"""

from __future__ import annotations

import re
import secrets

_OPEN_RE = re.compile(r"<mj-section\b[^>]*>", re.IGNORECASE)
_CSS_CLASS_RE = re.compile(r'css-class\s*=\s*"([^"]*)"', re.IGNORECASE)
_SEC_ID_RE = re.compile(r"\bsec-([A-Za-z0-9_-]+)\b")


def new_section_id() -> str:
    return secrets.token_hex(4)


def _section_id_of(open_tag: str) -> str | None:
    m = _CSS_CLASS_RE.search(open_tag)
    if not m:
        return None
    sid = _SEC_ID_RE.search(m.group(1))
    return sid.group(1) if sid else None


def _with_section_id(open_tag: str, section_id: str) -> str:
    """Zwraca tag otwierający z doklejoną klasą sec-<id>."""
    m = _CSS_CLASS_RE.search(open_tag)
    if m:
        classes = m.group(1)
        if _SEC_ID_RE.search(classes):
            return open_tag
        updated = f'css-class="{classes} sec-{section_id}"'.strip()
        return open_tag[: m.start()] + updated + open_tag[m.end() :]
    return open_tag[: len("<mj-section")] + f' css-class="sec-{section_id}"' + open_tag[len("<mj-section") :]


def _iter_sections(mjml: str):
    """Yielduje (start, end, open_tag, section_id) dla każdej mj-section."""
    for m in _OPEN_RE.finditer(mjml):
        close = mjml.find("</mj-section>", m.end())
        if close == -1:
            continue
        end = close + len("</mj-section>")
        yield m.start(), end, m.group(0), _section_id_of(m.group(0))


def ensure_section_ids(mjml: str) -> str:
    """Dokleja sec-<id> do każdej sekcji, która go nie ma."""
    out = []
    last = 0
    for m in _OPEN_RE.finditer(mjml):
        out.append(mjml[last : m.start()])
        tag = m.group(0)
        if _section_id_of(tag) is None:
            tag = _with_section_id(tag, new_section_id())
        out.append(tag)
        last = m.end()
    out.append(mjml[last:])
    return "".join(out)


def list_sections(mjml: str) -> list[dict[str, str]]:
    """Lista sekcji: id + skrót treści (pierwsze ~120 znaków tekstu)."""
    sections = []
    for start, end, _tag, sid in _iter_sections(mjml):
        body = mjml[start:end]
        text = re.sub(r"<[^>]+>", " ", body)
        text = re.sub(r"\s+", " ", text).strip()
        sections.append({"section_id": sid or "?", "preview": text[:120]})
    return sections


def get_section(mjml: str, section_id: str) -> str | None:
    for start, end, _tag, sid in _iter_sections(mjml):
        if sid == section_id:
            return mjml[start:end]
    return None


def replace_section(mjml: str, section_id: str, new_section: str) -> str | None:
    """Podmienia sekcję, pilnując zachowania jej ID. None gdy nie znaleziono."""
    new_section = new_section.strip()
    if not new_section.lower().startswith("<mj-section"):
        raise ValueError("new_section musi być pojedynczym elementem <mj-section>...</mj-section>")
    open_m = _OPEN_RE.search(new_section)
    if open_m and _section_id_of(open_m.group(0)) != section_id:
        fixed = _with_section_id(open_m.group(0), section_id)
        # jeśli model wstawił inne sec-* — nadpisz na właściwe
        fixed = _SEC_ID_RE.sub(f"sec-{section_id}", fixed).replace(f"sec-sec-{section_id}", f"sec-{section_id}")
        new_section = new_section[: open_m.start()] + fixed + new_section[open_m.end() :]
    for start, end, _tag, sid in _iter_sections(mjml):
        if sid == section_id:
            return mjml[:start] + new_section + mjml[end:]
    return None


def insert_section(mjml: str, new_section: str, after_section_id: str | None = None) -> tuple[str, str]:
    """Wstawia nową sekcję (po podanej albo na końcu mj-body). Zwraca (mjml, id)."""
    new_section = new_section.strip()
    if not new_section.lower().startswith("<mj-section"):
        raise ValueError("new_section musi być pojedynczym elementem <mj-section>...</mj-section>")
    sid = new_section_id()
    open_m = _OPEN_RE.search(new_section)
    existing = _section_id_of(open_m.group(0)) if open_m else None
    if existing:
        sid = existing
    elif open_m:
        new_section = new_section[: open_m.start()] + _with_section_id(open_m.group(0), sid) + new_section[open_m.end() :]

    if after_section_id:
        for _start, end, _tag, s in _iter_sections(mjml):
            if s == after_section_id:
                return mjml[:end] + "\n" + new_section + mjml[end:], sid
    close_body = mjml.lower().rfind("</mj-body>")
    if close_body == -1:
        raise ValueError("dokument nie zawiera </mj-body>")
    return mjml[:close_body] + new_section + "\n" + mjml[close_body:], sid


def remove_section(mjml: str, section_id: str) -> str | None:
    for start, end, _tag, sid in _iter_sections(mjml):
        if sid == section_id:
            return mjml[:start] + mjml[end:]
    return None
