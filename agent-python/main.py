"""FastAPI: agent chat endpoint speaking the UI Message Stream protocol (useChat).

Same wire contract as `packages/agent-node` — see `docs/agent-contract.md`. Only the
implementation differs, which is the point of keeping this backend around.
"""

from __future__ import annotations

import os
import sys
from typing import TYPE_CHECKING

import dotenv

dotenv.load_dotenv()

import ai
import fastapi
import fastapi.exceptions
import fastapi.middleware.cors
import fastapi.responses
import pydantic

import email_agent
import mjml_compile

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

app = fastapi.FastAPI(title="mjml-agent-editor-python")

# Configurable rather than hardcoded to http://localhost:3000, which was the spike's
# single largest obstacle to running this anywhere but one developer's machine.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    fastapi.middleware.cors.CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def check_prerequisites() -> None:
    """Fails fast if the MJML compiler is missing.

    Without this the service starts happily and every write tool fails on the first
    agent turn, which reads to the user as the model being broken.
    """
    binary = mjml_compile.resolve_mjml_binary()
    print(f"[startup] mjml: {binary}", file=sys.stderr, flush=True)
    print(f"[startup] contract v{email_agent.contract().version}", file=sys.stderr, flush=True)


@app.exception_handler(fastapi.exceptions.RequestValidationError)
async def log_validation_errors(
    request: fastapi.Request, exc: fastapi.exceptions.RequestValidationError
) -> fastapi.responses.JSONResponse:
    print(f"[422] {request.method} {request.url.path}: {exc.errors()}", file=sys.stderr, flush=True)
    return fastapi.responses.JSONResponse({"detail": exc.errors()}, status_code=422)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": os.environ.get("AGENT_MODEL", email_agent.DEFAULT_MODEL)}


def _unwrap(exc: BaseException) -> BaseException:
    """Extracts the real exception from nested ExceptionGroups.

    The SDK's TaskGroup wraps provider errors in several layers of groups, so the
    outermost type says nothing useful.
    """
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return exc


def _friendly_error(exc: Exception) -> str:
    """Readable message for the chat panel, built from the raw provider exception."""
    exc = _unwrap(exc)  # type: ignore[assignment]
    name = type(exc).__name__
    if "RateLimit" in name or "429" in str(exc):
        return "Rate limit reached (429) — wait a moment and try again."
    if "Authentication" in name or "401" in str(exc):
        return "Authentication failed (401) — the API key was not accepted."
    return f"Agent error: {name}: {str(exc)[:300]}"


class ChatRequest(pydantic.BaseModel):
    messages: list[ai.ui.ai_sdk.UIMessage]
    docId: str


@app.post("/api/chat")
async def chat(request: ChatRequest) -> fastapi.responses.StreamingResponse:
    if not request.docId:
        raise fastapi.HTTPException(status_code=400, detail="`docId` is required")

    messages, _approvals = ai.ui.ai_sdk.to_messages(request.messages)
    messages = [ai.system_message(email_agent.SYSTEM), *messages]
    agent = email_agent.build_agent(request.docId)

    async def stream_response() -> AsyncGenerator[str]:
        try:
            async with agent.run(email_agent.get_model(), messages) as result:
                async for chunk in ai.ui.ai_sdk.to_sse(result):
                    yield chunk
        except Exception as exc:
            # An exception mid-stream truncates the chunked response and the browser
            # only reports "network error", so the failure is emitted as a stream event.
            print(f"[chat] stream error: {exc!r}", file=sys.stderr, flush=True)
            from ai.ui.ai_sdk.outbound_stream import format_done_sse, format_sse
            from ai.ui.ai_sdk.ui_events import UIErrorEvent

            yield format_sse(UIErrorEvent(error_text=_friendly_error(exc)))
            yield format_done_sse()

    return fastapi.responses.StreamingResponse(
        stream_response(),
        headers=ai.ui.ai_sdk.UI_MESSAGE_STREAM_HEADERS,
    )
