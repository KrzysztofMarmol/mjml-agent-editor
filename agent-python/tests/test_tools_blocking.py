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
            {"id": "c1", "section_id": "aaa", "status": "open"},
            {"id": "c2", "section_id": "bbb", "status": "resolved"},
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
        time.sleep(0.3)
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


def test_a_refused_rewrite_counts_the_resolved_comments_it_would_delete(db: FakeDb) -> None:
    result = asyncio.run(_tool("set_document")(mjml=DOC))

    assert "2 comment(s) anchored to them (1 open, 1 resolved)" in result
    assert db.mjml == DOC


TABLE = "<mj-section><mj-column><mj-table><tr><td>Mug</td></tr></mj-table></mj-column></mj-section>"


def test_a_table_the_editor_cannot_edit_is_not_saved(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))

    result = asyncio.run(_tool("set_section")(section_id="aaa", mjml=TABLE))

    assert result.startswith("ERROR: <mj-table> cannot be used")
    assert db.mjml == DOC


def test_a_table_already_in_the_document_does_not_block_other_edits(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))
    db.mjml = DOC.replace("</mj-body>", TABLE + "</mj-body>")

    result = asyncio.run(_tool("remove_section")(section_id="bbb"))

    assert result.startswith("OK")


def test_a_commented_out_table_does_not_let_a_real_one_in(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))
    db.mjml = DOC.replace("</mj-body>", "<!-- <mj-table> --></mj-body>")

    rebuilt = f"<mjml><mj-body>{TABLE}</mj-body></mjml>"
    result = asyncio.run(_tool("set_document")(mjml=rebuilt, confirm_full_rewrite=True))

    assert result.startswith("ERROR: <mj-table> cannot be used")


def test_a_table_between_values_that_look_like_a_comment_is_counted(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, "<html/>"))
    hidden = (
        '<mj-section css-class="<!--"><mj-column><mj-table><tr><td>1</td></tr></mj-table>'
        '<mj-text css-class="-->">x</mj-text></mj-column></mj-section>'
    )

    result = asyncio.run(_tool("set_section")(section_id="aaa", mjml=hidden))

    assert result.startswith("ERROR: <mj-table> cannot be used")


def test_a_link_a_mail_client_could_run_is_not_saved(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The guard reads the compiled email; here the source stands in for it.
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, mjml))
    section = (
        "<mj-section><mj-column><mj-text><a href='javascript:alert(1)'>Hi</a>"
        "<img src='x' onerror='alert(2)'></mj-text></mj-column></mj-section>"
    )

    result = asyncio.run(_tool("set_section")(section_id="aaa", mjml=section))

    assert result.startswith('ERROR: "javascript:alert(1)", "onerror" cannot be in an email')
    assert db.mjml == DOC


def test_an_unsafe_link_already_in_the_document_does_not_block_other_edits(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tools.mjml_compile, "compile_mjml", lambda mjml: (True, mjml))
    old = (
        "<mj-section><mj-column><mj-button href='javascript:x()'>Old</mj-button>"
        "<mj-text><a href='https://a.com/&#99999999;'>Far</a></mj-text></mj-column></mj-section>"
    )
    db.mjml = DOC.replace("</mj-body>", old + "</mj-body>")

    result = asyncio.run(_tool("remove_section")(section_id="bbb"))

    assert result.startswith("OK")
