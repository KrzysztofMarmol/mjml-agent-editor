"""The tools run their blocking calls off the event loop, which every chat stream shares."""

from __future__ import annotations

import asyncio
import time

import pytest

import tools

DOC = (
    "<mjml><mj-body>"
    "<mj-section css-class='sec-aaa'><mj-column><mj-text>One</mj-text></mj-column></mj-section>"
    "<mj-section css-class='sec-bbb'><mj-column><mj-text>Two</mj-text></mj-column></mj-section>"
    "</mj-body></mjml>"
)


class FakeDb:
    def __init__(self) -> None:
        self.mjml = DOC
        self.comments = [
            {"id": "c1", "section_id": "aaa"},
            {"id": "c2", "section_id": "bbb"},
        ]

    def get_document_mjml(self, doc_id: str) -> str:
        return self.mjml

    def set_document_mjml(self, doc_id: str, mjml: str) -> None:
        self.mjml = mjml

    def list_comments(self, doc_id: str) -> list[dict]:
        return list(self.comments)

    def delete_comment(self, comment_id: str) -> None:
        self.comments = [c for c in self.comments if c["id"] != comment_id]


@pytest.fixture
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    fake = FakeDb()
    for name in ("get_document_mjml", "set_document_mjml", "list_comments", "delete_comment"):
        monkeypatch.setattr(tools.db, name, getattr(fake, name))
    return fake


def _tool(name: str):
    return {tool.name: tool for tool in tools.build_tools("doc-1")}[name].fn


def test_a_slow_compile_does_not_stall_the_event_loop(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    def slow_compile(mjml: str) -> tuple[bool, str]:
        time.sleep(0.3)  # what a real mjml subprocess does to its caller
        return True, "<html/>"

    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", slow_compile)

    async def scenario() -> tuple[str, int]:
        ticks = 0

        async def other_stream() -> None:
            nonlocal ticks
            while True:
                ticks += 1
                await asyncio.sleep(0.01)

        ticker = asyncio.create_task(other_stream())
        result = await _tool("remove_section")(section_id="bbb")
        ticker.cancel()
        return result, ticks

    result, ticks = asyncio.run(scenario())

    assert result.startswith("OK")
    # Blocked, the other coroutine would get one tick; free, it gets about thirty.
    assert ticks > 10


def test_remove_section_saves_and_prunes_through_the_thread(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))

    result = asyncio.run(_tool("remove_section")(section_id="bbb"))

    assert result == "OK, saved. Removed 1 comment(s) whose section no longer exists."
    assert "sec-bbb" not in db.mjml
    assert [c["id"] for c in db.comments] == ["c1"]


def test_an_invalid_document_is_not_saved(db: FakeDb, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (False, "bad tag"))

    result = asyncio.run(_tool("remove_section")(section_id="bbb"))

    assert result.startswith("ERROR: MJML validation failed — document was NOT saved")
    assert db.mjml == DOC
    assert len(db.comments) == 2
