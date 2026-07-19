"""FastAPI: agent chat endpoint speaking the UI Message Stream protocol (useChat)."""

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
    """Extracts the actual exception from nested ExceptionGroups (the TaskGroup
    in the Vercel AI SDK wraps the provider error in several layers of groups)."""
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return exc


def _friendly_error(exc: Exception) -> str:
    """Readable error message for the UI built from the raw provider exception."""
    exc = _unwrap(exc)  # type: ignore[assignment]
    name = type(exc).__name__
    if "RateLimit" in name or "429" in str(exc):
        return (
            "Rate limit exceeded (429). With a subscription token this is the Claude "
            "plan limit — wait a moment and try again, or use an API key."
        )
    if "Authentication" in name or "401" in str(exc):
        return "Authentication error (401) — the token/key was not accepted."
    return f"Agent error: {name}: {str(exc)[:300]}"


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
        except Exception as exc:  # noqa: BLE001 — we want every error surfaced in the UI
            # Without this, an exception mid-stream cuts the chunked encoding short
            # and the frontend only sees "network error". Send a readable error instead.
            print(f"[chat] stream error: {exc!r}", file=sys.stderr, flush=True)
            from ai.ui.ai_sdk.outbound_stream import format_done_sse, format_sse
            from ai.ui.ai_sdk.ui_events import UIErrorEvent

            yield format_sse(UIErrorEvent(error_text=_friendly_error(exc)))
            yield format_done_sse()

    return fastapi.responses.StreamingResponse(
        stream_response(),
        headers=ai.ui.ai_sdk.UI_MESSAGE_STREAM_HEADERS,
    )
