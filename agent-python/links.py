"""Links an email may not hold, as `@mjml-agent-editor/core`'s links.ts finds them.

The schemes come from the shared contract, so both backends refuse the same links.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

_TAG = re.compile(r"""<[a-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>""", re.IGNORECASE)
_LINK = re.compile(
    r"""[\s/"'](?:xlink:)?(?:href|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""",
    re.IGNORECASE,
)
_NAVBAR = re.compile(
    r"""<mj-navbar\b((?:[^>"']|"[^"]*"|'[^']*')*)>(.*?)</mj-navbar\s*>""",
    re.IGNORECASE | re.DOTALL,
)
_BASE_URL = re.compile(r"""[\s"']base-url\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", re.IGNORECASE)
_SCHEME = re.compile(r"^([a-z][a-z0-9+.-]*):", re.IGNORECASE)


def is_safe_link(value: str, schemes: Iterable[str]) -> bool:
    """Read as a browser reads an href: entities decoded, control characters ignored."""
    decoded = re.sub(r"&#x([0-9a-f]+);?", lambda m: chr(int(m[1], 16)), value, flags=re.I)
    decoded = re.sub(r"&#(\d+);?", lambda m: chr(int(m[1])), decoded)
    decoded = decoded.replace("&colon;", ":")
    decoded = re.sub(r"&(Tab|NewLine);", "", decoded)
    decoded = re.sub(r"[\x00-\x20]", "", decoded)
    scheme = _SCHEME.match(decoded)
    return scheme is None or scheme[1].lower() in set(schemes)


def _value(m: re.Match[str] | None) -> str:
    return next((g for g in m.groups() if g is not None), "") if m else ""


def _links_in(markup: str) -> list[str]:
    # Inside tags only: a text that mentions `href=` is not a link.
    return [_value(m) for tag in _TAG.findall(markup) for m in _LINK.finditer(tag)]


def unsafe_links(mjml: str, schemes: Iterable[str]) -> list[str]:
    schemes = tuple(schemes)
    source = re.sub(r"<!--.*?-->", "", mjml, flags=re.DOTALL)
    found = [link for link in _links_in(source) if not is_safe_link(link, schemes)]
    # A navigation link is the bar's base-url followed by its href, so they are joined.
    for attributes, inner in _NAVBAR.findall(source):
        base = _value(_BASE_URL.search(attributes))
        if not is_safe_link(base, schemes):
            found.append(base)
        for href in _links_in(inner):
            if is_safe_link(href, schemes) and not is_safe_link(base + href, schemes):
                found.append(base + href)
    return found


def added_unsafe_links(before: str, after: str, schemes: Iterable[str]) -> list[str]:
    """Only additions: a document that already holds one stays writable."""
    known = unsafe_links(before, schemes)
    added = []
    for link in unsafe_links(after, schemes):
        if link in known:
            known.remove(link)
        else:
            added.append(link)
    return added
