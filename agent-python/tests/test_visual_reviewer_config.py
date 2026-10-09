"""Resolving the VISUAL_REVIEWER setting."""

from __future__ import annotations

import sys
import types

import pytest

import main


class _Reviewer:
    async def review(self, request) -> str:
        return "ok"


@pytest.fixture
def module(monkeypatch: pytest.MonkeyPatch) -> types.ModuleType:
    fake = types.ModuleType("fake_reviewers")
    fake.instance = _Reviewer()
    fake.Reviewer = _Reviewer
    fake.factory = lambda: _Reviewer()
    fake.not_a_reviewer = object()
    monkeypatch.setitem(sys.modules, "fake_reviewers", fake)
    return fake


@pytest.mark.parametrize("spec", [None, "", "   "])
def test_unset_means_no_reviewer(spec: str | None) -> None:
    assert main.load_visual_reviewer(spec) is None


def test_names_an_instance(module: types.ModuleType) -> None:
    assert main.load_visual_reviewer("fake_reviewers:instance") is module.instance


@pytest.mark.parametrize("name", ["Reviewer", "factory"])
def test_builds_from_a_class_or_factory(module: types.ModuleType, name: str) -> None:
    assert isinstance(main.load_visual_reviewer(f"fake_reviewers:{name}"), _Reviewer)


def test_refuses_a_malformed_name() -> None:
    with pytest.raises(RuntimeError, match="module:name"):
        main.load_visual_reviewer("fake_reviewers")


def test_refuses_something_that_cannot_review(module: types.ModuleType) -> None:
    with pytest.raises(RuntimeError, match="review"):
        main.load_visual_reviewer("fake_reviewers:not_a_reviewer")
