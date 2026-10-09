"""The reviewer a host passes to create_app reaches the agent built for each turn."""

from __future__ import annotations

import fastapi.testclient
import pytest

import main


class _Reviewer:
    async def review(self, request) -> str:
        return "ok"


@pytest.fixture
def built(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, object]]:
    calls: list[tuple[str, object]] = []

    def build_agent(doc_id: str, visual_reviewer: object) -> object:
        calls.append((doc_id, visual_reviewer))
        return object()  # fails inside the stream, which reports it as an event

    monkeypatch.setattr(main.email_agent, "build_agent", build_agent)
    return calls


def _chat(app: fastapi.FastAPI) -> None:
    response = fastapi.testclient.TestClient(app).post(
        "/api/chat", json={"messages": [], "docId": "doc-1"}
    )
    assert response.status_code == 200


def test_passes_the_hosts_reviewer_to_the_agent(built: list[tuple[str, object]]) -> None:
    reviewer = _Reviewer()
    _chat(main.create_app(visual_reviewer=reviewer))
    assert built == [("doc-1", reviewer)]


def test_runs_without_a_reviewer_by_default(built: list[tuple[str, object]]) -> None:
    _chat(main.create_app())
    assert built == [("doc-1", None)]
