"""Operations on an MJML document addressed by stable section ids.

Sections carry a ``sec-<id>`` class in ``css-class`` because the MJML validator rejects
non-standard attributes, so that is the only legal place to keep metadata.

This mirrors ``packages/agent-core/src/mjml-document.ts`` behaviour for behaviour — the
two implementations must agree or the conformance suite is meaningless. The original
version here parsed with plain regexes and two of those shortcuts corrupt documents on
real model output:

* Tag boundaries came from ``[^>]*>``, which ends the tag at the first ``>`` even when it
  sits inside an attribute value (``alt="Save > 50%"``).
* The closing tag came from ``find("</mj-section>")``, so the first close won regardless
  of nesting. Valid MJML never nests ``mj-section``, but malformed model output does, and
  the naive scan then produced overlapping spans and wrote a mangled document.

Ids are 8 lowercase hex characters, matching the TypeScript generator, so documents stay
readable across both backends.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

SECTION_TAG = "mj-section"
OPEN_PREFIX = f"<{SECTION_TAG}"
CLOSE_PREFIX = f"</{SECTION_TAG}"
BODY_CLOSE = "</mj-body>"
SECTION_PREFIX = "sec"
OBJECT_PREFIX = "obj"

PREVIEW_LENGTH = 120

_CSS_CLASS_ATTR = re.compile(r"""css-class\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)
_ID_CHARS = re.compile(r"^[A-Za-z0-9_-]+$")


class MjmlDocumentError(ValueError):
    """Malformed input the caller is expected to surface to the model."""


def new_section_id() -> str:
    return secrets.token_hex(4)


@dataclass(frozen=True)
class SectionSpan:
    """One ``mj-section`` element located in the source."""

    id: str | None
    start: int
    end: int
    open_tag_end: int


def _id_of_token(token: str, prefix: str) -> str | None:
    marker = f"{prefix}-"
    if not token.startswith(marker):
        return None
    value = token[len(marker) :]
    return value if value and _ID_CHARS.match(value) else None


def read_id_from_class_list(css_class: str | None, prefix: str) -> str | None:
    for token in (css_class or "").split():
        found = _id_of_token(token, prefix)
        if found is not None:
            return found
    return None


def set_id_in_class_list(css_class: str | None, prefix: str, value: str) -> str:
    """Forces exactly this id for the prefix, dropping any other ``<prefix>-*`` token."""
    tokens = [t for t in (css_class or "").split() if _id_of_token(t, prefix) is None]
    tokens.append(f"{prefix}-{value}")
    return " ".join(tokens)


def _tag_end(source: str, start: int) -> int:
    """Index just past the ``>`` closing the tag at ``start``, honouring quotes."""
    quote: str | None = None
    for index in range(start, len(source)):
        char = source[index]
        if quote is not None:
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
            continue
        if char == ">":
            return index + 1
    return -1


def _is_tag_boundary(lower: str, index: int, prefix_length: int) -> bool:
    after = lower[index + prefix_length : index + prefix_length + 1]
    return after == "" or after in (">", "/") or after.isspace()


def _index_of_tag(lower: str, prefix: str, start: int) -> int:
    cursor = start
    while True:
        index = lower.find(prefix, cursor)
        if index == -1:
            return -1
        if _is_tag_boundary(lower, index, len(prefix)):
            return index
        cursor = index + 1


def _is_self_closing(source: str, start: int, end: int) -> bool:
    return source[start:end].rstrip().endswith("/>")


def _css_class_of(open_tag: str) -> str | None:
    match = _CSS_CLASS_ATTR.search(open_tag)
    return match.group(2) if match else None


def _find_matching_close(source: str, lower: str, start: int) -> int:
    depth = 1
    cursor = start
    while depth > 0:
        next_open = _index_of_tag(lower, OPEN_PREFIX, cursor)
        next_close = _index_of_tag(lower, CLOSE_PREFIX, cursor)
        if next_close == -1:
            return -1

        if next_open != -1 and next_open < next_close:
            open_end = _tag_end(source, next_open)
            if open_end == -1:
                return -1
            if not _is_self_closing(source, next_open, open_end):
                depth += 1
            cursor = open_end
            continue

        close_end = _tag_end(source, next_close)
        if close_end == -1:
            return -1
        depth -= 1
        cursor = close_end
        if depth == 0:
            return close_end
    return -1


def scan_sections(mjml: str) -> list[SectionSpan]:
    """Locates every top-level ``mj-section``; nested ones fold into their parent."""
    lower = mjml.lower()
    spans: list[SectionSpan] = []
    cursor = 0

    while cursor < len(mjml):
        start = _index_of_tag(lower, OPEN_PREFIX, cursor)
        if start == -1:
            break
        open_tag_end = _tag_end(mjml, start)
        if open_tag_end == -1:
            break

        section_id = read_id_from_class_list(
            _css_class_of(mjml[start:open_tag_end]), SECTION_PREFIX
        )

        if _is_self_closing(mjml, start, open_tag_end):
            spans.append(SectionSpan(section_id, start, open_tag_end, open_tag_end))
            cursor = open_tag_end
            continue

        end = _find_matching_close(mjml, lower, open_tag_end)
        if end == -1:
            break

        spans.append(SectionSpan(section_id, start, end, open_tag_end))
        cursor = end

    return spans


