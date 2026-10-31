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
# Elements that exist to run or embed something, and SVG and MathML, inside which a browser
# tokenises <style> and <![CDATA[ otherwise than in HTML.
_REFUSED_TAGS = frozenset(
    {
        *("script", "iframe", "frame", "frameset", "object", "embed", "applet", "base"),
        *("animate", "set", "svg", "math", "plaintext"),
    }
)
# Elements whose content a browser reads as text up to their end tag, with scripting on.
_RAW_TEXT = frozenset(
    {"script", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "textarea", "title"}
)

_A = re.ASCII
_TAG_NAME = re.compile(r"[A-Za-z][^\t\n\f\r />]*", _A)
_ATTRIBUTE = re.compile(
    r"""[\t\n\f\r /]*([^\t\n\f\r />][^\t\n\f\r />=]*)"""
    r"""(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"?|'([^']*)'?|([^\t\n\f\r >]*)))?""",
    _A,
)
_SCHEME = re.compile(r"^([a-z][a-z0-9+.-]*):", re.IGNORECASE | _A)
_END_TAG_DELIMITER = "\t\n\f\r />"


def _code_point(digits: str, base: int) -> str:
    # What the browser makes of a reference out of Unicode's range. Measured before int(),
    # which refuses a decimal of more than 4300 digits.
    if len(digits.lstrip("0")) > 8:
        return "\ufffd"
    n = int(digits, base)
    return "\ufffd" if n > 0x10FFFF else chr(n)


def is_safe_link(value: str, schemes: Iterable[str]) -> bool:
    """Read as a browser reads an href: entities decoded, control characters ignored."""
    decoded = re.sub(r"&#x([0-9a-f]+);?", lambda m: _code_point(m[1], 16), value, flags=re.I | _A)
    decoded = re.sub(r"&#([0-9]+);?", lambda m: _code_point(m[1], 10), decoded, flags=_A)
    decoded = decoded.replace("&colon;", ":")
    decoded = re.sub(r"&(Tab|NewLine);", "", decoded)
    decoded = re.sub(r"[\x00-\x20]", "", decoded)
    scheme = _SCHEME.match(decoded)
    return scheme is None or scheme[1].lower() in set(schemes)


def unsafe_markup(html: str, schemes: Iterable[str]) -> list[str]:
    """Links with another scheme, on… handlers and elements such as <script>, in order.

    Read as a browser's tokeniser reads HTML: comments, <!…>, <?…> and <style>-like elements
    end where it ends them, so a quote inside one cannot hide what follows.
    """
    found: list[str] = []
    _scan(html, tuple(schemes), found, in_comment=False)
    return found


def _scan(html: str, schemes: tuple[str, ...], found: list[str], *, in_comment: bool) -> None:
    lower = _ascii_lower(html)
    i = html.find("<")
    while i != -1:
        nxt = html[i + 1 : i + 2]
        end = i + 1
        if html.startswith("<!--", i):
            # Its content is read once, as markup, so a comment inside cannot repeat the scan.
            if in_comment:
                end = i + 4
            else:
                content, end = _comment_end(html, i + 4)
                _scan(html[i + 4 : content], schemes, found, in_comment=True)
        elif nxt in ("!", "?") or (nxt == "/" and not _is_letter(html[i + 2 : i + 3])):
            # A bogus comment, <![CDATA[ outside SVG among them: up to the next >.
            close = html.find(">", i)
            end = len(html) if close == -1 else close + 1
        else:
            closing = nxt == "/"
            name_match = _TAG_NAME.match(html, i + 2 if closing else i + 1)
            if name_match:
                name = _ascii_lower(name_match[0])
                if not closing and name in _REFUSED_TAGS:
                    found.append(f"<{name}>")
                end = name_match.end()
                while end < len(html) and html[end] != ">":
                    m = _ATTRIBUTE.match(html, end)
                    if not m or m.end() == end:
                        end += 1
                        continue
                    end = m.end()
                    if closing:
                        continue
                    attribute = _ascii_lower(m[1])
                    value = next((g for g in (m[2], m[3], m[4]) if g is not None), "")
                    if len(attribute) > 2 and attribute.startswith("on"):
                        found.append(attribute)
                    elif attribute in _LINK_ATTRIBUTES and not is_safe_link(value, schemes):
                        found.append(value)
                if not closing and name in _RAW_TEXT:
                    end = _raw_text_end(lower, name, end)
        i = html.find("<", end)


def _ascii_lower(text: str) -> str:
    # As JavaScript's toLowerCase would for ASCII; the patterns above match nothing else anyway.
    return text.translate(_LOWER)


_LOWER = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")


def _is_letter(char: str) -> bool:
    return len(char) == 1 and char.isascii() and char.isalpha()


def _comment_end(html: str, start: int) -> tuple[int, int]:
    """Where a comment's content ends and what follows it starts, as a browser finds them."""
    if html.startswith(">", start):
        return start, start + 1
    if html.startswith("->", start):
        return start, start + 2
    dashes = html.find("-->", start)
    bang = html.find("--!>", start)
    if bang != -1 and (dashes == -1 or bang < dashes):
        return bang, bang + 4
    return (len(html), len(html)) if dashes == -1 else (dashes, dashes + 3)


def _raw_text_end(lower: str, name: str, start: int) -> int:
    """The start of the end tag that closes a <style>-like element, or the end of the input."""
    at = lower.find(f"</{name}", start)
    while at != -1:
        after = lower[at + 2 + len(name) : at + 3 + len(name)]
        if after and after in _END_TAG_DELIMITER:
            break
        at = lower.find(f"</{name}", at + 1)
    return len(lower) if at == -1 else at


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
