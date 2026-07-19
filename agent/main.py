"""FastAPI: endpoint czatu agenta w protokole UI Message Stream (useChat)."""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

import dotenv

dotenv.load_dotenv()

import fastapi
import fastapi.exceptions
import fastapi.middleware.cors
import fastapi.responses
import pydantic

import ai
import email_agent

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

app = fastapi.FastAPI(title="mjml-editor-agent")

app.add_middleware(
    fastapi.middleware.cors.CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(fastapi.exceptions.RequestValidationError)
async def log_validation_errors(
    request: fastapi.Request, exc: fastapi.exceptions.RequestValidationError
) -> fastapi.responses.JSONResponse:
    print(f"[422] {request.method} {request.url.path}: {exc.errors()}", file=sys.stderr, flush=True)
    return fastapi.responses.JSONResponse({"detail": exc.errors()}, status_code=422)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _unwrap(exc: BaseException) -> BaseException:
    """Wyłuskuje właściwy wyjątek z zagnieżdżonych ExceptionGroup (TaskGroup
    w Vercel AI SDK owija błąd providera w kilka warstw grup)."""
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return exc


def _friendly_error(exc: Exception) -> str:
    """Czytelny komunikat błędu dla UI z surowego wyjątku providera."""
    exc = _unwrap(exc)  # type: ignore[assignment]
    name = type(exc).__name__
    if "RateLimit" in name or "429" in str(exc):
        return (
            "Limit zapytań przekroczony (429). Przy tokenie subskrypcyjnym to limit "
            "planu Claude — odczekaj chwilę i spróbuj ponownie, albo użyj klucza API."
        )
    if "Authentication" in name or "401" in str(exc):
        return "Błąd uwierzytelnienia (401) — token/klucz nie został zaakceptowany."
    return f"Błąd agenta: {name}: {str(exc)[:300]}"


class ChatRequest(pydantic.BaseModel):
    messages: list[ai.ui.ai_sdk.UIMessage]
    docId: str


@app.post("/api/chat")
async def chat(request: ChatRequest) -> fastapi.responses.StreamingResponse:
    messages, _approvals = ai.ui.ai_sdk.to_messages(request.messages)
    messages = [ai.system_message(email_agent.SYSTEM), *messages]
    agent = email_agent.build_agent(request.docId)

    async def stream_response() -> AsyncGenerator[str]:
        try:
            async with agent.run(email_agent.get_model(), messages) as result:
                async for chunk in ai.ui.ai_sdk.to_sse(result):
                    yield chunk
        except Exception as exc:  # noqa: BLE001 — chcemy każdy błąd pokazać w UI
            # Bez tego wyjątek w trakcie streamu urywa chunked encoding i front
            # widzi tylko "network error". Zamiast tego wysyłamy czytelny błąd.
            print(f"[chat] błąd streamu: {exc!r}", file=sys.stderr, flush=True)
            from ai.ui.ai_sdk.outbound_stream import format_done_sse, format_sse
            from ai.ui.ai_sdk.ui_events import UIErrorEvent

            yield format_sse(UIErrorEvent(error_text=_friendly_error(exc)))
            yield format_done_sse()

    return fastapi.responses.StreamingResponse(
        stream_response(),
        headers=ai.ui.ai_sdk.UI_MESSAGE_STREAM_HEADERS,
    )
