"""What in compiled HTML could run, as `@mjml-agent-editor/core`'s links.ts finds it.

The two read input the same way: ASCII-only patterns, the same tokenising of tags, the same
decoding. The link schemes come from the shared contract.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Iterable

_LINK_ATTRIBUTES = frozenset({"href", "xlink:href", "action", "formaction"})
# Elements that exist to run or embed something; an email has no use for any of them.
_RUNNING_TAGS = frozenset(
    {"script", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "animate", "set"}
)

_A = re.ASCII
_TAG_NAME = re.compile(r"[A-Za-z][^\t\n\f\r />]*", _A)
_ATTRIBUTE = re.compile(
    r"""[\t\n\f\r /]*([^\t\n\f\r />][^\t\n\f\r />=]*)"""
    r"""(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"?|'([^']*)'?|([^\t\n\f\r >]*)))?""",
    _A,
)
_SCHEME = re.compile(r"^([a-z][a-z0-9+.-]*):", re.IGNORECASE | _A)
_HANDLER = re.compile(r"^on.", _A | re.DOTALL)


def _code_point(n: int) -> str:
    # What the browser makes of a reference out of Unicode's range.
    return "�" if n > 0x10FFFF else chr(n)


def is_safe_link(value: str, schemes: Iterable[str]) -> bool:
    """Read as a browser reads an href: entities decoded, control characters ignored."""
    decoded = re.sub(
        r"&#x([0-9a-f]+);?", lambda m: _code_point(int(m[1], 16)), value, flags=re.I | _A
    )
    decoded = re.sub(r"&#([0-9]+);?", lambda m: _code_point(int(m[1])), decoded, flags=_A)
    decoded = decoded.replace("&colon;", ":")
    decoded = re.sub(r"&(Tab|NewLine);", "", decoded)
    decoded = re.sub(r"[\x00-\x20]", "", decoded)
    scheme = _SCHEME.match(decoded)
    return scheme is None or scheme[1].lower() in set(schemes)


def unsafe_markup(html: str, schemes: Iterable[str]) -> list[str]:
    """Links with another scheme, on… handlers and elements such as <script>, in order."""
    schemes = tuple(schemes)
    found: list[str] = []
    i = html.find("<")
    while i != -1:
        name = _TAG_NAME.match(html, i + 1)
        end = i + 1
        if name:
            if name[0].lower() in _RUNNING_TAGS:
                found.append(f"<{name[0].lower()}>")
            end = name.end()
            while end < len(html) and html[end] != ">":
                m = _ATTRIBUTE.match(html, end)
                if not m or m.end() == end:
                    end += 1
                    continue
                end = m.end()
                attribute = m[1].lower()
                value = next((g for g in (m[2], m[3], m[4]) if g is not None), "")
                if _HANDLER.match(attribute):
                    found.append(attribute)
                elif attribute in _LINK_ATTRIBUTES and not is_safe_link(value, schemes):
                    found.append(value)
        i = html.find("<", end)
    return found


def added_items(after: list[str], before: list[str]) -> list[str]:
    """What `after` holds more of than `before`: a write is refused only for what it adds."""
    known = Counter(before)
    added = []
    for item in after:
        if known[item] > 0:
            known[item] -= 1
        else:
            added.append(item)
    return added


def describe_items(items: list[str]) -> str:
    """Each item once, cut short, at most five, so the refusal cannot flood the model."""
    unique = list(dict.fromkeys(items))
    shown = [
        json.dumps(i if len(i) <= 60 else i[:60] + "…", ensure_ascii=False) for i in unique[:5]
    ]
    more = f" and {len(unique) - 5} more" if len(unique) > 5 else ""
    return ", ".join(shown) + more
