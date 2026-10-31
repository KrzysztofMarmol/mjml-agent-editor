"""The shared cases agent-core's links.test.ts runs too, so both backends refuse the same writes."""

import json
import pathlib
import time

import pytest

from links import added_items, describe_items, is_safe_link, unsafe_markup

SCHEMES = ("http", "https", "mailto", "tel", "sms")
CASES = json.loads(
    (
        pathlib.Path(__file__).parents[2] / "packages/agent-core/contract/unsafe-markup-cases.json"
    ).read_text(encoding="utf-8")
)


def test_safe_links() -> None:
    for link in ["https://a.com", "mailto:a@b.c", "tel:+48123", "/x", "{{url}}", "#top", ""]:
        assert is_safe_link(link, SCHEMES), link


def test_scripts_however_a_browser_reads_them() -> None:
    for link in ["javascript:alert(1)", " java\tscript:x", "&#106;avascript:x", "vbscript:x"]:
        assert not is_safe_link(link, SCHEMES), link


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_case(case: dict) -> None:
    assert unsafe_markup(case["html"], SCHEMES) == case["expected"]


def test_linear_time() -> None:
    html = '<a href=x "' * 25_000 + "<mj-navbar" * 25_000
    start = time.perf_counter()
    unsafe_markup(html, SCHEMES)
    assert time.perf_counter() - start < 2


def test_only_additions_count() -> None:
    assert added_items(["a", "b", "a"], ["a"]) == ["b", "a"]
    assert added_items(["a"], ["a", "a"]) == []


def test_description_is_bounded() -> None:
    items = ["x" * 100, *[f"l{i % 6}" for i in range(8)]]
    assert describe_items(items) == f'"{"x" * 60}…", "l0", "l1", "l2", "l3" and 2 more'
