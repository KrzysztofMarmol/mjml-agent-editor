# Python agent backend

FastAPI implementation of the agent contract. It exists to keep the contract honest: if a
tool can only be described in TypeScript, it was never a contract.

Tool names, descriptions, argument schemas and the system prompt all come from
`packages/agent-core/contract/tools.json`. `tests/test_contract.py` fails if this
implementation drifts from it, and `tools.py` refuses to import on a signature mismatch.

## Running

```bash
cp .env.example .env      # SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
uv sync
uv run uvicorn main:app --port 8002
```

Then point the frontend's `NEXT_PUBLIC_AGENT_URL` at `http://localhost:8002` and set
`ALLOWED_ORIGINS` to the frontend's origin.

```bash
uv run pytest        # 43 tests
uv run ruff check .
```

## The mjml binary

This backend shells out to the **mjml v4 CLI**, resolved from `MJML_BIN` or `PATH`. That is
a real dependency on Node, and it is deliberate.

The obvious alternative is `mjml-python`, which wraps MRML — a Rust port of MJML — and would
remove Node entirely. It cannot be used: **MRML does not validate**. Measured against 1.4.1,
it accepts an unknown element (`<mj-bogus/>`) and an illegal attribute (`text-align` on
`mj-text`), both of which mjml v4 rejects in strict mode, and its API exposes no validation
level to switch on.

Validation is not incidental here. The contract's first rule is that a document which does
not compile is never persisted, and that guard does real work — in live testing the model
wrote an illegal attribute, the write was refused, and it corrected itself from the compiler
message. On MRML that write would have been saved and the email would have rendered wrong.
mjml v4 is also what `grapesjs-mjml` runs in the browser, so using it keeps the editor's
preview and this backend's verdict aligned.

## Why the prompt differs from the TypeScript backend

The shared system prompt is identical. What differs is that the MJML-taking tools here have
an extra line telling the model to keep MJML on one line with single-quoted attributes.

That is not a style preference: the Vercel AI SDK for Python replaces malformed tool-call
argument JSON with `{}`, so a multi-line argument silently arrives empty. The TypeScript SDK
parses streamed arguments incrementally and was verified not to need it — asked for
multi-line MJML, a model produced 14 newlines that arrived intact and compiled. The hint
therefore lives on this implementation, not in the contract.