def _open_tag_with_section_id(open_tag: str, section_id: str) -> str:
    match = _CSS_CLASS_ATTR.search(open_tag)
    if match:
        updated = set_id_in_class_list(match.group(2), SECTION_PREFIX, section_id)
        return open_tag[: match.start()] + f'css-class="{updated}"' + open_tag[match.end() :]
    return (
        open_tag[: len(OPEN_PREFIX)]
        + f' css-class="{SECTION_PREFIX}-{section_id}"'
        + open_tag[len(OPEN_PREFIX) :]
    )


def _to_plain_text(fragment: str) -> str:
    """Strips tags, honouring quoted attribute values, and collapses whitespace."""
    out: list[str] = []
    cursor = 0
    while True:
        open_index = fragment.find("<", cursor)
        if open_index == -1:
            out.append(fragment[cursor:])
            break
        out.append(fragment[cursor:open_index])
        close_index = _tag_end(fragment, open_index)
        if close_index == -1:
            break
        out.append(" ")
        cursor = close_index
    return re.sub(r"\s+", " ", "".join(out)).strip()


def ensure_section_ids(mjml: str) -> str:
    """Appends ``sec-<id>`` to every section that lacks one."""
    out: list[str] = []
    cursor = 0
    for span in scan_sections(mjml):
        if span.id is not None:
            continue
        open_tag = mjml[span.start : span.open_tag_end]
        out.append(mjml[cursor : span.start])
        out.append(_open_tag_with_section_id(open_tag, new_section_id()))
        cursor = span.open_tag_end
    out.append(mjml[cursor:])
    return "".join(out)


def list_sections(mjml: str) -> list[dict[str, str]]:
    """Section ids plus a short text excerpt, for orienting the model."""
    return [
        {
            "section_id": span.id or "?",
            "preview": _to_plain_text(mjml[span.start : span.end])[:PREVIEW_LENGTH],
        }
        for span in scan_sections(mjml)
    ]


def get_section(mjml: str, section_id: str) -> str | None:
    for span in scan_sections(mjml):
        if span.id == section_id:
            return mjml[span.start : span.end]
    return None


def _assert_single_section(fragment: str) -> str:
    """Verifies the fragment is exactly one section and nothing else.

    The original only checked ``startswith("<mj-section")``, which let two concatenated
    sections through ``set_section``; they then shared one id and the next edit hit the
    wrong element.
    """
    trimmed = fragment.strip()
    spans = scan_sections(trimmed)
    if len(spans) != 1 or spans[0].start != 0 or spans[0].end != len(trimmed):
        raise MjmlDocumentError(f"expected exactly one <{SECTION_TAG}>...</{SECTION_TAG}> element")
    return trimmed


def replace_section(mjml: str, section_id: str, new_section: str) -> str | None:
    """Replaces a section, forcing it to keep the target id. None when unknown."""
    replacement = _assert_single_section(new_section)
    open_end = _tag_end(replacement, 0)
    if open_end == -1:
        raise MjmlDocumentError("replacement section has no closing `>`")

    with_id = _open_tag_with_section_id(replacement[:open_end], section_id) + replacement[open_end:]

    for span in scan_sections(mjml):
        if span.id == section_id:
            return mjml[: span.start] + with_id + mjml[span.end :]
    return None


def insert_section(
    mjml: str, new_section: str, after_section_id: str | None = None
) -> tuple[str, str]:
    """Inserts after ``after_section_id`` or at the end of the body. Returns (mjml, id)."""
    section = _assert_single_section(new_section)
    open_end = _tag_end(section, 0)
    if open_end == -1:
        raise MjmlDocumentError("new section has no closing `>`")

    existing = read_id_from_class_list(_css_class_of(section[:open_end]), SECTION_PREFIX)
    section_id = existing or new_section_id()
    with_id = (
        section
        if existing
        else _open_tag_with_section_id(section[:open_end], section_id) + section[open_end:]
    )

    if after_section_id:
        for span in scan_sections(mjml):
            if span.id == after_section_id:
                return mjml[: span.end] + "\n" + with_id + mjml[span.end :], section_id

    body_close = mjml.lower().rfind(BODY_CLOSE)
    if body_close == -1:
        raise MjmlDocumentError(f"document contains no {BODY_CLOSE}")
    return mjml[:body_close] + with_id + "\n" + mjml[body_close:], section_id


def remove_section(mjml: str, section_id: str) -> str | None:
    for span in scan_sections(mjml):
        if span.id == section_id:
            return mjml[: span.start] + mjml[span.end :]
    return None
