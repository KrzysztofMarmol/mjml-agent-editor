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


class ChatRequest(pydantic.BaseModel):
    messages: list[ai.ui.ai_sdk.UIMessage]
    docId: str


@app.post("/api/chat")
async def chat(request: ChatRequest) -> fastapi.responses.StreamingResponse:
    messages, _approvals = ai.ui.ai_sdk.to_messages(request.messages)
    messages = [ai.system_message(email_agent.SYSTEM), *messages]
    agent = email_agent.build_agent(request.docId)

    async def stream_response() -> AsyncGenerator[str]:
        async with agent.run(email_agent.get_model(), messages) as result:
            async for chunk in ai.ui.ai_sdk.to_sse(result):
                yield chunk

    return fastapi.responses.StreamingResponse(
        stream_response(),
        headers=ai.ui.ai_sdk.UI_MESSAGE_STREAM_HEADERS,
    )
